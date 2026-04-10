from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel

from src import schemas
from src.controllers.auth_controller import get_current_user, get_sucursal_id_for_user
from src.services.caja_services import CajaDiariaServices
from src.services.reportes_services import ReportService


router = APIRouter()
service = CajaDiariaServices()
report_service = ReportService()


class RegisterMessage(BaseModel):
    message: str
    success: bool


class EgresoManualRequest(BaseModel):
    monto: float
    descripcion: str
    fecha: Optional[date] = None


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
        service.abrir_caja(sucursal_id=sid, saldo_inicial=data.saldo_inicial, fecha=data.fecha)
        return {"message": "Caja abierta correctamente", "success": True}
    except HTTPException as e:
        return {"message": e.detail, "success": False}
    except Exception:
        return {"message": "Error inesperado al abrir la caja.", "success": False}


@router.post("/cerrar")
def cerrar_caja(
    fecha: Optional[date] = None,
    sucursal_id: Optional[int] = Query(None),
    current_user=Depends(get_current_user),
):
    if getattr(current_user, "role", None) == "OWNER":
        raise HTTPException(status_code=403, detail="La dueña no puede cerrar caja.")
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    if sid is None:
        raise HTTPException(status_code=400, detail="Debe indicar sucursal (o tener una asignada).")
    try:
        service.cerrar_caja(sucursal_id=sid, fecha=fecha)
        resumen = service.obtener_resumen(sucursal_id=sid, fecha=fecha)
        pdf_bytes = report_service.generate_cierre_caja_pdf(resumen)
        fecha_str = resumen.get("fecha", "cierre")
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="cierre_caja_{fecha_str}.pdf"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/egreso-manual", response_model=RegisterMessage)
def registrar_egreso_manual(
    data: EgresoManualRequest,
    sucursal_id: Optional[int] = Query(None),
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
    current_user=Depends(get_current_user),
):
    if getattr(current_user, "role", None) == "OWNER":
        raise HTTPException(status_code=403, detail="La dueña no tiene acceso a caja diaria.")
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    if sid is None:
        raise HTTPException(status_code=400, detail="Debe indicar sucursal (o tener una asignada).")
    try:
        return service.obtener_resumen(sucursal_id=sid, fecha=fecha)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")

