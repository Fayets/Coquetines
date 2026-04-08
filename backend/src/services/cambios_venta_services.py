"""Registro de cambios de producto a partir de una venta (stock, caja, nota de crédito)."""

import uuid
from collections import defaultdict
from datetime import date

from fastapi import HTTPException
from pony.orm import db_session, flush

from src import models
from src.services.caja_services import CajaDiariaServices
from src.services.sucursal_services import SucursalServices

_sucursal_svc = SucursalServices()


def _precio_unitario_como_venta(producto, metodo_pago: str) -> float:
    if metodo_pago in ("Efectivo", "Transferencia"):
        u = producto.precio_et if producto.precio_et is not None else producto.precio_venta
    else:
        u = producto.precio_venta if producto.precio_venta is not None else producto.precio_et
    return float(u or 0.0)


def _venta_en_sucursal(venta, sucursal_id: int) -> bool:
    sid = int(sucursal_id)
    default_id = _sucursal_svc.get_or_create_default_sucursal_id()
    vs = venta.sucursal
    if sid == default_id:
        return vs is None or (vs is not None and int(vs.id) == sid)
    return vs is not None and int(vs.id) == sid


def _producto_en_sucursal(producto, sucursal_id: int) -> bool:
    sid = int(sucursal_id)
    default_id = _sucursal_svc.get_or_create_default_sucursal_id()
    ps = producto.sucursal
    if sid == default_id:
        return ps is None or (ps is not None and int(ps.id) == sid)
    return ps is not None and int(ps.id) == sid


