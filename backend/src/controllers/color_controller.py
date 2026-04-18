from fastapi import HTTPException, APIRouter, Depends
from src import schemas
from src.services.color_services import ColorService
from src.controllers.auth_controller import get_current_user
from pydantic import BaseModel
from typing import List

router = APIRouter()
service = ColorService()


class RegisterMessage(BaseModel):
    message: str
    success: bool


class UpdateMessage(BaseModel):
    message: str
    success: bool


@router.post("/register", response_model=RegisterMessage, status_code=201)
def register_color(color: schemas.ColorCreate, current_user=Depends(get_current_user)):
    try:
        service.create_color(color)
        return {"message": "Color creado correctamente", "success": True}
    except HTTPException as e:
        return {"message": e.detail, "success": False}
    except Exception:
        return {"message": "Error inesperado al crear el color.", "success": False}


@router.put("/update/{color_id}", response_model=UpdateMessage)
def update_color(color_id: int, body: schemas.ColorCreate, current_user=Depends(get_current_user)):
    try:
        r = service.update_color(color_id, body)
        return {"message": r["message"], "success": True}
    except HTTPException as e:
        return {"message": e.detail, "success": False}
    except Exception:
        return {"message": "Error inesperado al actualizar el color.", "success": False}


@router.get("/all", response_model=List[schemas.ColorResponse])
def get_all_colors(current_user=Depends(get_current_user)):
    try:
        return service.get_all_colors()
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Error al obtener colores: {e}")
        raise HTTPException(status_code=500, detail="Error al obtener los colores.")


@router.get("/get/{color_id}", response_model=schemas.ColorResponse)
def get_color(color_id: int, current_user=Depends(get_current_user)):
    try:
        return service.get_color_by_id(color_id)
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Error al obtener color: {e}")
        raise HTTPException(status_code=500, detail="Error inesperado al obtener el color.")


@router.delete("/{color_id}", status_code=200)
def delete_color(color_id: int, current_user=Depends(get_current_user)):
    try:
        r = service.delete_color(color_id)
        return {"message": r["message"], "success": True}
    except HTTPException as e:
        return {"message": e.detail, "success": False}
    except Exception:
        return {"message": "Error inesperado al eliminar el color.", "success": False}
