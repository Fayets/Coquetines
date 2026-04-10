from fastapi import HTTPException, APIRouter, Depends, Query
from pony.orm import *
from src import schemas
from src.services.product_services import ProductServices
from src.controllers.auth_controller import get_current_user, get_sucursal_id_for_user, get_owner_user
from pydantic import BaseModel
from typing import List

# Product controller

router = APIRouter()
service = ProductServices()  # Servicio que contiene la lógica de negocio

class RegisterMessage(BaseModel):
    message: str
    success: bool


@router.post("/register", response_model=RegisterMessage, status_code=201)
def register_product(
    product: schemas.ProductCreate,
    current_user=Depends(get_current_user),
):
    sucursal_id = get_sucursal_id_for_user(current_user, product.sucursal_id)
    if sucursal_id is None:
        return {"message": "Debe indicar sucursal (o tener una asignada).", "success": False}
    try:
        es_empleado = getattr(current_user, "role", None) == "EMPLEADO"
        service.create_producto(product, sucursal_id=sucursal_id, es_empleado=es_empleado)
        return {"message": "Producto creado correctamente", "success": True}
    except HTTPException as e:
        return {"message": e.detail, "success": False}
    except Exception as e:
        return {"message": "Error inesperado al crear el producto.", "success": False}

class UpdateMessage(BaseModel):
    message: str
    success: bool


@router.put("/update/{codigo}", response_model=UpdateMessage)
def update_product(
    codigo: str,
    product_update: schemas.ProductUpdate,
    sucursal_id: int | None = Query(None, description="Sucursal (obligatorio para OWNER)"),
    current_user=Depends(get_owner_user),
):
    """Solo OWNER puede actualizar productos (precios, stock, datos)."""
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    if sid is None:
        return {"message": "Debe indicar sucursal (o tener una asignada).", "success": False}
    try:
        update_result = service.update_product(codigo, sid, product_update, es_empleado=False)
        return {"message": update_result["message"], "success": True}
    except HTTPException as e:
        return {"message": e.detail, "success": False}
    except Exception as e:
        return {"message": "Error inesperado al actualizar el producto.", "success": False}


@router.get("/get/{codigo}", response_model=schemas.ProductResponse)
def get_product(
    codigo: str,
    sucursal_id: int | None = Query(None),
    current_user=Depends(get_current_user),
):
    try:
        role = getattr(current_user, "role", None)
        ocultar_costo = role == "EMPLEADO"
        # OWNER puede ver el producto solo con el código (sin sucursal)
        if role == "OWNER":
            return service.get_product_by_code(codigo, sucursal_id=None, ocultar_costo=False)
        # ADMIN / EMPLEADO: necesitan sucursal
        sid = get_sucursal_id_for_user(current_user, sucursal_id)
        if sid is None:
            raise HTTPException(status_code=400, detail="Debe indicar sucursal (o tener una asignada).")
        return service.get_product_by_code(codigo, sucursal_id=sid, ocultar_costo=ocultar_costo)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error inesperado al obtener el producto.")


@router.get("/all")
def get_all_products(
    sucursal_id: int | None = Query(None, description="OWNER puede omitir para ver todas"),
    current_user=Depends(get_current_user),
):
    """Lista productos de la sucursal (o todas para OWNER)."""
    try:
        sid = get_sucursal_id_for_user(current_user, sucursal_id)
        if sid is not None:
            sid = int(sid)
        ocultar_costo = getattr(current_user, "role", None) == "EMPLEADO"
        result = service.get_all_products(sucursal_id=sid, ocultar_costo=ocultar_costo)
        return result if result is not None else []
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error al obtener productos: {str(e)}")


