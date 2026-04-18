from __future__ import annotations

import unicodedata
from datetime import date, datetime
from typing import Optional

from fastapi import HTTPException
from pony.orm import db_session

from src import models
from src.services.sucursal_services import SucursalServices

_sucursal_svc = SucursalServices()

TURNO_MANANA = models.TurnoCaja.MANANA.value
TURNO_TARDE = models.TurnoCaja.TARDE.value


def normalizar_turno_db(turno: str | None) -> str:
    """
    Unifica turno desde query/JSON (MANANA, MAÑANA, NFC/NFD) al valor guardado en BD (MAÑANA / TARDE).
    """
    if not turno:
        return TURNO_MANANA
    t = unicodedata.normalize("NFC", str(turno).strip().upper())
    if t == TURNO_TARDE or t == "TARDE":
        return TURNO_TARDE
    if t in (TURNO_MANANA, "MANANA"):
        return TURNO_MANANA
    return TURNO_MANANA


def _to_serializable(obj):
    """Convierte a tipos que JSON puede serializar (evita errores de Pony/pickle)."""
    if obj is None:
        return None
    if isinstance(obj, (int, float, str, bool)):
        return obj
    if isinstance(obj, (date, datetime)):
        return obj.isoformat() if hasattr(obj, "isoformat") else str(obj)
    if isinstance(obj, dict):
        return {k: _to_serializable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_serializable(x) for x in obj]
    return str(obj)


