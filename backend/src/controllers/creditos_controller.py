from fastapi import HTTPException, APIRouter, Depends, Query
from pony.orm import *
from src import schemas
from src.services.creditos_services import CreditosServices
from src.controllers.auth_controller import get_current_user, get_sucursal_id_for_user, get_owner_user
from pydantic import BaseModel
from typing import List

# Créditos controller

router = APIRouter()
service = CreditosServices()  # Servicio que contiene la lógica de negocio

class RegisterMessage(BaseModel):
    message: str
    success: bool

@router.post("/register", response_model=RegisterMessage, status_code=201)
def register_credito(credito: schemas.CreditoCreate, current_user=Depends(get_current_user)):
    if getattr(current_user, "role", None) == "OWNER":
        raise HTTPException(status_code=403, detail="La dueña no puede crear créditos.")
    sid = get_sucursal_id_for_user(current_user, credito.sucursal_id)
    if sid is None:
        return {"message": "Debe indicar sucursal (o tener una asignada).", "success": False}
    try:
        service.create_credito(credito, sucursal_id=sid)
        return {"message": "Crédito registrado correctamente", "success": True}
    except HTTPException as e:
        return {"message": e.detail, "success": False}
    except Exception as e:
        return {"message": "Error inesperado al registrar el crédito.", "success": False}

@router.get("/get/{credito_id}", response_model=schemas.CreditoResponse)
def get_credito(credito_id: int, current_user=Depends(get_current_user)):
    try:
        credito_data = service.get_credito_by_id(credito_id)
        return credito_data
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error inesperado al obtener el crédito.")

@router.get("/all", response_model=List[schemas.CreditoViewResponse])
def get_all_creditos(
    sucursal_id: int | None = Query(None),
    current_user=Depends(get_current_user),
):
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    try:
        return service.get_all_creditos(sucursal_id=sid)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error inesperado al obtener los créditos: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"{type(e).__name__}: {str(e)}",
        )



@router.get("/total", response_model=float)
def get_total_creditos(
    sucursal_id: int | None = Query(None),
    current_user=Depends(get_current_user),
):
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    try:
        return service.get_total_creditos(sucursal_id=sid)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error inesperado al obtener el total de créditos.")

@router.get("/total_credit", response_model=int)
def get_cantidad_creditos(
    sucursal_id: int | None = Query(None),
    current_user=Depends(get_current_user),
):
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    try:
        return service.get_cantidad_creditos(sucursal_id=sid)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error inesperado al obtener la cantidad de créditos.")

@router.get("/total_debt", response_model=float)
def get_deuda_total(
    sucursal_id: int | None = Query(None),
    current_user=Depends(get_current_user),
):
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    try:
        return service.get_deuda_total(sucursal_id=sid)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error inesperado al obtener la deuda total.")

@router.get("/stats_por_sucursal")
def get_estadisticas_por_sucursal(current_user=Depends(get_owner_user)):
    """Solo OWNER: estadísticas de créditos por sucursal."""
    try:
        return service.get_estadisticas_por_sucursal()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.delete("/{credito_id}", status_code=200)
def delete_credito(credito_id: int, current_user=Depends(get_current_user)):
    if getattr(current_user, "role", None) == "OWNER":
        raise HTTPException(status_code=403, detail="La dueña no puede eliminar créditos.")
    try:
        result = service.delete_credito(credito_id)
        return {"message": result["message"], "success": True}
    except HTTPException as e:
        return {"message": e.detail, "success": False}
    except Exception as e:
        return {"message": "Error inesperado al eliminar el crédito.", "success": False}
    
@router.post("/{credito_id}/agregar-productos", response_model=RegisterMessage, status_code=201)
def agregar_productos_credito(credito_id: int, data: schemas.ProductosAgregarRequest, current_user=Depends(get_current_user)):
    try:
        service.add_productos_to_credito(credito_id, data.productos)
        return {"message": "Productos agregados correctamente al crédito.", "success": True}
    except HTTPException as e:
        return {"message": e.detail, "success": False}
    except Exception as e:
        print(f"Error inesperado al agregar productos: {e}")
        return {"message": "Error inesperado al agregar productos al crédito.", "success": False}

@router.post("/{credito_id}/registrar-pago", response_model=RegisterMessage, status_code=201)
def registrar_pago_credito(credito_id: int, data: schemas.PagoCreditoRequest, current_user=Depends(get_current_user)):
    try:
        service.registrar_pago(
            credito_id=credito_id,
            monto=data.monto,
            fecha_pago=data.fecha_pago
        )
        return {"message": "Pago registrado correctamente.", "success": True}
    except HTTPException as e:
        return {"message": e.detail, "success": False}
    except Exception as e:
        print(f"Error inesperado al registrar el pago: {e}")
        return {"message": "Error inesperado al registrar el pago.", "success": False}

@router.get("/{credito_id}/pagos", response_model=List[schemas.PagoCreditoResponse])
def get_historial_pagos_credito(credito_id: int, current_user=Depends(get_current_user)):
    try:
        return service.get_pagos_por_credito(credito_id)
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Error inesperado al obtener el historial de pagos: {e}")
        raise HTTPException(status_code=500, detail="Error inesperado al obtener el historial de pagos.")

@router.delete("/pago/{pago_id}", status_code=200)
def eliminar_pago_credito(pago_id: int, current_user=Depends(get_current_user)):
    try:
        result = service.eliminar_pago(pago_id)
        return {"message": result["message"], "nuevo_saldo": result["nuevo_saldo"], "estado_credito": result["estado_credito"]}
    except HTTPException as e:
        return {"message": e.detail}
    except Exception as e:
        print(f"Error inesperado al eliminar el pago: {e}")
        raise HTTPException(status_code=500, detail="Error inesperado al eliminar el pago.")

@router.delete("/producto/{producto_id}", status_code=200)
def eliminar_producto_credito(producto_id: int, current_user=Depends(get_current_user)):
    try:
        result = service.eliminar_producto(producto_id)
        return {
            "message": result["message"],
            "nuevo_saldo": result["nuevo_saldo"],
        }
    except HTTPException as e:
        return {"message": e.detail}
    except Exception as e:
        print(f"Error inesperado al eliminar el producto: {e}")
        raise HTTPException(status_code=500, detail="Error inesperado al eliminar el producto.")