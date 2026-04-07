from pony.orm import db_session, select
from fastapi import HTTPException
from src import models, schemas
from datetime import datetime, date
from typing import List
from src.services.caja_services import CajaDiariaServices
from src.services.sucursal_services import SucursalServices

_sucursal_svc = SucursalServices()


class CreditosServices:
    def __init__(self):
        pass

    def create_credito(self, credito_data: schemas.CreditoCreate, sucursal_id: int) -> dict:
        with db_session:
            try:
                sucursal = models.Sucursal.get(id=sucursal_id)
                if not sucursal:
                    raise HTTPException(status_code=404, detail="Sucursal no encontrada")
                # Cliente: el front envía el id del cliente (como string)
                try:
                    cliente_id = int(credito_data.cliente)
                except (ValueError, TypeError):
                    raise HTTPException(status_code=400, detail="Cliente inválido")
                cliente_entity = models.Cliente.get(id=cliente_id)
                if not cliente_entity:
                    raise HTTPException(status_code=404, detail="Cliente no encontrado")
                credito_existente = models.CreditoPersonal.get(
                    cliente=cliente_entity, sucursal=sucursal, estado="Activo"
                )
                if credito_existente:
                    raise HTTPException(
                        status_code=400,
                        detail="El cliente ya posee un crédito activo en esta sucursal. Diríjase al detalle del crédito para agregar productos.",
                    )
                credito = models.CreditoPersonal(
                    sucursal=sucursal,
                    cliente=cliente_entity,
                    fecha_credito=credito_data.fecha,
                    entrega_inicial=credito_data.entrega_inicial,
                    saldo_pendiente=credito_data.saldo_pendiente,
                    metodo_pago=credito_data.metodo_pago,
                    estado="Activo",
                )

                total_credito = 0  # Inicializamos el total

                # Asociar productos al crédito
                for item in credito_data.productos:
                    producto = models.Product.get(id=item.producto_id)
                    if not producto:
                        raise HTTPException(status_code=404, detail=f"Producto con ID {item.producto_id} no encontrado")
                    
                    if producto.stock < item.cantidad:
                        raise HTTPException(status_code=400, detail=f"Stock insuficiente para el producto {producto.nombre}")
                    
                    precio_unitario = producto.precio_venta

                    models.CreditoProducto(
                        credito=credito,
                        producto=producto,
                        cantidad=item.cantidad,
                        subtotal=item.cantidad * precio_unitario
                    )

                    producto.stock -= item.cantidad

                    total_credito += item.cantidad * precio_unitario

                # Actualizar saldo pendiente
                credito.saldo_pendiente = total_credito - credito.entrega_inicial
                credito.total = total_credito

                # Registrar entrega inicial en caja diaria (no bloquea el crédito si falla)
                if credito.entrega_inicial and credito.entrega_inicial > 0:
                    try:
                        nombre_cliente = f"{credito.cliente.nombre} {credito.cliente.apellido}".strip() or "Cliente"
                        caja_service = CajaDiariaServices()
                        caja_service.registrar_ingreso(
                            monto=credito.entrega_inicial,
                            origen=models.OrigenMovimientoCaja.PAGO_CREDITO.value,
                            sucursal_id=sucursal_id,
                            referencia_id=credito.id,
                            descripcion=f"Crédito #{credito.id} - {nombre_cliente} - Entrega inicial ${credito.entrega_inicial:,.0f}",
                            fecha=credito.fecha_credito,
                        )
                    except Exception as caja_err:
                        print(f"Advertencia: no se pudo registrar entrega inicial en caja: {caja_err}")

                return {"message": "Crédito creado correctamente", "credito_id": credito.id}

            except HTTPException as e:
                raise e
            except Exception as e:
                print(f"Error al registrar el crédito: {e}")
                raise HTTPException(status_code=500, detail="Error al registrar el crédito.")


    def get_credito_by_id(self, credito_id: int):
        with db_session:
            credito = models.CreditoPersonal.get(id=credito_id)
            if not credito:
                raise HTTPException(status_code=404, detail="Crédito no encontrado")
            
            # Construcción del diccionario con la información del crédito
            credito_dict = {
                "id": credito.id,
                "fecha": credito.fecha_credito.strftime("%Y-%m-%d"),  # Convertir a string
                "cliente": f"{credito.cliente.nombre} {credito.cliente.apellido}",  # Nombre completo del cliente
                "productos": [],
                "entrega_inicial": credito.entrega_inicial,
                "saldo_pendiente": credito.saldo_pendiente,
                "metodo_pago": credito.metodo_pago,
                "estado": credito.estado,
                "fecha_credito": credito.fecha_credito.strftime("%Y-%m-%d")  # Fecha en string
            }

            # Agregar productos relacionados al crédito
            for item in credito.productos:
                producto = item.producto
                if producto:
                    credito_dict["productos"].append({
                        "id": item.id,
                        "producto_id": producto.id,
                        "nombre": producto.nombre,
                        "cantidad": item.cantidad,
                        "precio_unitario": producto.precio_venta,
                        "subtotal": item.subtotal
                    })

            return credito_dict

    def _filtrar_creditos_por_sucursal(self, sucursal_id: int):
        """Filtra créditos por sucursal_id sin comparar entidades (Pony). Incluye None si es sucursal default."""
        default_id = _sucursal_svc.get_or_create_default_sucursal_id()
        # Evitamos `order_by(desc(...))` en Render porque puede disparar problemas de
        # serialización/pickling en ciertos entornos. Ordenamos en Python.
        todos = list(models.CreditoPersonal.select())
        todos.sort(key=lambda c: c.fecha_credito or date.min, reverse=True)
        if sucursal_id == default_id:
            return [c for c in todos if c.sucursal is None or (c.sucursal is not None and c.sucursal.id == sucursal_id)]
        return [c for c in todos if c.sucursal is not None and c.sucursal.id == sucursal_id]

    def get_all_creditos(self, sucursal_id: int | None = None):
        with db_session:
            try:
                if sucursal_id is not None:
                    if not models.Sucursal.get(id=sucursal_id):
                        raise HTTPException(status_code=404, detail="Sucursal no encontrada")
                    creditos = self._filtrar_creditos_por_sucursal(sucursal_id)
                else:
                    creditos = list(models.CreditoPersonal.select())
                    creditos.sort(key=lambda c: c.fecha_credito or date.min, reverse=True)
                result = []
                for credito in creditos:
                    # Aseguramos que el cliente tiene una relación válida
                    if not credito.cliente:
                        raise HTTPException(status_code=500, detail=f"El crédito con ID {credito.id} no tiene cliente asociado")
                    
                    # Agregamos los datos necesarios a la respuesta
                    credito_dict = {
                        "id": credito.id,
                        "cliente": f"{credito.cliente.nombre} {credito.cliente.apellido}", # Usamos el ID del cliente como string
                        "fecha_inicio": credito.fecha_credito.strftime("%Y-%m-%d"),
                        "saldo_pendiente": credito.saldo_pendiente,
                        "estado": credito.estado  # Verifica si el campo 'estado' existe en tu modelo
                    }
                    result.append(credito_dict)
                
                return result
            except Exception as e:
                # Logueamos el error para tener más detalles
                print(f"Error al obtener los créditos: {e}")
                raise HTTPException(
                    status_code=500,
                    detail=f"{type(e).__name__}: {str(e)}",
                )


    def delete_credito(self, credito_id: int) -> dict:
        with db_session:
            credito = models.CreditoPersonal.get(id=credito_id)
            if not credito:
                raise HTTPException(status_code=404, detail="Crédito no encontrado")
            
            for item in credito.productos:
                producto = item.producto
                if producto:
                    producto.stock += item.cantidad
            
            deleted_id = credito.id
            credito.delete()
            
            return {"message": f"Crédito #{deleted_id} eliminado correctamente"}
    

    def add_productos_to_credito(self, credito_id: int, productos: List[schemas.ProductoCreditoItem]) -> dict:
        with db_session:
            credito = models.CreditoPersonal.get(id=credito_id)

            if not credito:
                raise HTTPException(status_code=404, detail="Crédito no encontrado")

            if credito.estado != "Activo":
                raise HTTPException(status_code=400, detail="Solo se pueden agregar productos a créditos activos")

            total_credito = credito.total or 0  # Por si el campo aún no tiene valor

            for item in productos:
                producto = models.Product.get(id=item.producto_id)
                if not producto:
                    raise HTTPException(status_code=404, detail=f"Producto con ID {item.producto_id} no encontrado")
                
                if producto.stock < item.cantidad:
                    raise HTTPException(status_code=400, detail=f"Stock insuficiente para el producto {producto.nombre}")

                precio_unitario = producto.precio_venta

                credito_producto = models.CreditoProducto.get(credito=credito, producto=producto)
                
                if credito_producto:
                    credito_producto.cantidad += item.cantidad
                    credito_producto.subtotal += item.cantidad * precio_unitario
                else:
                    models.CreditoProducto(
                        credito=credito,
                        producto=producto,
                        cantidad=item.cantidad,
                        subtotal=item.cantidad * precio_unitario
                    )

                # Actualizar stock
                producto.stock -= item.cantidad

                # Sumar al total
                total_credito += item.cantidad * precio_unitario

            # Recalcular pagos realizados (incluye entrega inicial + otros pagos)
            pagos_realizados = sum(pago.monto for pago in credito.pagos) + (credito.entrega_inicial or 0)

            credito.total = total_credito
            credito.saldo_pendiente = total_credito - pagos_realizados


            return {"message": "Productos agregados correctamente al crédito", "credito_id": credito.id}

    def registrar_pago(self, credito_id: int, monto: float, fecha_pago: date) -> dict:
        with db_session:
            credito = models.CreditoPersonal.get(id=credito_id)

            if not credito:
                raise HTTPException(status_code=404, detail="Crédito no encontrado")

            if credito.estado != "Activo":
                raise HTTPException(status_code=400, detail="Este crédito no está activo")

            if monto <= 0:
                raise HTTPException(status_code=400, detail="El monto del pago debe ser mayor a 0")

            if monto > credito.saldo_pendiente:
                raise HTTPException(status_code=400, detail="El monto del pago excede el saldo pendiente")

            # Registrar el pago
            pago = models.PagoCredito(
                credito=credito,
                monto=monto,
                fecha_pago=fecha_pago  # Fecha del pago
            )

            # Actualizar el saldo pendiente
            credito.saldo_pendiente -= monto

            # Verificar si ya está completamente pagado
            if credito.saldo_pendiente <= 0:
                credito.estado = "Pagado"

            # Registrar ingreso en caja diaria
            nombre_cliente = f"{credito.cliente.nombre} {credito.cliente.apellido}".strip() or "Cliente"
            try:
                sucursal_id = credito.sucursal.id if credito.sucursal else None
                if sucursal_id is None:
                    sucursal_id = _sucursal_svc.get_or_create_default_sucursal_id()
                caja_service = CajaDiariaServices()
                caja_service.registrar_ingreso(
                    monto=monto,
                    origen=models.OrigenMovimientoCaja.PAGO_CREDITO.value,
                    sucursal_id=sucursal_id,
                    referencia_id=pago.id,
                    descripcion=f"Crédito #{credito.id} - {nombre_cliente} - Pago ${monto:,.0f}",
                    fecha=fecha_pago,
                )
            except HTTPException as e:
                raise e

            return {
                "message": "Pago registrado exitosamente",
                "nuevo_saldo": credito.saldo_pendiente,
                "estado_credito": credito.estado
            }
        
    def get_pagos_por_credito(self, credito_id: int) -> list[dict]:
        try:
            with db_session:
                # Verificamos que el crédito exista
                credito = models.CreditoPersonal.get(id=credito_id)
                if not credito:
                    raise HTTPException(status_code=404, detail="Crédito no encontrado")
                
                # Consultamos todos los pagos asociados a este crédito
                pagos = list(credito.pagos.order_by(lambda p: p.fecha_pago))
                
                # Convertimos los pagos a formato de respuesta
                resultado = []
                for pago in pagos:
                    # Convertimos date a datetime para compatibilidad con el esquema
                    fecha_como_datetime = datetime.combine(pago.fecha_pago, datetime.min.time())
                    
                    item = {
                        "id": pago.id,
                        "monto": pago.monto,
                        "fecha_pago": fecha_como_datetime
                    }
                    resultado.append(item)
                
                return resultado
        except HTTPException as e:
            raise e
        except Exception as e:
            import traceback
            print(f"Error en get_pagos_por_credito: {e}")
            print(traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"Error inesperado al obtener los pagos: {str(e)}")
        
    def eliminar_pago(self, pago_id: int) -> dict:
        with db_session:
            # Buscar el pago
            pago = models.PagoCredito.get(id=pago_id)
            if not pago:
                raise HTTPException(status_code=404, detail="Pago no encontrado")
            
            credito = pago.credito
            if not credito:
                raise HTTPException(status_code=500, detail="El pago no tiene crédito asociado")

            # Sumar el monto al saldo pendiente
            credito.saldo_pendiente += pago.monto

            # Si estaba pagado y ahora vuelve a tener saldo, se marca como Activo
            if credito.estado == "Pagado":
                credito.estado = "Activo"

            # Guardar el ID antes de eliminar
            pago_id_eliminado = pago.id

            # Eliminar el pago
            pago.delete()

            return {
                "message": f"Pago #{pago_id_eliminado} eliminado correctamente",
                "nuevo_saldo": credito.saldo_pendiente,
                "estado_credito": credito.estado
            }
    
    def eliminar_producto(self, producto_id: int):
        with db_session:
            producto = models.CreditoProducto.get(id=producto_id)

            if not producto:
                raise HTTPException(status_code=404, detail="Producto no encontrado.")

            credito = producto.credito
            producto_base = producto.producto  # Accedemos al producto original
            monto_producto_unitario = producto.subtotal / producto.cantidad  # Precio unitario real

            # Restar saldo pendiente y total del crédito
            credito.saldo_pendiente -= monto_producto_unitario
            credito.total -= monto_producto_unitario

            # Devolver 1 al stock
            producto_base.stock += 1

            # Si hay más de uno, restamos solo 1 unidad
            if producto.cantidad > 1:
                producto.cantidad -= 1
                producto.subtotal -= monto_producto_unitario
            else:
                producto.delete()

            return {
                "message": "Producto eliminado correctamente.",
                "nuevo_saldo": credito.saldo_pendiente,
                "nuevo_total": credito.total
            }

    def get_total_creditos(self, sucursal_id: int | None = None) -> float:
        """Suma de total de todos los créditos (monto total del crédito)."""
        with db_session:
            if sucursal_id is None:
                creditos = list(models.CreditoPersonal.select())
            else:
                if not models.Sucursal.get(id=sucursal_id):
                    return 0.0
                creditos = self._filtrar_creditos_por_sucursal(sucursal_id)
            return sum(float(c.total or 0) for c in creditos)

    def get_cantidad_creditos(self, sucursal_id: int | None = None) -> int:
        """Cantidad de créditos."""
        with db_session:
            if sucursal_id is None:
                creditos = list(models.CreditoPersonal.select())
            else:
                if not models.Sucursal.get(id=sucursal_id):
                    return 0
                creditos = self._filtrar_creditos_por_sucursal(sucursal_id)
            return len(creditos)

    def get_deuda_total(self, sucursal_id: int | None = None) -> float:
        """Suma de saldo pendiente de todos los créditos."""
        with db_session:
            if sucursal_id is None:
                creditos = list(models.CreditoPersonal.select())
            else:
                if not models.Sucursal.get(id=sucursal_id):
                    return 0.0
                creditos = self._filtrar_creditos_por_sucursal(sucursal_id)
            return sum(float(c.saldo_pendiente or 0) for c in creditos)

    def get_estadisticas_por_sucursal(self) -> list:
        """Para OWNER: total_creditos, cantidad_creditos, deuda_total por sucursal."""
        with db_session:
            try:
                sucursales = list(models.Sucursal.select())
                resultado = []
                for s in sucursales:
                    creditos = self._filtrar_creditos_por_sucursal(s.id)
                    total_creditos = sum(float(c.total or 0) for c in creditos)
                    cantidad = len(creditos)
                    deuda = sum(float(c.saldo_pendiente or 0) for c in creditos)
                    resultado.append({
                        "sucursal_id": s.id,
                        "sucursal_nombre": s.nombre,
                        "total_creditos": total_creditos,
                        "cantidad_creditos": cantidad,
                        "deuda_total": deuda,
                    })
                return resultado
            except Exception as e:
                print(f"Error al obtener estadísticas de créditos por sucursal: {e}")
                raise HTTPException(status_code=500, detail="Error inesperado al obtener estadísticas por sucursal.")