class CambiosVentaServices:
    def registrar_cambio(
        self,
        venta_id: int,
        venta_producto_id: int,
        cantidad_devuelta: int,
        producto_nuevo_id: int,
        cantidad_nueva: int,
        sucursal_id: int,
        metodo_pago_suplemento: str | None,
        valor_nuevo_override: float | None = None,
        crear_nota_credito: bool = True,
        grupo_lote_uid: str | None = None,
    ) -> dict:
        out = {}
        ingreso_caja_monto = 0.0
        ingreso_caja_cambio_id = 0
        try:
            with db_session:
                venta = models.Venta.get(id=venta_id)
                if not venta:
                    raise HTTPException(status_code=404, detail="Venta no encontrada")
                if not _venta_en_sucursal(venta, sucursal_id):
                    raise HTTPException(
                        status_code=403,
                        detail="La venta no pertenece a la sucursal indicada.",
                    )

                vp = models.VentaProducto.get(id=venta_producto_id)
                if not vp or int(vp.venta.id) != int(venta_id):
                    raise HTTPException(
                        status_code=400,
                        detail="La línea de venta no corresponde a esa venta.",
                    )

                ya_devuelto = 0
                for ch in models.CambioVenta.select():
                    if int(ch.detalle_linea.id) == int(vp.id):
                        ya_devuelto += int(ch.cantidad_devuelta)
                disponible = int(vp.cantidad) - ya_devuelto
                if cantidad_devuelta > disponible:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cantidad a devolver inválida. Disponible en esta línea: {disponible}.",
                    )

                prod_old = vp.producto
                if not prod_old:
                    raise HTTPException(status_code=400, detail="Producto de la línea no encontrado.")

                prod_new = models.Product.get(id=producto_nuevo_id)
                if not prod_new:
                    raise HTTPException(status_code=404, detail="Producto nuevo no encontrado.")
                if not _producto_en_sucursal(prod_new, sucursal_id):
                    raise HTTPException(
                        status_code=400,
                        detail="El producto nuevo debe ser de la misma sucursal que la venta.",
                    )

                if cantidad_nueva > 0 and int(prod_new.stock or 0) < cantidad_nueva:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Stock insuficiente del producto nuevo (disponible: {prod_new.stock}).",
                    )

                unit_dev = float(vp.subtotal) / float(vp.cantidad) if vp.cantidad else 0.0
                valor_devuelto = round(unit_dev * cantidad_devuelta, 2)

                unit_new = _precio_unitario_como_venta(prod_new, venta.metodo_pago)
                if valor_nuevo_override is not None:
                    valor_nuevo = round(float(valor_nuevo_override), 2)
                else:
                    valor_nuevo = round(unit_new * cantidad_nueva, 2)
                if cantidad_nueva == 0 and valor_nuevo_override is None:
                    raise HTTPException(
                        status_code=400,
                        detail="Con cantidad_nueva 0 debe informarse valor_nuevo en el ítem del lote.",
                    )
                diferencia = round(valor_nuevo - valor_devuelto, 2)

                if diferencia > 0.005:
                    if not metodo_pago_suplemento or metodo_pago_suplemento not in (
                        "Efectivo",
                        "Transferencia",
                    ):
                        raise HTTPException(
                            status_code=400,
                            detail="Hay diferencia a favor del local: indicá Efectivo o Transferencia para el cobro.",
                        )

                suc = venta.sucursal
                cv_kwargs = dict(
                    venta_original=venta,
                    sucursal=suc,
                    fecha=date.today(),
                    detalle_linea=vp,
                    producto_devuelto=prod_old,
                    cantidad_devuelta=cantidad_devuelta,
                    valor_devuelto=valor_devuelto,
                    producto_nuevo=prod_new,
                    cantidad_nueva=cantidad_nueva,
                    valor_nuevo=valor_nuevo,
                    diferencia_monto=diferencia,
                )
                # Pony no acepta None explícito en Optional(str) al crear; solo pasamos el campo si aplica.
                if diferencia > 0.005:
                    cv_kwargs["metodo_pago_suplemento"] = metodo_pago_suplemento
                if grupo_lote_uid:
                    cv_kwargs["grupo_lote_uid"] = grupo_lote_uid
                cambio = models.CambioVenta(**cv_kwargs)

                prod_old.stock = int(prod_old.stock or 0) + cantidad_devuelta
                if cantidad_nueva > 0:
                    prod_new.stock = int(prod_new.stock or 0) - cantidad_nueva

                nc = None
                if crear_nota_credito and diferencia < -0.005:
                    monto_nc = round(-diferencia, 2)
                    nc = models.NotaCredito(
                        sucursal=suc,
                        cliente_nombre=str(venta.cliente or "Consumidor Final"),
                        monto=monto_nc,
                        fecha=date.today(),
                        motivo="Cambio de producto — saldo a favor del cliente",
                        cambio=cambio,
                    )
                # Pony asigna PK tras flush; sin esto nc.id (y a veces cambio.id) sigue None.
                flush()
                cid = int(cambio.id)
                nota_id = int(nc.id) if nc is not None else None
                if diferencia > 0.005:
                    ingreso_caja_monto = float(diferencia)
                    ingreso_caja_cambio_id = cid

                out = {
                    "cambio_id": cid,
                    "diferencia_monto": diferencia,
                    "valor_devuelto": valor_devuelto,
                    "valor_nuevo": valor_nuevo,
                    "nota_credito_id": nota_id,
                }
        except HTTPException:
            raise
        except Exception as e:
            import traceback

            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Error al registrar el cambio: {str(e)}")

        if ingreso_caja_monto > 0 and ingreso_caja_cambio_id:
            try:
                CajaDiariaServices().registrar_ingreso(
                    monto=ingreso_caja_monto,
                    origen=models.OrigenMovimientoCaja.CAMBIO_VENTA.value,
                    sucursal_id=sucursal_id,
                    referencia_id=ingreso_caja_cambio_id,
                    descripcion=(
                        f"Cambio venta #{venta_id} — suplemento {metodo_pago_suplemento or ''} "
                        f"— ${ingreso_caja_monto:,.2f}"
                    ),
                    fecha=date.today(),
                )
            except Exception as e:
                print(f"Aviso: no se registró ingreso en caja por cambio de venta: {e}")

        return out

    def registrar_cambios_lote(
        self,
        venta_id: int,
        items: list[dict],
        sucursal_id: int,
        metodo_pago_suplemento: str | None,
    ) -> list[dict]:
        """
        Varios cambios sobre la misma venta. Valida que la suma de devoluciones por línea no supere lo disponible.
        Ejecuta cada ítem en orden (mismo comportamiento que registrar_cambio uno a uno).
        """
        if not items:
            raise HTTPException(status_code=400, detail="Debe haber al menos un ítem.")

        suma_por_vp: dict[int, int] = defaultdict(int)
        for it in items:
            suma_por_vp[int(it["venta_producto_id"])] += int(it["cantidad_devuelta"])

        with db_session:
            venta = models.Venta.get(id=venta_id)
            if not venta:
                raise HTTPException(status_code=404, detail="Venta no encontrada")
            if not _venta_en_sucursal(venta, sucursal_id):
                raise HTTPException(
                    status_code=403,
                    detail="La venta no pertenece a la sucursal indicada.",
                )

            for vp_id, need_qty in suma_por_vp.items():
                vp = models.VentaProducto.get(id=vp_id)
                if not vp or int(vp.venta.id) != int(venta_id):
                    raise HTTPException(
                        status_code=400,
                        detail=f"La línea de venta {vp_id} no corresponde a esa venta.",
                    )
                ya_devuelto = 0
                for ch in models.CambioVenta.select():
                    if int(ch.detalle_linea.id) == int(vp_id):
                        ya_devuelto += int(ch.cantidad_devuelta)
                disponible = int(vp.cantidad) - ya_devuelto
                if need_qty > disponible:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"En la línea #{vp_id} se piden devolver {need_qty} unidades en total; "
                            f"disponible: {disponible}."
                        ),
                    )

            suma_entrega_por_prod: dict[int, int] = defaultdict(int)
            for it in items:
                pid = int(it["producto_nuevo_id"])
                suma_entrega_por_prod[pid] += int(it["cantidad_nueva"])
            for pid, need_qty in suma_entrega_por_prod.items():
                if need_qty < 1:
                    continue
                pr = models.Product.get(id=pid)
                if not pr:
                    raise HTTPException(status_code=404, detail=f"Producto nuevo id={pid} no encontrado.")
                if int(pr.stock or 0) < need_qty:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Stock insuficiente para el producto #{pid} en el lote "
                            f"(se piden {need_qty} unidades; disponible: {pr.stock})."
                        ),
                    )

        lote_uid = str(uuid.uuid4())
        resultados: list[dict] = []
        for it in items:
            vn = it.get("valor_nuevo")
            r = self.registrar_cambio(
                venta_id=venta_id,
                venta_producto_id=int(it["venta_producto_id"]),
                cantidad_devuelta=int(it["cantidad_devuelta"]),
                producto_nuevo_id=int(it["producto_nuevo_id"]),
                cantidad_nueva=int(it["cantidad_nueva"]),
                sucursal_id=sucursal_id,
                metodo_pago_suplemento=metodo_pago_suplemento,
                valor_nuevo_override=float(vn) if vn is not None else None,
                crear_nota_credito=False,
                grupo_lote_uid=lote_uid,
            )
            resultados.append(r)

        total_favor = round(
            sum(-float(r["diferencia_monto"]) for r in resultados if float(r["diferencia_monto"]) < -0.005),
            2,
        )
        if total_favor > 0.005:
            primer_cambio_id = next(
                (int(r["cambio_id"]) for r in resultados if float(r["diferencia_monto"]) < -0.005),
                None,
            )
            if primer_cambio_id is not None:
                with db_session:
                    cambio = models.CambioVenta.get(id=primer_cambio_id)
                    if not cambio:
                        raise HTTPException(status_code=500, detail="Cambio no encontrado al generar nota de crédito.")
                    venta = cambio.venta_original
                    suc = venta.sucursal
                    nc = models.NotaCredito(
                        sucursal=suc,
                        cliente_nombre=str(venta.cliente or "Consumidor Final"),
                        monto=total_favor,
                        fecha=date.today(),
                        motivo="Cambio de producto — saldo a favor del cliente (lote)",
                        cambio=cambio,
                    )
                    flush()
                    nc_id = int(nc.id)
                for r in resultados:
                    if float(r["diferencia_monto"]) < -0.005:
                        r["nota_credito_id"] = nc_id

        return resultados

    def _linea_cambio_dict(self, c: models.CambioVenta) -> dict:
        nc = c.nota_credito
        return {
            "id": int(c.id),
            "producto_devuelto_codigo": c.producto_devuelto.codigo,
            "producto_devuelto_nombre": c.producto_devuelto.nombre,
            "cantidad_devuelta": int(c.cantidad_devuelta),
            "producto_nuevo_codigo": c.producto_nuevo.codigo,
            "producto_nuevo_nombre": c.producto_nuevo.nombre,
            "cantidad_nueva": int(c.cantidad_nueva),
            "valor_devuelto": float(c.valor_devuelto),
            "valor_nuevo": float(c.valor_nuevo),
            "diferencia_monto": float(c.diferencia_monto),
            "metodo_pago_suplemento": c.metodo_pago_suplemento,
            "nota_credito_id": int(nc.id) if nc else None,
        }

    def _grupo_historial_dict(self, members: list[models.CambioVenta]) -> dict:
        members = sorted(members, key=lambda x: int(x.id))
        vo = members[0].venta_original
        lineas = [self._linea_cambio_dict(c) for c in members]
        nc_id = next((ln["nota_credito_id"] for ln in lineas if ln.get("nota_credito_id")), None)
        sup = next((ln["metodo_pago_suplemento"] for ln in lineas if ln.get("metodo_pago_suplemento")), None)
        uid = getattr(members[0], "grupo_lote_uid", None) or None
        fechas = [c.fecha.isoformat() if c.fecha else "" for c in members]
        fecha = max(fechas) if fechas else ""
        return {
            "cambio_ids": [int(c.id) for c in members],
            "grupo_lote_uid": uid,
            "fecha": fecha,
            "venta_id": int(vo.id),
            "cliente_venta": str(vo.cliente or "Consumidor Final"),
            "venta_metodo_pago": str(vo.metodo_pago or ""),
            "lineas": lineas,
            "diferencia_monto": round(sum(float(c.diferencia_monto) for c in members), 2),
            "valor_devuelto_total": round(sum(float(c.valor_devuelto) for c in members), 2),
            "valor_nuevo_total": round(sum(float(c.valor_nuevo) for c in members), 2),
            "nota_credito_id": nc_id,
            "metodo_pago_suplemento": sup,
        }

    def listar_cambios(self, sucursal_id: int, limit: int = 100) -> list[dict]:
        sid_req = int(sucursal_id)
        with db_session:
            rows = list(models.CambioVenta.select())
            sucursal_rows: list[models.CambioVenta] = []
            for c in rows:
                if c.sucursal is None:
                    sid = _sucursal_svc.get_or_create_default_sucursal_id()
                else:
                    sid = int(c.sucursal.id)
                if sid == sid_req:
                    sucursal_rows.append(c)

            by_uid: dict[str, list[models.CambioVenta]] = defaultdict(list)
            singles: list[models.CambioVenta] = []
            for c in sucursal_rows:
                uid = getattr(c, "grupo_lote_uid", None)
                if uid:
                    by_uid[str(uid)].append(c)
                else:
                    singles.append(c)

            groups: list[tuple[int, list[models.CambioVenta]]] = []
            for members in by_uid.values():
                mx = max(int(m.id) for m in members)
                groups.append((mx, members))
            for c in singles:
                groups.append((int(c.id), [c]))

            groups.sort(key=lambda x: -x[0])
            out = [self._grupo_historial_dict(members) for _, members in groups[:limit]]
            return out
