from fastapi import APIRouter, Depends, HTTPException
from src import schemas
from src.services.sucursal_services import SucursalServices
from src.controllers.auth_controller import get_current_user, get_owner_user

router = APIRouter()
service = SucursalServices()


@router.get("/", response_model=list[schemas.SucursalResponse])
def list_sucursales(
    solo_activas: bool = True,
    current_user=Depends(get_current_user),
):
    """Lista todas las sucursales (todas para OWNER, para el resto solo activas)."""
    try:
        return service.list_all(solo_activas=solo_activas)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{sucursal_id}", response_model=schemas.SucursalResponse)
def get_sucursal(
    sucursal_id: int,
    current_user=Depends(get_current_user),
):
    try:
        return service.get_by_id(sucursal_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", response_model=schemas.SucursalResponse, status_code=201)
def create_sucursal(
    data: schemas.SucursalCreate,
    current_user=Depends(get_owner_user),
):
    """Solo OWNER puede crear sucursales."""
    try:
        return service.create(data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{sucursal_id}")
def update_sucursal(
    sucursal_id: int,
    data: schemas.SucursalCreate,
    current_user=Depends(get_owner_user),
):
    try:
        return service.update(sucursal_id, data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{sucursal_id}")
def delete_sucursal(
    sucursal_id: int,
    current_user=Depends(get_owner_user),
):
    """Solo OWNER puede eliminar sucursales. No se puede eliminar la Sucursal Principal ni una con datos asociados."""
    try:
        return service.delete(sucursal_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transferir-stock")
def transferir_stock(
    data: schemas.TransferenciaStockRequest,
    current_user=Depends(get_owner_user),
):
    """Solo OWNER (dueña) puede transferir stock entre sucursales."""
    try:
        return service.transferir_stock(
            sucursal_origen_id=data.sucursal_origen_id,
            sucursal_destino_id=data.sucursal_destino_id,
            producto_codigo=data.producto_codigo,
            cantidad=data.cantidad,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
