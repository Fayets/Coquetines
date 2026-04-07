from datetime import date, datetime
from pony.orm import db_session, select
from fastapi import HTTPException

from src import models
from src.services.sucursal_services import SucursalServices

_sucursal_svc = SucursalServices()


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
    """Servicio de caja diaria: las cajas son por sucursal; cada sucursal tiene su propia caja por día."""

    def __init__(self):
        pass

    def _get_or_create_caja(self, sucursal_id: int, fecha: date | None = None) -> models.CajaDiaria:
        """Obtiene la caja de esa sucursal y fecha. Si no existe, la crea abierta con saldo 0 (solo para esa sucursal)."""
        from datetime import date as _date

        with db_session:
            sucursal = models.Sucursal.get(id=sucursal_id)
            if not sucursal:
                raise HTTPException(status_code=404, detail="Sucursal no encontrada")
            fecha = fecha or _date.today()
            caja = models.CajaDiaria.get(sucursal=sucursal, fecha=fecha)
            if not caja:
                default_id = _sucursal_svc.get_or_create_default_sucursal_id()
                if sucursal_id == default_id:
                    caja = models.CajaDiaria.get(sucursal=None, fecha=fecha)
            if not caja:
                caja = models.CajaDiaria(
                    sucursal=sucursal,
                    fecha=fecha,
                    saldo_inicial=0,
                    total_ingresos=0,
                    total_egresos=0,
                    saldo_final=0,
                    estado="ABIERTA",
                )
            if caja.estado != "ABIERTA":
                raise HTTPException(
                    status_code=400,
                    detail=f"La caja del día {caja.fecha} está cerrada y no admite nuevos movimientos.",
                )
            return caja

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
            if monto <= 0:
                raise HTTPException(status_code=400, detail="El monto del ingreso debe ser mayor a 0")
            caja = self._get_or_create_caja(sucursal_id, fecha)

            movimiento = models.MovimientoCaja(
                caja=caja,
                tipo=models.TipoMovimientoCaja.INGRESO.value,
                origen=origen,
                referencia_id=referencia_id,
                descripcion=descripcion,
                monto=monto,
            )

            caja.total_ingresos += monto
            caja.saldo_final = caja.saldo_inicial + caja.total_ingresos - caja.total_egresos

            return {
                "message": "Ingreso registrado en caja diaria",
                "caja_id": caja.id,
                "movimiento_id": movimiento.id,
            }

    def registrar_egreso(
        self,
        monto: float,
        descripcion: str,
        sucursal_id: int,
        origen: str = models.OrigenMovimientoCaja.MANUAL.value,
        referencia_id: int | None = None,
        fecha: date | None = None,
    ) -> dict:
        with db_session:
            if monto <= 0:
                raise HTTPException(status_code=400, detail="El monto del egreso debe ser mayor a 0")
            caja = self._get_or_create_caja(sucursal_id, fecha)

            movimiento = models.MovimientoCaja(
                caja=caja,
                tipo=models.TipoMovimientoCaja.EGRESO.value,
                origen=origen,
                referencia_id=referencia_id,
                descripcion=descripcion,
                monto=monto,
            )

            caja.total_egresos += monto
            caja.saldo_final = caja.saldo_inicial + caja.total_ingresos - caja.total_egresos

            return {
                "message": "Egreso registrado en caja diaria",
                "caja_id": caja.id,
                "movimiento_id": movimiento.id,
            }

    def abrir_caja(self, sucursal_id: int, saldo_inicial: float, fecha: date | None = None) -> dict:
        """Abre la caja del día para la sucursal. saldo_inicial puede ser 0."""
        from datetime import date as _date

        if saldo_inicial is None or saldo_inicial < 0:
            raise HTTPException(
                status_code=400,
                detail="El saldo inicial debe ser 0 o mayor.",
            )

        with db_session:
            sucursal = models.Sucursal.get(id=sucursal_id)
            if not sucursal:
                raise HTTPException(status_code=404, detail="Sucursal no encontrada")
            fecha = fecha or _date.today()
            caja = models.CajaDiaria.get(sucursal=sucursal, fecha=fecha)
            if caja:
                raise HTTPException(status_code=400, detail=f"Ya existe una caja para esta sucursal en la fecha {fecha}")
            default_id = _sucursal_svc.get_or_create_default_sucursal_id()
            if sucursal_id == default_id:
                existente = models.CajaDiaria.get(sucursal=None, fecha=fecha)
                if existente:
                    raise HTTPException(status_code=400, detail=f"Ya existe una caja para la fecha {fecha}")
            caja = models.CajaDiaria(
                sucursal=sucursal,
                fecha=fecha,
                saldo_inicial=saldo_inicial,
                total_ingresos=0,
                total_egresos=0,
                saldo_final=saldo_inicial,
                estado="ABIERTA",
            )
            return {"message": "Caja diaria abierta correctamente", "caja_id": caja.id}

    def cerrar_caja(self, sucursal_id: int, fecha: date | None = None) -> dict:
        from datetime import date as _date

        with db_session:
            sucursal = models.Sucursal.get(id=sucursal_id)
            if not sucursal:
                raise HTTPException(status_code=404, detail="Sucursal no encontrada")
            fecha = fecha or _date.today()
            caja = models.CajaDiaria.get(sucursal=sucursal, fecha=fecha)
            if not caja and sucursal_id == _sucursal_svc.get_or_create_default_sucursal_id():
                caja = models.CajaDiaria.get(sucursal=None, fecha=fecha)
            if not caja:
                raise HTTPException(status_code=404, detail=f"No existe caja para esta sucursal en la fecha {fecha}")
            if caja.estado == "CERRADA":
                raise HTTPException(status_code=400, detail="La caja ya está cerrada")
            if caja.sucursal is None:
                caja.sucursal = sucursal
            caja.estado = "CERRADA"
            return {"message": "Caja diaria cerrada correctamente", "caja_id": caja.id, "saldo_final": caja.saldo_final}

    def obtener_resumen(self, sucursal_id: int, fecha: date | None = None) -> dict:
        from datetime import date as _date

        with db_session:
            sucursal = models.Sucursal.get(id=sucursal_id)
            if not sucursal:
                raise HTTPException(status_code=404, detail="Sucursal no encontrada")
            fecha = fecha or _date.today()
            caja = models.CajaDiaria.get(sucursal=sucursal, fecha=fecha)
            if not caja and sucursal_id == _sucursal_svc.get_or_create_default_sucursal_id():
                caja = models.CajaDiaria.get(sucursal=None, fecha=fecha)
            if not caja:
                raise HTTPException(status_code=404, detail=f"No existe caja para esta sucursal en la fecha {fecha}")

            movimientos = []
            for m in caja.movimientos.order_by(lambda mv: mv.fecha_hora):
                movimientos.append({
                    "id": int(m.id),
                    "tipo": str(m.tipo or ""),
                    "origen": str(m.origen or ""),
                    "referencia_id": int(m.referencia_id) if m.referencia_id is not None else None,
                    "descripcion": str(m.descripcion) if m.descripcion is not None else None,
                    "monto": float(m.monto) if m.monto is not None else 0.0,
                    "fecha_hora": m.fecha_hora.isoformat() if m.fecha_hora and hasattr(m.fecha_hora, "isoformat") else str(m.fecha_hora) if m.fecha_hora else None,
                })

            result = {
                "id": int(caja.id),
                "fecha": caja.fecha.strftime("%Y-%m-%d") if caja.fecha and hasattr(caja.fecha, "strftime") else str(caja.fecha) if caja.fecha else "",
                "estado": str(caja.estado or ""),
                "saldo_inicial": float(caja.saldo_inicial) if caja.saldo_inicial is not None else 0.0,
                "total_ingresos": float(caja.total_ingresos) if caja.total_ingresos is not None else 0.0,
                "total_egresos": float(caja.total_egresos) if caja.total_egresos is not None else 0.0,
                "saldo_final": float(caja.saldo_final) if caja.saldo_final is not None else 0.0,
                "movimientos": movimientos,
            }
            return _to_serializable(result)

