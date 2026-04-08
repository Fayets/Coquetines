from pony.orm import db_session
from fastapi import HTTPException
from src import models, schemas
from pony.orm.core import TransactionIntegrityError
from datetime import datetime, date
from src.services.caja_services import CajaDiariaServices
from src.services.sucursal_services import SucursalServices

_sucursal_svc = SucursalServices()

class VentasServices:
    def init(self):
        pass

    def create_venta(self, venta_data: schemas.VentaCreate, sucursal_id: int) -> dict:
        with db_session:
            try:
                sucursal = models.Sucursal.get(id=sucursal_id)
                if not sucursal:
                    raise HTTPException(status_code=404, detail="Sucursal no encontrada")
                venta = models.Venta(
                    sucursal=sucursal,
                    cliente=venta_data.cliente,
                    fecha=date.today(),
                    metodo_pago=venta_data.metodo_pago,
                    total=0,
                )
                
                total_venta = 0
                
                # Asociar productos a la venta
                for item in venta_data.productos:
                    producto = models.Product.get(id=item.producto_id)
                    if not producto:
                        raise HTTPException(status_code=404, detail=f"Producto con ID {item.producto_id} no encontrado")
                    
                    # Verificar si hay stock suficiente
                    if producto.stock < item.cantidad:
                        raise HTTPException(status_code=400, detail=f"Stock insuficiente para el producto {producto.nombre} - Stock actual: {producto.stock}")
                    
                    # Determinar el precio unitario según el método de pago
                    if venta.metodo_pago in ["Efectivo", "Transferencia"]:
                        precio_unitario = (producto.precio_et if producto.precio_et is not None else producto.precio_venta) or 0.0
                    else:
                        precio_unitario = (producto.precio_venta if producto.precio_venta is not None else producto.precio_et) or 0.0
                    precio_unitario = float(precio_unitario)
                    
                    # Crear la relación entre la venta y el producto
                    models.VentaProducto(
                        venta=venta,
                        producto=producto,
                        cantidad=item.cantidad,
                        subtotal=item.cantidad * precio_unitario
                    )
                    
                    # Reducir el stock
                    producto.stock -= item.cantidad
                    
                    # Sumar al total de la venta
                    total_venta += item.cantidad * precio_unitario
                
                # Asignar el total a la venta
                venta.total = total_venta

                try:
                    caja_service = CajaDiariaServices()
                    cliente_str = str(venta.cliente or "").strip() or "Consumidor Final"
                    descripcion = f"Venta #{venta.id} - {cliente_str} - {venta.metodo_pago} - ${total_venta:,.0f}"
                    caja_service.registrar_ingreso(
                        monto=total_venta,
                        origen=models.OrigenMovimientoCaja.VENTA.value,
                        sucursal_id=sucursal_id,
                        referencia_id=venta.id,
                        descripcion=descripcion,
                        fecha=venta.fecha,
                    )
                except Exception as caja_err:
                    print(f"Advertencia: no se pudo registrar en caja diaria: {caja_err}")

                return {"message": "Venta registrada correctamente", "venta_id": venta.id}

            except HTTPException as e:
                raise e  # Relanzar la excepción de HTTP con su mensaje

            except Exception as e:
                import traceback
                tb = traceback.format_exc()
                print(f"Error al registrar la venta: {e}\n{tb}")
                raise HTTPException(status_code=500, detail=f"Error al registrar la venta: {str(e)}")

    def get_venta_by_id(self, venta_id: int):
        with db_session:
            try:
                venta = models.Venta.get(id=venta_id)
                if not venta:
                    raise HTTPException(status_code=404, detail="Venta no encontrada")
                
                venta_dict = {
                    "id": venta.id,
                    "fecha": venta.fecha.strftime("%Y-%m-%d"),
                    "total": venta.total,
                    "cliente": venta.cliente,
                    "metodo_pago": venta.metodo_pago,
                    "productos": []
                }
                
                for item in venta.productos:
                    producto = item.producto
                    if producto:
                        producto_dict = {
                            "id": item.id,
                            "producto_id": producto.id,
                            "codigo": producto.codigo,  # Agregamos el código del producto
                            "nombre": producto.nombre,
                            "cantidad": item.cantidad,
                            "precio_unitario": producto.precio_venta,
                            "subtotal": item.subtotal
                        }
                        venta_dict["productos"].append(producto_dict)
                    
                return venta_dict
                
            except Exception as e:
                import traceback
                error_details = traceback.format_exc()
                print(f"Error al obtener la venta: {e}\n{error_details}")
                raise HTTPException(status_code=500, detail=f"Error al obtener la venta: {str(e)}")


    def get_all_ventas(self, sucursal_id: int | None = None):
        with db_session:
            try:
                # Importante: evitamos `order_by(desc(...))` de Pony en Render porque
                # en algunos entornos dispara un error de serialización/pickling
                # (ej: "cannot pickle 'itertools.count' object").
                # Alternativa: traemos sin orden y ordenamos en Python.
                all_ventas = list(models.Venta.select())
                all_ventas.sort(key=lambda v: v.fecha or date.min, reverse=True)
                if sucursal_id is not None:
                    sid = int(sucursal_id)
                    if not models.Sucursal.get(id=sid):
                        raise HTTPException(status_code=404, detail="Sucursal no encontrada")
                    default_id = _sucursal_svc.get_or_create_default_sucursal_id()
                    if sid == default_id:
                        ventas = [v for v in all_ventas if v.sucursal is None or (v.sucursal is not None and v.sucursal.id == sid)]
                    else:
                        ventas = [v for v in all_ventas if v.sucursal is not None and v.sucursal.id == sid]
                else:
                    ventas = all_ventas
                # Devolver lista vacía si no hay ventas (no 404)
                result = []
                for venta in ventas:
                    try:
                        f = venta.fecha
                        if f is None:
                            fecha_str = ""
                        elif hasattr(f, "strftime"):
                            fecha_str = f.strftime("%Y-%m-%d")
                        else:
                            fecha_str = str(f)
                    except Exception:
                        fecha_str = ""

                    venta_dict = {
                        "id": int(venta.id) if venta.id is not None else 0,
                        "fecha": fecha_str,
                        "total": float(venta.total) if venta.total is not None else 0.0,
                        "cliente": str(venta.cliente) if venta.cliente is not None else "",
                        "metodo_pago": str(venta.metodo_pago) if venta.metodo_pago is not None else "",
                        "productos": [],
                        "sucursal_id": int(venta.sucursal.id) if (venta.sucursal is not None and venta.sucursal.id is not None) else None,
                        "sucursal_nombre": str(venta.sucursal.nombre) if venta.sucursal is not None else "Sucursal Principal",
                    }

                    for item in venta.productos:
                        producto = item.producto
                        if producto:
                            producto_dict = {
                                "id": int(item.id) if item.id is not None else 0,
                                "producto_id": int(producto.id) if producto.id is not None else 0,
                                "codigo": getattr(producto, "codigo", None) or "",
                                "nombre": str(producto.nombre or ""),
                                "cantidad": int(item.cantidad) if item.cantidad is not None else 0,
                                "precio_unitario": float(producto.precio_venta) if producto.precio_venta is not None else 0.0,
                                "subtotal": float(item.subtotal) if item.subtotal is not None else 0.0,
                            }
                            venta_dict["productos"].append(producto_dict)
                        else:
                            print(f"Producto no encontrado para la venta {venta.id}")
                            venta_dict["productos"].append({
                                "id": int(item.id) if item.id is not None else 0,
                                "producto_id": 0,
                                "codigo": None,
                                "nombre": "Desconocido",
                                "cantidad": int(item.cantidad) if item.cantidad is not None else 0,
                                "precio_unitario": 0.0,
                                "subtotal": 0.0,
                            })

                    result.append(venta_dict)

                # Devolver copia solo con tipos JSON (evita pickle/itertools de Pony)
                def to_serializable(obj):
                    if obj is None:
                        return None
                    if isinstance(obj, (int, float, str, bool)):
                        return obj
                    if isinstance(obj, (date, datetime)):
                        return obj.strftime("%Y-%m-%d")
                    if isinstance(obj, dict):
                        return {k: to_serializable(v) for k, v in obj.items()}
                    if isinstance(obj, list):
                        return [to_serializable(x) for x in obj]
                    return str(obj)

                return to_serializable(result)

            except HTTPException:
                raise
            except Exception as e:
                import traceback
                error_details = traceback.format_exc()
                print(f"Error al obtener las ventas: {e}\n{error_details}")
                raise HTTPException(status_code=500, detail=f"Error inesperado al obtener las ventas: {str(e)}")
            
    def delete_venta(self, venta_id: int) -> dict:
        with db_session:
            try:
                venta = models.Venta.get(id=venta_id)
                if not venta:
                    raise HTTPException(status_code=404, detail="Venta no encontrada")

                # Los cambios de producto ya movieron stock (devuelto entra, reemplazo sale).
                # Si solo revertimos la venta, ese movimiento queda aplicado y el stock queda mal.
                for ch in list(venta.cambios):
                    po = ch.producto_devuelto
                    pn = ch.producto_nuevo
                    if po:
                        po.stock = int(po.stock or 0) - int(ch.cantidad_devuelta)
                    if pn:
                        pn.stock = int(pn.stock or 0) + int(ch.cantidad_nueva)

                for item in venta.productos:
                    producto = item.producto
                    if producto:
                        producto.stock += item.cantidad

                deleted_id = venta.id

                venta.delete()
                
                return {"message": f"Venta #{deleted_id} eliminada correctamente"}
            except Exception as e:
                import traceback
                error_details = traceback.format_exc()
                print(f"Error al eliminar la venta: {e}\n{error_details}")
                raise HTTPException(status_code=500, detail=f"Error inesperado al eliminar la venta: {str(e)}")

    def get_total_ventas(self, sucursal_id: int | None = None):
        with db_session:
            try:
                all_ventas = list(models.Venta.select())
                if sucursal_id is not None:
                    sid = int(sucursal_id)
                    if not models.Sucursal.get(id=sid):
                        raise HTTPException(status_code=404, detail="Sucursal no encontrada")
                    default_id = _sucursal_svc.get_or_create_default_sucursal_id()
                    if sid == default_id:
                        ventas = [v for v in all_ventas if v.sucursal is None or (v.sucursal is not None and v.sucursal.id == sid)]
                    else:
                        ventas = [v for v in all_ventas if v.sucursal is not None and v.sucursal.id == sid]
                    total_ventas = sum(float(v.total) for v in ventas) if ventas else 0
                else:
                    total_ventas = sum(float(v.total) for v in all_ventas) if all_ventas else 0
                return total_ventas
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al obtener el total de ventas: {e}")
                raise HTTPException(status_code=500, detail="Error inesperado al obtener el total de ventas.")

    def get_cantidad_ventas(self, sucursal_id: int | None = None):
        with db_session:
            try:
                all_ventas = list(models.Venta.select())
                if sucursal_id is not None:
                    sid = int(sucursal_id)
                    if not models.Sucursal.get(id=sid):
                        raise HTTPException(status_code=404, detail="Sucursal no encontrada")
                    default_id = _sucursal_svc.get_or_create_default_sucursal_id()
                    if sid == default_id:
                        ventas = [v for v in all_ventas if v.sucursal is None or (v.sucursal is not None and v.sucursal.id == sid)]
                    else:
                        ventas = [v for v in all_ventas if v.sucursal is not None and v.sucursal.id == sid]
                    cantidad_ventas = len(ventas)
                else:
                    cantidad_ventas = len(all_ventas)
                return cantidad_ventas
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al obtener la cantidad de ventas: {e}")
                raise HTTPException(status_code=500, detail="Error inesperado al obtener la cantidad de ventas.")

    def get_ganancia_total(self, sucursal_id: int | None = None):
        with db_session:
            try:
                all_ventas = list(models.Venta.select())
                if sucursal_id is not None:
                    sid = int(sucursal_id)
                    if not models.Sucursal.get(id=sid):
                        raise HTTPException(status_code=404, detail="Sucursal no encontrada")
                    default_id = _sucursal_svc.get_or_create_default_sucursal_id()
                    if sid == default_id:
                        ventas = [v for v in all_ventas if v.sucursal is None or (v.sucursal is not None and v.sucursal.id == sid)]
                    else:
                        ventas = [v for v in all_ventas if v.sucursal is not None and v.sucursal.id == sid]
                    ventas_ids = {v.id for v in ventas}
                    ventas_productos = [vp for vp in models.VentaProducto.select() if vp.venta.id in ventas_ids]
                else:
                    ventas_productos = list(models.VentaProducto.select())
                ganancia_total = 0
                for vp in ventas_productos:
                    precio_venta = vp.subtotal / vp.cantidad if vp.cantidad else 0
                    precio_costo = vp.producto.precio_costo if vp.producto else 0
                    ganancia_total += (precio_venta - precio_costo) * (vp.cantidad or 0)
                return ganancia_total
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al calcular la ganancia total: {e}")
                raise HTTPException(status_code=500, detail="Error inesperado al calcular la ganancia total.")

    def get_estadisticas_por_sucursal(self):
        """Devuelve total_ventas, cantidad_ventas y ganancia_total por cada sucursal (para OWNER)."""
        with db_session:
            try:
                # Nota: evitamos `VentaProducto.select(lambda ... in ventas_ids)` porque
                # en algunos entornos puede fallar la traducción de la expresión a SQL
                # (y además implica múltiples pasadas).
                sucursales = list(models.Sucursal.select())
                default_id = _sucursal_svc.get_or_create_default_sucursal_id()

                # Aseguramos que el default exista en la lista para reportar "Sucursal Principal"
                if not any(s.id == default_id for s in sucursales):
                    try:
                        sucursales.append(models.Sucursal.get(id=default_id))
                    except Exception:
                        pass

                totals = {int(s.id): 0.0 for s in sucursales}
                counts = {int(s.id): 0 for s in sucursales}
                ganancias = {int(s.id): 0.0 for s in sucursales}

                # 1) Totales y cantidad de ventas por sucursal efectiva
                all_ventas = list(models.Venta.select())
                for v in all_ventas:
                    sid = default_id if v.sucursal is None else int(v.sucursal.id)
                    totals[sid] = totals.get(sid, 0.0) + float(v.total or 0)
                    counts[sid] = counts.get(sid, 0) + 1

                # 2) Ganancia total por sucursal efectiva (una pasada sobre VentaProducto)
                all_vps = list(models.VentaProducto.select())
                for vp in all_vps:
                    sale = vp.venta
                    sid = default_id if sale.sucursal is None else int(sale.sucursal.id)
                    cantidad = vp.cantidad or 0
                    if cantidad:
                        precio_venta = (vp.subtotal / cantidad) if vp.subtotal is not None else 0
                        precio_costo = float(vp.producto.precio_costo) if vp.producto else 0.0
                        ganancias[sid] = ganancias.get(sid, 0.0) + (precio_venta - precio_costo) * cantidad

                # 3) Armado final (incluye todas las sucursales)
                resultado = []
                for s in sucursales:
                    sid = int(s.id)
                    resultado.append({
                        "sucursal_id": sid,
                        "sucursal_nombre": s.nombre,
                        "total_ventas": totals.get(sid, 0.0),
                        "cantidad_ventas": counts.get(sid, 0),
                        "ganancia_total": ganancias.get(sid, 0.0),
                    })

                return resultado
            except Exception as e:
                print(f"Error al obtener estadísticas por sucursal: {e}")
                raise HTTPException(status_code=500, detail="Error inesperado al obtener estadísticas por sucursal.")