from fastapi import HTTPException, APIRouter, Depends
from pony.orm import *
from src import schemas
from src.services.category_services import CategoryService
from src.controllers.auth_controller import get_current_user
from pydantic import BaseModel
from typing import List


# Category controller

router = APIRouter()
service = CategoryService()  # Servicio que contiene la lógica de negocio

class RegisterMessage(BaseModel):
    message: str
    success: bool


@router.post("/register", response_model=RegisterMessage, status_code=201)
def register_category(category: schemas.CategoryCreate, current_user=Depends(get_current_user)):
    try:
        category_created = service.create_category(category)
        return {
            "message": "Categoría creada correctamente",
            "success": True,
        }
    except HTTPException as e:
        return {
            "message": e.detail,
            "success": False,
        }
    except Exception as e:
        return {
            "message": "Error inesperado al crear la categoría.",
            "success": False,
        }

class UpdateMessage(BaseModel):
    message: str
    success: bool


@router.put("/update/{categoria_id}", response_model=UpdateMessage)
def update_category(categoria_id: int, category_update: schemas.CategoryCreate, current_user=Depends(get_current_user)):
    try:
        update_result = service.update_category(categoria_id, category_update)
        return {"message": update_result["message"], "success": True}
    except HTTPException as e:
        print(f"HTTPException: {e.detail}")
        return {"message": e.detail, "success": False}
    except Exception as e:
        print(f"Error inesperado al actualizar la categoría: {e}")
        return {"message": "Error inesperado al actualizar la categoría.", "success": False}

@router.get(
    "/all",
    response_model=List[schemas.CategoryResponse],
    summary="Catálogo global de categorías",
    description="Misma lista para todas las sucursales; los productos referencian estas categorías por id.",
)
def get_all_categories(current_user=Depends(get_current_user)):
    try:
        categories = service.get_all_categories()  # Usamos el método del servicio para obtener todas las categorías
        return categories
    except Exception as e:
        print(f"Error inesperado al obtener las categorías: {e}")
        raise HTTPException(status_code=500, detail="Error al obtener las categorías.")



@router.get("/get/{categoria_id}", response_model=schemas.CategoryResponse)
def get_category(categoria_id: int, current_user=Depends(get_current_user)):
    try:
        category_data = service.get_category_by_id(categoria_id)
        return category_data
    except HTTPException as e:
        print(f"HTTPException: {e.detail}")
        raise e
    except Exception as e:
        print(f"Error inesperado al obtener la categoría: {e}")
        raise HTTPException(
            status_code=500, detail="Error inesperado al obtener la categoría.")


@router.delete("/{categoria_id}", status_code=200)
def delete_category(categoria_id: int, current_user=Depends(get_current_user)):
    try:
        result = service.delete_category(categoria_id)
        return {"message": result["message"], "success": True}
    except HTTPException as e:
        return {"message": e.detail, "success": False}
    except Exception as e:
        return {"message": "Error inesperado al eliminar la categoría.", "success": False}
