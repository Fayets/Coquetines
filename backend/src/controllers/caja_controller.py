from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel

from src import schemas
from src.controllers.auth_controller import get_current_user, get_sucursal_id_for_user
from src.services.caja_services import CajaDiariaServices, normalizar_turno_db
from src.services.reportes_services import ReportService
from src.services.whatsapp_services import WhatsappServices


router = APIRouter()
service = CajaDiariaServices()
report_service = ReportService()
_whatsapp = WhatsappServices()


class RegisterMessage(BaseModel):
    message: str
    success: bool


class EgresoManualRequest(BaseModel):
    monto: float
    descripcion: str
    fecha: Optional[date] = None


def _turno_str(turno: Optional[str]) -> str:
    return normalizar_turno_db(turno)


@router.post("/abrir", response_model=RegisterMessage)
def abrir_caja(
    data: schemas.AbrirCajaRequest,
    sucursal_id: Optional[int] = Query(None),
    current_user=Depends(get_current_user),
):
    if getattr(current_user, "role", None) == "OWNER":
        raise HTTPException(status_code=403, detail="La dueña no puede abrir caja.")
    sid = get_sucursal_id_for_user(current_user, data.sucursal_id or sucursal_id)
    if sid is None:
        return {"message": "Debe indicar sucursal (o tener una asignada).", "success": False}
    try:
        turno_raw = data.turno.value if hasattr(data.turno, "value") else str(data.turno)
        service.abrir_caja(sucursal_id=sid, saldo_inicial=data.saldo_inicial, fecha=data.fecha, turno=turno_raw)
        return {"message": "Caja abierta correctamente", "success": True}
    except HTTPException as e:
        return {"message": e.detail, "success": False}
    except Exception as e:
        import traceback

        traceback.print_exc()
        return {
            "message": f"Error al abrir la caja: {type(e).__name__}: {str(e)[:220]}",
            "success": False,
        }


@router.post("/cerrar")
def cerrar_caja(
    fecha: Optional[date] = None,
    sucursal_id: Optional[int] = Query(None),
    turno: str = Query("MANANA", description="MANANA o TARDE (se guarda como MAÑANA/TARDE en BD)"),
    current_user=Depends(get_current_user),
):
    if getattr(current_user, "role", None) == "OWNER":
        raise HTTPException(status_code=403, detail="La dueña no puede cerrar caja.")
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    if sid is None:
        raise HTTPException(status_code=400, detail="Debe indicar sucursal (o tener una asignada).")
    t = _turno_str(turno)
    try:
        service.cerrar_caja(sucursal_id=sid, fecha=fecha, turno=t)
        resumen = service.obtener_resumen(sucursal_id=sid, fecha=fecha, turno=t)
        pdf_bytes = report_service.generate_cierre_caja_pdf(resumen)
        fecha_str = resumen.get("fecha", "cierre")
        tr = resumen.get("turno", t)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="cierre_caja_{fecha_str}_{tr}.pdf"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/egreso-manual", response_model=RegisterMessage)
def registrar_egreso_manual(
    data: EgresoManualRequest,
    sucursal_id: Optional[int] = Query(None),
    turno: str = Query("MANANA"),
    current_user=Depends(get_current_user),
):
    if getattr(current_user, "role", None) == "OWNER":
        raise HTTPException(status_code=403, detail="La dueña no puede registrar egresos en caja.")
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    if sid is None:
        return {"message": "Debe indicar sucursal (o tener una asignada).", "success": False}
    try:
        service.registrar_egreso(
            monto=data.monto,
            descripcion=data.descripcion,
            sucursal_id=sid,
            fecha=data.fecha,
            turno=_turno_str(turno),
        )
        return {"message": "Egreso registrado correctamente", "success": True}
    except HTTPException as e:
        return {"message": e.detail, "success": False}
    except Exception:
        return {"message": "Error inesperado al registrar el egreso.", "success": False}


@router.get("/resumen")
def obtener_resumen(
    fecha: Optional[date] = None,
    sucursal_id: Optional[int] = Query(None),
    turno: str = Query("MANANA"),
    current_user=Depends(get_current_user),
):
    if getattr(current_user, "role", None) == "OWNER":
        raise HTTPException(status_code=403, detail="La dueña no tiene acceso a caja diaria.")
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    if sid is None:
        raise HTTPException(status_code=400, detail="Debe indicar sucursal (o tener una asignada).")
    try:
        return service.obtener_resumen(sucursal_id=sid, fecha=fecha, turno=_turno_str(turno))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")


@router.get("/cierres", response_model=list[schemas.CierreCajaItem])
def listar_cierres(
    sucursal_id: Optional[int] = Query(None),
    current_user=Depends(get_current_user),
):
    if getattr(current_user, "role", None) != "OWNER":
        raise HTTPException(status_code=403, detail="Solo la dueña puede ver el listado de cierres de caja.")
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    return service.listar_cierres(sucursal_id=sid)


@router.get("/cierres/{caja_id}/pdf")
def descargar_pdf_cierre_historial_owner(
    caja_id: int,
    sucursal_id: Optional[int] = Query(None),
    current_user=Depends(get_current_user),
):
    if getattr(current_user, "role", None) != "OWNER":
        raise HTTPException(
            status_code=403,
            detail="Solo la dueña puede descargar el PDF desde el historial de cierres.",
        )
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    try:
        resumen = service.resumen_cierre_por_id_para_owner(caja_id, sid)
        pdf_bytes = report_service.generate_cierre_caja_pdf(resumen)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    fecha_str = resumen.get("fecha", "cierre")
    tr = resumen.get("turno", "turno")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="cierre_caja_{fecha_str}_{tr}.pdf"'},
    )


@router.post("/enviar-cierre")
def enviar_cierre_whatsapp(
    fecha: Optional[date] = None,
    turno: str = Query("MANANA"),
    sucursal_id: Optional[int] = Query(None),
    numero: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    if getattr(current_user, "role", None) == "OWNER":
        raise HTTPException(status_code=403, detail="Esta acción no está disponible para la dueña.")
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    if sid is None:
        raise HTTPException(status_code=400, detail="Debe indicar sucursal (o tener una asignada).")
    t = _turno_str(turno)
    resumen = service.obtener_resumen(sucursal_id=sid, fecha=fecha, turno=t)
    pdf_bytes = report_service.generate_cierre_caja_pdf(resumen)
    fecha_part = resumen.get("fecha") or "hoy"
    nombre = f"cierre_{fecha_part}_{t}.pdf"
    return _whatsapp.enviar_pdf(pdf_bytes, nombre, numero)
