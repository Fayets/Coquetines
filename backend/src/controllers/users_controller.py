from typing import Optional, List
from uuid import UUID, uuid4
from fastapi import APIRouter, Query, Depends, HTTPException
from pony.orm import db_session, desc, select
from pydantic import BaseModel
from src import models, schemas
from src.models import Roles
from src.services.user_services import UsersService
from src.controllers.auth_controller import get_current_user, get_owner_user

router = APIRouter()
user_service = UsersService()


@router.get("/empleados", response_model=List[schemas.EmpleadoResponse])
def list_empleados(current_user=Depends(get_owner_user)):
    """Solo OWNER: lista todos los empleados (ADMIN y EMPLEADO) con su sucursal."""
    with db_session:
        # Usar User.select() en lugar de select() con generador (falla con Python 3.13 / Pony decompiler)
        all_users = list(models.User.select())
        result = []
        for u in all_users:
            role = getattr(u, "role", None) or ""
            if role == "OWNER":
                continue
            if role not in ("ADMIN", "EMPLEADO"):
                continue
            sucursal_id = None
            sucursal_nombre = None
            if getattr(u, "sucursal", None) is not None and u.sucursal:
                sucursal_id = int(u.sucursal.id)
                sucursal_nombre = getattr(u.sucursal, "nombre", None) or None
            result.append(schemas.EmpleadoResponse(
                id=str(u.id),
                username=u.username,
                email=u.email,
                firstName=getattr(u, "firstName", "") or "",
                lastName=getattr(u, "lastName", "") or "",
                role=role,
                sucursal_id=sucursal_id,
                sucursal_nombre=sucursal_nombre,
            ))
        return result


class RegisterMessage(BaseModel):
    message: str
    success: bool


@router.delete("/{user_id}", status_code=200)
def delete_empleado(user_id: UUID, current_user=Depends(get_owner_user)):
    """Solo OWNER: elimina un empleado (ADMIN o EMPLEADO). No se puede eliminar a la dueña."""
    try:
        user_service.delete_user(user_id)
        return {"message": "Usuario eliminado correctamente", "success": True}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error al eliminar el usuario.")


@router.put("/{user_id}/password", status_code=200)
def change_password(user_id: UUID, body: schemas.ChangePasswordRequest, current_user=Depends(get_owner_user)):
    """Solo OWNER: cambia la contraseña de un empleado (ADMIN o EMPLEADO)."""
    try:
        user_service.update_password(user_id, body.new_password)
        return {"message": "Contraseña actualizada correctamente", "success": True}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error al actualizar la contraseña.")


@router.post("/register", response_model=RegisterMessage, status_code=201)
def register_employee(user: schemas.UserCreate, current_user=Depends(get_owner_user)):
    """Solo OWNER: crea un empleado (ADMIN o EMPLEADO) asignado a una sucursal."""
    if getattr(user, "role", None) == "OWNER":
        raise HTTPException(status_code=403, detail="No se puede crear otro usuario dueña desde aquí.")
    if getattr(user, "role", None) not in ("ADMIN", "EMPLEADO"):
        raise HTTPException(status_code=400, detail="El rol debe ser ADMIN o EMPLEADO.")
    if getattr(user, "sucursal_id", None) is None:
        raise HTTPException(status_code=400, detail="Debe indicar la sucursal del empleado.")
    try:
        user_service.create_user(user)
        return {"message": "Empleado creado correctamente", "success": True}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error inesperado al crear el empleado.")