@router.delete("/{codigo}", status_code=200)
def delete_product(
    codigo: str,
    sucursal_id: int | None = Query(None),
    current_user=Depends(get_current_user),
):
    role = getattr(current_user, "role", None)
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    if sid is None:
        if role == "OWNER":
            try:
                result = service.delete_product_by_codigo_if_unique(codigo)
                return {"message": result["message"], "success": True}
            except HTTPException as e:
                return {"message": e.detail, "success": False}
        return {"message": "Debe indicar sucursal (o tener una asignada).", "success": False}
    try:
        result = service.delete_product(codigo, sucursal_id=sid)
        return {"message": result["message"], "success": True}
    except HTTPException as e:
        return {"message": e.detail, "success": False}
    except Exception as e:
        return {"message": "Error inesperado al eliminar el producto.", "success": False}


class StockAdjustMessage(BaseModel):
    message: str
    stock_actual: int


@router.get("/low_stock", response_model=List[schemas.ProductResponse])
def get_low_stock_products(
    sucursal_id: int | None = Query(None),
    current_user=Depends(get_current_user),
):
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    ocultar_costo = getattr(current_user, "role", None) == "EMPLEADO"
    try:
        return service.get_low_stock_products(sucursal_id=sid, ocultar_costo=ocultar_costo)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error inesperado al obtener productos con stock bajo.")


@router.get("/total_products")
def total_products(
    sucursal_id: int | None = Query(None),
    current_user=Depends(get_current_user),
):
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    try:
        return service.get_total_products(sucursal_id=sid)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"{type(e).__name__}: {str(e)}",
        )


@router.get("/inventory_value")
def inventory_value(
    sucursal_id: int | None = Query(None),
    current_user=Depends(get_current_user),
):
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    try:
        return service.get_inventory_value(sucursal_id=sid)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"{type(e).__name__}: {str(e)}",
        )


@router.get("/low_stock_count")
def low_stock_count(
    sucursal_id: int | None = Query(None),
    current_user=Depends(get_current_user),
):
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    try:
        return service.get_low_stock_count(sucursal_id=sid)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"{type(e).__name__}: {str(e)}",
        )


@router.get("/stock-otras-sucursales")
def stock_otras_sucursales(
    busqueda: str = Query("", description="Buscar por nombre, código o marca"),
    talle: str = Query("", description="Filtrar por talle exacto"),
    current_user=Depends(get_current_user),
):
    """Consulta stock de productos en sucursales distintas a la del usuario."""
    sucursal_id = get_sucursal_id_for_user(current_user, None)
    if sucursal_id is None:
        raise HTTPException(status_code=400, detail="No se pudo determinar tu sucursal.")
    try:
        ocultar_costo = getattr(current_user, "role", None) == "EMPLEADO"
        return service.buscar_stock_otras_sucursales(
            sucursal_propia_id=sucursal_id,
            busqueda=busqueda,
            talle=talle,
            ocultar_costo=ocultar_costo,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error al consultar stock de otras sucursales.")


@router.get("/stats_por_sucursal")
def stats_por_sucursal(current_user=Depends(get_owner_user)):
    """Solo OWNER: cantidad de productos y valor de inventario por sucursal."""
    try:
        return service.get_stats_por_sucursal()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"{type(e).__name__}: {str(e)}",
        )


@router.post("/ingreso-stock", response_model=schemas.StockIngresoAPIResponse)
def registrar_ingreso_stock(
    body: schemas.StockIngresoCreate,
    current_user=Depends(get_owner_user),
):
    """Solo OWNER: suma stock al producto existente y guarda fecha, cantidad y motivo (opcional)."""
    try:
        r = service.registrar_ingreso_stock(body, current_user)
        return schemas.StockIngresoAPIResponse(
            message=r["message"],
            success=True,
            stock_actual=r["stock_actual"],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error inesperado: {type(e).__name__}")


@router.get("/ingreso-stock/historial", response_model=List[schemas.StockIngresoRegistroItem])
def historial_ingreso_stock(
    producto_id: int = Query(..., description="ID del producto (PK)"),
    current_user=Depends(get_current_user),
):
    """Listado de ingresos registrados para un producto (más recientes primero)."""
    try:
        rows = service.list_ingresos_stock_producto(producto_id, current_user)
        return [schemas.StockIngresoRegistroItem(**x) for x in rows]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error inesperado: {type(e).__name__}")
