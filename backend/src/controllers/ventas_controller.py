from fastapi import HTTPException, APIRouter, Depends, Query
from pony.orm import *
from src import schemas
from src.services.ventas_services import VentasServices
from src.controllers.auth_controller import get_current_user, get_sucursal_id_for_user, get_owner_user
from pydantic import BaseModel
from typing import List

# Ventas controller

router = APIRouter()
service = VentasServices()  # Servicio que contiene la lógica de negocio

class RegisterMessage(BaseModel):
    message: str
    success: bool

@router.post("/register", response_model=RegisterMessage, status_code=201)
def register_venta(venta: schemas.VentaCreate, current_user=Depends(get_current_user)):
    if getattr(current_user, "role", None) == "OWNER":
        raise HTTPException(
            status_code=403,
            detail="El rol dueña (OWNER) no puede registrar ventas. Solo puede ver estadísticas y gestionar sucursales.",
        )
    sid = get_sucursal_id_for_user(current_user, venta.sucursal_id)
    if sid is None:
        raise HTTPException(status_code=400, detail="Debe indicar sucursal (o tener una asignada).")
    try:
        service.create_venta(venta, sucursal_id=sid)
        return {"message": "Venta registrada correctamente", "success": True}
    except HTTPException as e:
        raise e
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error inesperado al registrar la venta: {str(e)}")

@router.get("/get/{venta_id}", response_model=schemas.VentaResponse)
def get_venta(venta_id: int, current_user=Depends(get_current_user)):
    try:
        venta_data = service.get_venta_by_id(venta_id)
        return venta_data
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error inesperado al obtener la venta.")

@router.get("/all")
def get_all_ventas(
    sucursal_id: int | None = Query(None),
    current_user=Depends(get_current_user),
):
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    try:
        return service.get_all_ventas(sucursal_id=sid)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")

@router.get("/total", response_model=float)
def get_total_ventas(
    sucursal_id: int | None = Query(None),
    current_user=Depends(get_current_user),
):
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    try:
        return service.get_total_ventas(sucursal_id=sid)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error inesperado al obtener el total de ventas.")

@router.get("/total_sale", response_model=int)
def get_cantidad_ventas(
    sucursal_id: int | None = Query(None),
    current_user=Depends(get_current_user),
):
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    try:
        return service.get_cantidad_ventas(sucursal_id=sid)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error inesperado al obtener la cantidad de ventas.")

@router.get("/total_earnings", response_model=float)
def get_ganancia_total(
    sucursal_id: int | None = Query(None),
    current_user=Depends(get_current_user),
):
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    try:
        return service.get_ganancia_total(sucursal_id=sid)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error inesperado al obtener la ganancia total.")

@router.get("/stats_por_sucursal")
def get_estadisticas_por_sucursal(current_user=Depends(get_owner_user)):
    """Solo OWNER: estadísticas (total, cantidad, ganancia) por cada sucursal."""
    try:
        return service.get_estadisticas_por_sucursal()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"{type(e).__name__}: {str(e)}",
        )
    
@router.delete("/{venta_id}", status_code=200)
def delete_venta(venta_id: int, current_user=Depends(get_current_user)):
    try:
        result = service.delete_venta(venta_id)
        return {"message": result["message"], "success": True}
    except HTTPException as e:
        return {"message": e.detail, "success": False}
    except Exception as e:
        return {"message": "Error inesperado al eliminar la venta.", "success": False}