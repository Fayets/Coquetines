from fastapi import HTTPException, APIRouter, Depends, Query
from pony.orm import *
from src import schemas
from src.services.cliente_services import ClienteService
from src.controllers.auth_controller import get_current_user, get_owner_user, get_sucursal_id_for_user
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()
service = ClienteService()

class RegisterMessage(BaseModel):
    message: str
    success: bool

@router.post("/register", response_model=RegisterMessage, status_code=201)
def register_client(cliente: schemas.ClienteCreate, current_user=Depends(get_current_user)):
    if getattr(current_user, "role", None) == "OWNER":
        raise HTTPException(status_code=403, detail="La dueña no puede crear clientes.")
    sid = get_sucursal_id_for_user(current_user, None)
    if sid is None:
        raise HTTPException(status_code=400, detail="Debe indicar sucursal (o tener una asignada).")
    try:
        service.create_cliente(cliente, sucursal_id=sid)
        return {"message": "Cliente registrado correctamente", "success": True}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error inesperado al registrar el cliente.")


@router.get("/all", response_model=List[schemas.ClienteResponse])
def get_all_clientes(
    current_user=Depends(get_current_user),
    sucursal_id: Optional[int] = Query(None, description="OWNER puede filtrar por sucursal"),
):
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    try:
        return service.get_all_clientes(sucursal_id=sid)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error inesperado al obtener clientes.")

class UpdateMessage(BaseModel):
    message: str
    success: bool

@router.get("/get_by_dni/{dni}", response_model=schemas.ClienteResponse)
def get_cliente_by_dni(
    dni: str,
    current_user=Depends(get_current_user),
    sucursal_id: Optional[int] = Query(None),
):
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    if sid is None and getattr(current_user, "role", None) != "OWNER":
        raise HTTPException(status_code=400, detail="Debe indicar sucursal (o tener una asignada).")
    try:
        return service.get_cliente_by_dni(dni, sucursal_id=sid)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error inesperado al obtener el cliente por DNI.")


@router.put("/update/{id}", response_model=UpdateMessage)
def update_cliente(id: int, cliente_update: schemas.ClienteCreate, current_user=Depends(get_current_user)):
    if getattr(current_user, "role", None) == "OWNER":
        raise HTTPException(status_code=403, detail="La dueña no puede editar clientes.")
    sid = get_sucursal_id_for_user(current_user, None)
    if sid is None:
        raise HTTPException(status_code=400, detail="Debe indicar sucursal (o tener una asignada).")
    try:
        update_result = service.update_cliente(id, cliente_update, sucursal_id=sid)
        return {"message": update_result["message"], "success": True}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error inesperado al actualizar el cliente.")

@router.delete("/delete/{id}", response_model=UpdateMessage)
def delete_cliente(id: int, current_user=Depends(get_current_user)):
    if getattr(current_user, "role", None) == "OWNER":
        raise HTTPException(status_code=403, detail="La dueña no puede eliminar clientes.")
    sid = get_sucursal_id_for_user(current_user, None)
    if sid is None:
        raise HTTPException(status_code=400, detail="Debe indicar sucursal (o tener una asignada).")
    try:
        delete_result = service.delete_cliente(id, sucursal_id=sid)
        return {"message": delete_result["message"], "success": True}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error inesperado al eliminar el cliente.")

@router.get("/cantidad_por_sucursal")
def get_cantidad_clientes_por_sucursal(current_user=Depends(get_owner_user)):
    """Solo OWNER: cantidad total de clientes registrados en cada sucursal."""
    try:
        return service.get_cantidad_clientes_por_sucursal()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stats_por_sucursal")
def get_estadisticas_clientes_por_sucursal(current_user=Depends(get_owner_user)):
    """Solo OWNER: cantidad de clientes (con crédito) por sucursal."""
    try:
        return service.get_estadisticas_clientes_por_sucursal()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))