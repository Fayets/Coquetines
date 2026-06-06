import secrets

from decouple import config
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from src.controllers.auth_controller import get_admin_user
from src.services.woo_services import WooServices, _UNSET

WOO_API_KEY = (config("WOO_API_KEY", default="") or "").strip()


async def verify_woo_api_key(x_api_key: str = Header(..., alias="X-API-Key")):
    if not WOO_API_KEY or not secrets.compare_digest(x_api_key, WOO_API_KEY):
        raise HTTPException(status_code=401, detail="API key inválida o ausente")


router = APIRouter()
service = WooServices()


class WooVentaProductoItem(BaseModel):
    producto_id: int
    cantidad: int = Field(..., gt=0)
    precio_unitario: float
    tipo_precio: str | None = None


class WooVentaRequest(BaseModel):
    sucursal_id: int | None = None
    cliente: str = Field(..., min_length=1)
    metodo_pago: str = Field(..., min_length=1)
    productos: list[WooVentaProductoItem] = Field(..., min_length=1)


class WooProductoItem(BaseModel):
    id: int
    codigo: str
    nombre: str
    marca: str | None = None
    talle: str
    color: str | None = None
    categoria: str | None = None
    stock: int
    precio_venta: float
    precio_efectivo: float
    precio_transferencia: float
    precio_tipo: str
    precio_base: float
    markup_aplicado: float
    precio: float


class WooVentaResponse(BaseModel):
    message: str
    success: bool
    venta_id: int | None = None


class WooTiendaConfigItem(BaseModel):
    markup_web: float
    precio_tipo_web: str


class WooTiendaProductoAdminItem(BaseModel):
    producto_id: int
    codigo: str
    nombre: str
    talle: str
    stock: int
    publicado: bool
    id: int | None = None
    precio_venta: float
    precio_efectivo: float
    precio_transferencia: float
    precio_et: float
    precio_tipo: str | None = None
    markup: float | None = None
    markup_global: float
    precio_tipo_global: str
    precio_tipo_resuelto: str
    precio_base: float
    markup_aplicado: float
    precio: float


class WooTiendaProductosAdminResponse(BaseModel):
    config: WooTiendaConfigItem
    productos: list[WooTiendaProductoAdminItem]


class WooTiendaProductoActionResponse(BaseModel):
    id: int
    producto_id: int
    activo: bool
    message: str


class WooTiendaConfigPatchRequest(BaseModel):
    markup_web: float | None = None
    precio_tipo_web: str | None = None


class WooTiendaConfigPatchResponse(BaseModel):
    sucursal_tienda_id: int
    markup_web: float
    precio_tipo_web: str
    message: str


class WooTiendaProductoPatchRequest(BaseModel):
    precio_tipo: str | None = None
    markup: float | None = None


class WooTiendaProductoPatchResponse(BaseModel):
    producto_id: int
    precio_tipo: str | None = None
    markup: float | None = None
    precio_base: float
    markup_aplicado: float
    precio: float
    message: str


@router.get("/productos", response_model=list[WooProductoItem], dependencies=[Depends(verify_woo_api_key)])
def list_productos():
    try:
        return service.list_productos()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener productos: {str(e)}")


@router.post("/venta", response_model=WooVentaResponse, status_code=201, dependencies=[Depends(verify_woo_api_key)])
def registrar_venta(body: WooVentaRequest):
    try:
        result = service.crear_venta(
            sucursal_id=body.sucursal_id,
            cliente=body.cliente,
            metodo_pago=body.metodo_pago,
            productos=[p.model_dump() for p in body.productos],
        )
        return {
            "message": result.get("message", "Venta registrada correctamente"),
            "success": True,
            "venta_id": result.get("venta_id"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al registrar la venta: {str(e)}")


@router.get("/tienda/config", response_model=WooTiendaConfigItem)
def get_tienda_config(current_user=Depends(get_admin_user)):
    try:
        cfg = service.get_tienda_config()
        return {
            "markup_web": cfg["markup_web"],
            "precio_tipo_web": cfg["precio_tipo_web"],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener configuración de tienda: {str(e)}")


@router.patch("/tienda/config", response_model=WooTiendaConfigPatchResponse)
def patch_tienda_config(body: WooTiendaConfigPatchRequest, current_user=Depends(get_admin_user)):
    try:
        return service.update_tienda_config(
            markup_web=body.markup_web,
            precio_tipo_web=body.precio_tipo_web,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar configuración de tienda: {str(e)}")


@router.get("/tienda/productos", response_model=WooTiendaProductosAdminResponse)
def list_tienda_productos_admin(current_user=Depends(get_admin_user)):
    try:
        return service.list_tienda_productos_admin()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar productos de tienda: {str(e)}")


@router.patch("/tienda/productos/{producto_id}", response_model=WooTiendaProductoPatchResponse)
def patch_producto_tienda(
    producto_id: int,
    body: WooTiendaProductoPatchRequest,
    current_user=Depends(get_admin_user),
):
    try:
        payload = body.model_dump(exclude_unset=True)
        return service.update_producto_tienda(
            producto_id,
            precio_tipo=payload.get("precio_tipo"),
            markup=payload["markup"] if "markup" in payload else _UNSET,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar producto de tienda: {str(e)}")


@router.post("/tienda/productos/{producto_id}", response_model=WooTiendaProductoActionResponse, status_code=201)
def publicar_producto_tienda(producto_id: int, current_user=Depends(get_admin_user)):
    try:
        return service.publicar_producto(producto_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al publicar producto: {str(e)}")


@router.delete("/tienda/productos/{producto_id}", response_model=WooTiendaProductoActionResponse)
def despublicar_producto_tienda(producto_id: int, current_user=Depends(get_admin_user)):
    try:
        return service.despublicar_producto(producto_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al despublicar producto: {str(e)}")
