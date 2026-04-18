from pony.orm import db_session, flush
from fastapi import HTTPException
from src import models, schemas
from datetime import datetime, date
from src.services.caja_services import CajaDiariaServices
from src.services.sucursal_services import SucursalServices
from src.services.precio_producto import obtener_precio_unitario

_sucursal_svc = SucursalServices()

PAGO_TOTAL_TOL = 0.02


def _fecha_operacion_venta(venta_data: schemas.VentaCreate) -> date:
    """Día contable: el del payload o el del servidor si no vino."""
    f = venta_data.fecha
    if f is None:
        return date.today()
    if isinstance(f, datetime):
        return f.date()
    return f


def _tipo_precio_para_item(
    item: schemas.DetalleVentaCreate,
    venta_data: schemas.VentaCreate,
    pagos_declarados: list[schemas.VentaPagoCreate] | None,
) -> str:
    if item.tipo_precio and str(item.tipo_precio).strip():
        return str(item.tipo_precio).strip()
    if venta_data.metodo_pago and str(venta_data.metodo_pago).strip():
        return str(venta_data.metodo_pago).strip()
    if pagos_declarados and len(pagos_declarados) == 1:
        return str(pagos_declarados[0].metodo_pago).strip()
    if pagos_declarados and len(pagos_declarados) > 1:
        raise HTTPException(
            status_code=400,
            detail='Con varios medios de cobro cada producto debe incluir "tipo_precio" (precio cotizado).',
        )
    raise HTTPException(
        status_code=400,
        detail="Indicá tipo_precio por producto o enviá metodo_pago (compatibilidad).",
    )


def _resumen_metodo_pago_columna(pagos: list[tuple[str, float]]) -> str:
    if not pagos:
        return "Sin medio"
    metodos = [p[0] for p in pagos]
    if len(pagos) == 1:
        return metodos[0]
    seen: list[str] = []
    for m in metodos:
        if m not in seen:
            seen.append(m)
    return " + ".join(seen) if len(seen) > 1 else seen[0]