class CajaDiariaServices:
    """Caja diaria por sucursal y día, con turnos MAÑANA / TARDE."""

    def __init__(self):
        pass

    def _cajas_abiertas_del_dia(self, sucursal_id: int, fecha: date) -> list[models.CajaDiaria]:
        sucursal = models.Sucursal.get(id=sucursal_id)
        if not sucursal:
            raise HTTPException(status_code=404, detail="Sucursal no encontrada")
        default_id = _sucursal_svc.get_or_create_default_sucursal_id()
        # No usar `for` sobre el resultado de Query: en Py 3.13 el iterador interno de Pony falla.
        # `_actual_fetch()` devuelve `list` de entidades (mismo SQL que select() sin filtros).
        candidates = [
            c
            for c in models.CajaDiaria.select()._actual_fetch()
            if c.fecha == fecha and (c.estado or "") == "ABIERTA"
        ]
        if sucursal_id == default_id:
            return [
                c
                for c in candidates
                if c.sucursal is None or (c.sucursal is not None and c.sucursal.id == sucursal_id)
            ]
        return [c for c in candidates if c.sucursal is not None and c.sucursal == sucursal]

    def _caja_abierta_unica_para_movimiento(self, sucursal_id: int, fecha: date) -> models.CajaDiaria:
        """Ventas / créditos / cambios: una sola caja ABIERTA por sucursal y día (cualquier turno)."""
        abiertas = self._cajas_abiertas_del_dia(sucursal_id, fecha)
        if len(abiertas) == 0:
            raise HTTPException(
                status_code=400,
                detail="No hay caja abierta para este día. Abrí el turno correspondiente antes de registrar movimientos.",
            )
        if len(abiertas) > 1:
            raise HTTPException(
                status_code=400,
                detail="Hay más de una caja abierta el mismo día. Cerrá un turno antes de continuar.",
            )
        return abiertas[0]

    def _obtener_caja_turno_abierta(self, sucursal_id: int, fecha: date, turno: str) -> models.CajaDiaria:
        sucursal = models.Sucursal.get(id=sucursal_id)
        if not sucursal:
            raise HTTPException(status_code=404, detail="Sucursal no encontrada")
        t = normalizar_turno_db(turno)
        caja = models.CajaDiaria.get(sucursal=sucursal, fecha=fecha, turno=t)
        if not caja and sucursal_id == _sucursal_svc.get_or_create_default_sucursal_id():
            caja = models.CajaDiaria.get(sucursal=None, fecha=fecha, turno=t)
        if not caja:
            raise HTTPException(
                status_code=400,
                detail=f"No hay caja abierta para el turno {t}. Abrí la caja desde la pantalla de caja diaria.",
            )
        if caja.estado != "ABIERTA":
            raise HTTPException(
                status_code=400,
                detail=f"La caja del día {caja.fecha} turno {caja.turno} está cerrada y no admite nuevos movimientos.",
            )
        return caja

    def get_or_create_caja_abierta(
        self,
        sucursal_id: int,
        fecha: date | None = None,
        turno: str = TURNO_MANANA,
        *,
        auto_turno: bool = False,
    ) -> models.CajaDiaria:
        """
        Con auto_turno=True (ingresos automáticos): la única caja ABIERTA del día.
        Con auto_turno=False: caja del turno explícito (debe estar abierta).
        """
        from datetime import date as _date

        fecha = fecha or _date.today()
        if auto_turno:
            return self._caja_abierta_unica_para_movimiento(sucursal_id, fecha)
        return self._obtener_caja_turno_abierta(sucursal_id, fecha, turno)

    def registrar_ingreso_en_sesion_actual(
        self,
        monto: float,
        origen: str,
        sucursal_id: int,
        referencia_id: int | None = None,
        descripcion: str | None = None,
        fecha: date | None = None,
        pago_mixto: bool = False,
    ) -> dict:
        """Registra ingreso en la única caja abierta del día (misma sesión Pony)."""
        from datetime import date as _date

        if monto <= 0:
            raise HTTPException(status_code=400, detail="El monto del ingreso debe ser mayor a 0")
        fecha = fecha or _date.today()
        caja = self.get_or_create_caja_abierta(sucursal_id, fecha, auto_turno=True)
        movimiento = models.MovimientoCaja(
            caja=caja,
            tipo=models.TipoMovimientoCaja.INGRESO.value,
            origen=origen,
            referencia_id=referencia_id,
            descripcion=descripcion,
            monto=monto,
            pago_mixto=pago_mixto,
        )
        caja.total_ingresos += monto
        caja.saldo_final = caja.saldo_inicial + caja.total_ingresos - caja.total_egresos
        return {
            "message": "Ingreso registrado en caja diaria",
            "caja_id": caja.id,
            "movimiento_id": movimiento.id,
        }

    def registrar_ingreso(
        self,
        monto: float,
        origen: str,
        sucursal_id: int,
        referencia_id: int | None = None,
        descripcion: str | None = None,
        fecha: date | None = None,
    ) -> dict:
        with db_session:
            return self.registrar_ingreso_en_sesion_actual(
                monto=monto,
                origen=origen,
                sucursal_id=sucursal_id,
                referencia_id=referencia_id,
                descripcion=descripcion,
                fecha=fecha,
                pago_mixto=False,
            )

    def registrar_egreso(
        self,
        monto: float,
        descripcion: str,
        sucursal_id: int,
        origen: str = models.OrigenMovimientoCaja.MANUAL.value,
        referencia_id: int | None = None,
        fecha: date | None = None,
        turno: str = TURNO_MANANA,
    ) -> dict:
        with db_session:
            if monto <= 0:
                raise HTTPException(status_code=400, detail="El monto del egreso debe ser mayor a 0")
            caja = self.get_or_create_caja_abierta(sucursal_id, fecha, turno=turno, auto_turno=False)

            movimiento = models.MovimientoCaja(
                caja=caja,
                tipo=models.TipoMovimientoCaja.EGRESO.value,
                origen=origen,
                referencia_id=referencia_id,
                descripcion=descripcion,
                monto=monto,
                pago_mixto=False,
            )

            caja.total_egresos += monto
            caja.saldo_final = caja.saldo_inicial + caja.total_ingresos - caja.total_egresos

            return {
                "message": "Egreso registrado en caja diaria",
                "caja_id": caja.id,
                "movimiento_id": movimiento.id,
            }

    def abrir_caja(
        self,
        sucursal_id: int,
        saldo_inicial: float,
        fecha: date | None = None,
        turno: str = TURNO_MANANA,
    ) -> dict:
        from datetime import date as _date

        if saldo_inicial is None or saldo_inicial < 0:
            raise HTTPException(
                status_code=400,
                detail="El saldo inicial debe ser 0 o mayor.",
            )

        t = normalizar_turno_db(turno)

        with db_session:
            sucursal = models.Sucursal.get(id=sucursal_id)
            if not sucursal:
                raise HTTPException(status_code=404, detail="Sucursal no encontrada")
            fecha = fecha or _date.today()

            abiertas = self._cajas_abiertas_del_dia(sucursal_id, fecha)
            if len(abiertas) > 0:
                raise HTTPException(
                    status_code=400,
                    detail="Ya hay una caja abierta este día. Cerrala antes de abrir otro turno.",
                )

            caja = models.CajaDiaria.get(sucursal=sucursal, fecha=fecha, turno=t)
            if caja:
                raise HTTPException(
                    status_code=400,
                    detail=f"Ya existe una caja para este turno en la fecha {fecha}",
                )
            default_id = _sucursal_svc.get_or_create_default_sucursal_id()
            if sucursal_id == default_id:
                existente = models.CajaDiaria.get(sucursal=None, fecha=fecha, turno=t)
                if existente:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Ya existe una caja para este turno en la fecha {fecha}",
                    )

            caja = models.CajaDiaria(
                sucursal=sucursal,
                fecha=fecha,
                turno=t,
                saldo_inicial=saldo_inicial,
                total_ingresos=0,
                total_egresos=0,
                saldo_final=saldo_inicial,
                estado="ABIERTA",
            )
            return {"message": "Caja diaria abierta correctamente", "caja_id": caja.id}

    def cerrar_caja(self, sucursal_id: int, fecha: date | None = None, turno: str = TURNO_MANANA) -> dict:
        from datetime import date as _date

        t = normalizar_turno_db(turno)

        with db_session:
            sucursal = models.Sucursal.get(id=sucursal_id)
            if not sucursal:
                raise HTTPException(status_code=404, detail="Sucursal no encontrada")
            fecha = fecha or _date.today()
            caja = models.CajaDiaria.get(sucursal=sucursal, fecha=fecha, turno=t)
            if not caja and sucursal_id == _sucursal_svc.get_or_create_default_sucursal_id():
                caja = models.CajaDiaria.get(sucursal=None, fecha=fecha, turno=t)
            if not caja:
                raise HTTPException(
                    status_code=404,
                    detail=f"No existe caja para este turno en la fecha {fecha}",
                )
            if caja.estado == "CERRADA":
                raise HTTPException(status_code=400, detail="La caja ya está cerrada")
            if caja.sucursal is None:
                caja.sucursal = sucursal
            caja.estado = "CERRADA"
            return {"message": "Caja diaria cerrada correctamente", "caja_id": caja.id, "saldo_final": caja.saldo_final}

    @staticmethod
    def _sucursal_nombre_para_caja(caja: models.CajaDiaria) -> str:
        if caja.sucursal is not None:
            return str(caja.sucursal.nombre or "Sucursal")
        return "Principal"

    def _serializar_resumen_caja(self, caja: models.CajaDiaria) -> dict:
        """Requiere sesión Pony activa y entidad `caja` cargada."""
        movs_list = list(caja.movimientos)
        movs_list.sort(key=lambda mv: mv.fecha_hora or datetime.min)
        venta_ids = {
            int(m.referencia_id)
            for m in movs_list
            if m.origen == models.OrigenMovimientoCaja.VENTA.value and m.referencia_id is not None
        }
        pagos_por_venta: dict[int, list[dict]] = {}
        for vid in venta_ids:
            v = models.Venta.get(id=vid)
            if not v:
                continue
            filas = sorted(list(v.pagos), key=lambda p: int(p.id))
            pagos_por_venta[vid] = [
                {"metodo_pago": str(p.metodo_pago or "").strip(), "monto": float(p.monto or 0)}
                for p in filas
                if float(p.monto or 0) > 0
            ]

        movimientos = []
        for m in movs_list:
            ref = int(m.referencia_id) if m.referencia_id is not None else None
            medios = None
            if m.origen == models.OrigenMovimientoCaja.VENTA.value and ref is not None:
                lst = pagos_por_venta.get(ref)
                if lst:
                    medios = lst
            movimientos.append({
                "id": int(m.id),
                "tipo": str(m.tipo or ""),
                "origen": str(m.origen or ""),
                "referencia_id": ref,
                "descripcion": str(m.descripcion) if m.descripcion is not None else None,
                "monto": float(m.monto) if m.monto is not None else 0.0,
                "fecha_hora": m.fecha_hora.isoformat() if m.fecha_hora and hasattr(m.fecha_hora, "isoformat") else str(m.fecha_hora) if m.fecha_hora else None,
                "pago_mixto": bool(getattr(m, "pago_mixto", False)),
                "medios_pago": medios,
            })

        result = {
            "id": int(caja.id),
            "fecha": caja.fecha.strftime("%Y-%m-%d") if caja.fecha and hasattr(caja.fecha, "strftime") else str(caja.fecha) if caja.fecha else "",
            "turno": str(caja.turno or TURNO_MANANA),
            "sucursal_nombre": self._sucursal_nombre_para_caja(caja),
            "estado": str(caja.estado or ""),
            "saldo_inicial": float(caja.saldo_inicial) if caja.saldo_inicial is not None else 0.0,
            "total_ingresos": float(caja.total_ingresos) if caja.total_ingresos is not None else 0.0,
            "total_egresos": float(caja.total_egresos) if caja.total_egresos is not None else 0.0,
            "saldo_final": float(caja.saldo_final) if caja.saldo_final is not None else 0.0,
            "movimientos": movimientos,
        }
        return _to_serializable(result)

    def obtener_resumen(self, sucursal_id: int, fecha: date | None = None, turno: str = TURNO_MANANA) -> dict:
        from datetime import date as _date

        t = normalizar_turno_db(turno)

        with db_session:
            sucursal = models.Sucursal.get(id=sucursal_id)
            if not sucursal:
                raise HTTPException(status_code=404, detail="Sucursal no encontrada")
            fecha = fecha or _date.today()
            caja = models.CajaDiaria.get(sucursal=sucursal, fecha=fecha, turno=t)
            if not caja and sucursal_id == _sucursal_svc.get_or_create_default_sucursal_id():
                caja = models.CajaDiaria.get(sucursal=None, fecha=fecha, turno=t)
            if not caja:
                raise HTTPException(
                    status_code=404,
                    detail=f"No existe caja para esta sucursal en la fecha {fecha} (turno {t})",
                )
            return self._serializar_resumen_caja(caja)

    def resumen_cierre_por_id_para_owner(self, caja_id: int, sucursal_filter: Optional[int]) -> dict:
        """Resumen completo (PDF) de un cierre ya cerrado; solo si coincide con el filtro de sucursal del listado."""
        with db_session:
            caja = models.CajaDiaria.get(id=caja_id)
            if not caja or (caja.estado or "") != "CERRADA":
                raise HTTPException(status_code=404, detail="Cierre no encontrado.")
            if sucursal_filter is not None:
                did = _sucursal_svc.get_or_create_default_sucursal_id()
                if sucursal_filter == did:
                    ok = caja.sucursal is None or (
                        caja.sucursal is not None and caja.sucursal.id == sucursal_filter
                    )
                else:
                    ok = caja.sucursal is not None and caja.sucursal.id == sucursal_filter
                if not ok:
                    raise HTTPException(status_code=404, detail="Cierre no encontrado.")
            return self._serializar_resumen_caja(caja)

    def listar_cierres(self, sucursal_id: Optional[int] = None) -> list[dict]:
        with db_session:
            rows = [c for c in models.CajaDiaria.select()._actual_fetch() if (c.estado or "") == "CERRADA"]
            if sucursal_id is not None:
                did = _sucursal_svc.get_or_create_default_sucursal_id()
                if sucursal_id == did:
                    rows = [
                        c
                        for c in rows
                        if c.sucursal is None or (c.sucursal is not None and c.sucursal.id == sucursal_id)
                    ]
                else:
                    rows = [c for c in rows if c.sucursal is not None and c.sucursal.id == sucursal_id]

            rows.sort(key=lambda c: (-c.fecha.toordinal(), 0 if (c.turno or TURNO_MANANA) == TURNO_MANANA else 1))

            out = []
            for c in rows:
                nombre = "Principal"
                if c.sucursal is not None:
                    nombre = str(c.sucursal.nombre or "Sucursal")
                out.append({
                    "id": int(c.id),
                    "sucursal_nombre": nombre,
                    "fecha": c.fecha.strftime("%Y-%m-%d") if c.fecha else "",
                    "turno": str(c.turno or TURNO_MANANA),
                    "saldo_inicial": float(c.saldo_inicial or 0),
                    "total_ingresos": float(c.total_ingresos or 0),
                    "total_egresos": float(c.total_egresos or 0),
                    "saldo_final": float(c.saldo_final or 0),
                    "cerrado_en": None,
                })
            return out