class VentasServices:
    def init(self):
        pass

    def create_venta(self, venta_data: schemas.VentaCreate, sucursal_id: int) -> dict:
        with db_session:
            try:
                sucursal = models.Sucursal.get(id=sucursal_id)
                if not sucursal:
                    raise HTTPException(status_code=404, detail="Sucursal no encontrada")

                pagos_declarados: list[schemas.VentaPagoCreate] | None = (
                    list(venta_data.pagos) if venta_data.pagos and len(venta_data.pagos) > 0 else None
                )

                lineas: list[tuple[models.Product, schemas.DetalleVentaCreate, float, str]] = []
                total_venta = 0.0

                for item in venta_data.productos:
                    producto = models.Product.get(id=item.producto_id)
                    if not producto:
                        raise HTTPException(
                            status_code=404,
                            detail=f"Producto con ID {item.producto_id} no encontrado",
                        )
                    if producto.stock < item.cantidad:
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                f"Stock insuficiente para el producto {producto.nombre} "
                                f"- Stock actual: {producto.stock}"
                            ),
                        )
                    tp = _tipo_precio_para_item(item, venta_data, pagos_declarados)
                    precio_unitario = obtener_precio_unitario(producto, tp)
                    sub = float(item.cantidad) * float(precio_unitario)
                    total_venta += sub
                    lineas.append((producto, item, sub, tp))

                if pagos_declarados is None:
                    mp = (venta_data.metodo_pago or "").strip()
                    if not mp:
                        raise HTTPException(status_code=400, detail="Falta metodo_pago o lista de pagos.")
                    pagos_resueltos: list[schemas.VentaPagoCreate] = [
                        schemas.VentaPagoCreate(metodo_pago=mp, monto=round(total_venta, 2))
                    ]
                else:
                    pagos_resueltos = pagos_declarados

                suma_pagos = round(sum(float(p.monto) for p in pagos_resueltos), 2)
                total_r = round(total_venta, 2)
                if abs(suma_pagos - total_r) > PAGO_TOTAL_TOL:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"La suma de pagos (${suma_pagos:,.2f}) debe coincidir con el total "
                            f"de la venta (${total_r:,.2f})."
                        ),
                    )

                resumen_mp = _resumen_metodo_pago_columna([(p.metodo_pago, float(p.monto)) for p in pagos_resueltos])

                fecha_op = _fecha_operacion_venta(venta_data)
                venta = models.Venta(
                    sucursal=sucursal,
                    cliente=venta_data.cliente,
                    fecha=fecha_op,
                    metodo_pago=resumen_mp,
                    total=total_r,
                )

                for producto, item, sub, tp in lineas:
                    models.VentaProducto(
                        venta=venta,
                        producto=producto,
                        cantidad=item.cantidad,
                        subtotal=sub,
                        tipo_precio=tp,
                    )
                    producto.stock -= item.cantidad

                for p in pagos_resueltos:
                    models.VentaPago(
                        venta=venta,
                        metodo_pago=str(p.metodo_pago).strip(),
                        monto=round(float(p.monto), 2),
                    )

                flush()

                try:
                    caja_service = CajaDiariaServices()
                    cliente_str = str(venta.cliente or "").strip() or "Consumidor Final"
                    pagos_pos = [p for p in pagos_resueltos if round(float(p.monto), 2) > 0]
                    mixto = len(pagos_pos) > 1
                    if mixto:
                        descripcion_caja = (
                            f"Venta #{venta.id} - {cliente_str} — Total ${total_r:,.2f}"
                        )
                    else:
                        mp0 = pagos_pos[0].metodo_pago if pagos_pos else "—"
                        descripcion_caja = f"Venta #{venta.id} - {cliente_str} - {mp0} — ${total_r:,.2f}"
                    caja_service.registrar_ingreso_en_sesion_actual(
                        monto=total_r,
                        origen=models.OrigenMovimientoCaja.VENTA.value,
                        sucursal_id=sucursal_id,
                        referencia_id=venta.id,
                        descripcion=descripcion_caja,
                        fecha=fecha_op,
                        pago_mixto=mixto,
                    )
                except HTTPException:
                    raise
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
                
                pagos_rows = list(venta.pagos)
                if not pagos_rows:
                    pagos_rows = None
                venta_dict = {
                    "id": venta.id,
                    "fecha": venta.fecha.strftime("%Y-%m-%d"),
                    "total": venta.total,
                    "cliente": venta.cliente,
                    "metodo_pago": venta.metodo_pago,
                    "pagos": (
                        [{"metodo_pago": p.metodo_pago, "monto": float(p.monto)} for p in pagos_rows]
                        if pagos_rows
                        else [{"metodo_pago": venta.metodo_pago, "monto": float(venta.total)}]
                    ),
                    "productos": [],
                }

                for item in venta.productos:
                    producto = item.producto
                    if producto:
                        cant = int(item.cantidad) if item.cantidad else 0
                        pu = (float(item.subtotal) / cant) if cant else float(producto.precio_venta or 0)
                        producto_dict = {
                            "id": item.id,
                            "producto_id": producto.id,
                            "codigo": producto.codigo,
                            "nombre": producto.nombre,
                            "cantidad": item.cantidad,
                            "precio_unitario": pu,
                            "subtotal": item.subtotal,
                            "tipo_precio": getattr(item, "tipo_precio", None),
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
                # Más reciente primero: fecha descendente, desempate por id de venta.
                all_ventas.sort(
                    key=lambda v: (v.fecha or date.min, int(v.id or 0)),
                    reverse=True,
                )
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

                    pagos_list = list(venta.pagos)
                    venta_dict = {
                        "id": int(venta.id) if venta.id is not None else 0,
                        "fecha": fecha_str,
                        "total": float(venta.total) if venta.total is not None else 0.0,
                        "cliente": str(venta.cliente) if venta.cliente is not None else "",
                        "metodo_pago": str(venta.metodo_pago) if venta.metodo_pago is not None else "",
                        "pagos": (
                            [{"metodo_pago": p.metodo_pago, "monto": float(p.monto)} for p in pagos_list]
                            if pagos_list
                            else [
                                {
                                    "metodo_pago": str(venta.metodo_pago or ""),
                                    "monto": float(venta.total or 0),
                                }
                            ]
                        ),
                        "productos": [],
                        "sucursal_id": int(venta.sucursal.id) if (venta.sucursal is not None and venta.sucursal.id is not None) else None,
                        "sucursal_nombre": str(venta.sucursal.nombre) if venta.sucursal is not None else "Sucursal Principal",
                    }

                    for item in venta.productos:
                        producto = item.producto
                        if producto:
                            cant = int(item.cantidad) if item.cantidad is not None else 0
                            st = float(item.subtotal) if item.subtotal is not None else 0.0
                            pu = (st / cant) if cant else float(producto.precio_venta or 0)
                            producto_dict = {
                                "id": int(item.id) if item.id is not None else 0,
                                "producto_id": int(producto.id) if producto.id is not None else 0,
                                "codigo": getattr(producto, "codigo", None) or "",
                                "nombre": str(producto.nombre or ""),
                                "cantidad": int(item.cantidad) if item.cantidad is not None else 0,
                                "precio_unitario": pu,
                                "subtotal": st,
                                "tipo_precio": getattr(item, "tipo_precio", None),
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
                                "tipo_precio": getattr(item, "tipo_precio", None),
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

                for p in list(venta.pagos):
                    p.delete()

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