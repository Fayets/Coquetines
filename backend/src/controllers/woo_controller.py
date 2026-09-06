import secrets

from decouple import config
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from src.controllers.auth_controller import get_current_user
from src.services.woo_services import WooServices, _UNSET, assert_usuario_tienda_online

WOO_API_KEY = (config("WOO_API_KEY", default="") or "").strip()


async def verify_woo_api_key(x_api_key: str = Header(..., alias="X-API-Key")):
    if not WOO_API_KEY or not secrets.compare_digest(x_api_key, WOO_API_KEY):
        raise HTTPException(status_code=401, detail="API key inválida o ausente")


router = APIRouter()
service = WooServices()


async def get_tienda_online_user(current_user=Depends(get_current_user)):
    assert_usuario_tienda_online(current_user)
    return current_user


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


class WooCommerceProductoItem(BaseModel):
    woo_id: int
    nombre: str
    sku: str
    precio: float
    stock: int | None = None
    stock_status: str | None = None
    estado: str
    estado_label: str
    imagen_url: str | None = None


class WooSyncProductoResponse(BaseModel):
    producto_id: int
    woo_id: int | None = None
    sku: str
    action: str | None = None
    message: str


class WooCommerceImagenItem(BaseModel):
    id: int | None = None
    url: str
    alt: str = ""


class WooCommerceCategoriaItem(BaseModel):
    id: int | None = None
    nombre: str
    slug: str = ""
    parent: int = 0


class WooCommerceAtributoItem(BaseModel):
    id: int = 0
    nombre: str
    opciones: list[str]
    visible: bool
    variacion: bool


class WooCommerceVariacionAtributoItem(BaseModel):
    nombre: str
    opcion: str


class WooCommerceVariacionItem(BaseModel):
    variacion_id: int
    sku: str
    precio_regular: str
    precio_oferta: str
    stock: int | None = None
    stock_status: str | None = None
    estado: str
    estado_label: str
    atributos: list[WooCommerceVariacionAtributoItem]


class WooCommerceProductoDetalleItem(BaseModel):
    woo_id: int
    tipo: str
    tipo_label: str
    nombre: str
    descripcion: str
    descripcion_corta: str
    precio_regular: str
    precio_oferta: str
    stock: int | None = None
    stock_status: str | None = None
    manage_stock: bool = False
    imagenes: list[WooCommerceImagenItem]
    categorias: list[WooCommerceCategoriaItem]
    atributos: list[WooCommerceAtributoItem]
    variaciones: list[WooCommerceVariacionItem]
    estado: str
    estado_label: str
    sku: str


class WooCommerceVariacionPatchItem(BaseModel):
    variacion_id: int
    precio_regular: str | None = None
    precio_oferta: str | None = None
    stock: int | None = None


class WooCommerceProductoPatchRequest(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    descripcion_corta: str | None = None
    precio_regular: str | None = None
    precio_oferta: str | None = None
    stock: int | None = None
    estado: str | None = None
    atributos: list[WooCommerceAtributoItem] | None = None
    categoria_id: int | None = None
    tipo: str | None = None
    variaciones: list[WooCommerceVariacionPatchItem] | None = None
    generar_variaciones: bool | None = None
    imagenes: list[WooCommerceImagenItem] | None = None


class WooCommerceProductoPatchResponse(WooCommerceProductoDetalleItem):
    message: str


class WooCommerceDeleteResponse(BaseModel):
    woo_id: int
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
def get_tienda_config(current_user=Depends(get_tienda_online_user)):
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
def patch_tienda_config(body: WooTiendaConfigPatchRequest, current_user=Depends(get_tienda_online_user)):
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
def list_tienda_productos_admin(current_user=Depends(get_tienda_online_user)):
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
    current_user=Depends(get_tienda_online_user),
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
def publicar_producto_tienda(producto_id: int, current_user=Depends(get_tienda_online_user)):
    try:
        return service.publicar_producto(producto_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al publicar producto: {str(e)}")


@router.get("/tienda/woocommerce-productos", response_model=list[WooCommerceProductoItem])
def list_woocommerce_productos(current_user=Depends(get_tienda_online_user)):
    try:
        return service.list_woocommerce_productos()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar productos de WooCommerce: {str(e)}")


@router.post("/tienda/woocommerce-imagenes", response_model=WooCommerceImagenItem)
async def upload_woocommerce_imagen(
    file: UploadFile = File(...),
    current_user=Depends(get_tienda_online_user),
):
    try:
        content = await file.read()
        return service.upload_woocommerce_imagen(
            content,
            filename=file.filename or "imagen.jpg",
            content_type=file.content_type or "application/octet-stream",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al subir imagen: {str(e)}")


@router.get("/tienda/woocommerce-categorias", response_model=list[WooCommerceCategoriaItem])
def list_woocommerce_categorias(current_user=Depends(get_tienda_online_user)):
    try:
        return service.list_woocommerce_categorias()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar categorías de WooCommerce: {str(e)}")


@router.get("/tienda/woocommerce-productos/{woo_id}", response_model=WooCommerceProductoDetalleItem)
def get_woocommerce_producto(woo_id: int, current_user=Depends(get_tienda_online_user)):
    try:
        return service.get_woocommerce_producto(woo_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener producto de WooCommerce: {str(e)}")


@router.patch("/tienda/woocommerce-productos/{woo_id}", response_model=WooCommerceProductoPatchResponse)
def patch_woocommerce_producto(
    woo_id: int,
    body: WooCommerceProductoPatchRequest,
    current_user=Depends(get_tienda_online_user),
):
    try:
        payload = body.model_dump(exclude_unset=True)
        if "atributos" in payload and payload["atributos"] is not None:
            payload["atributos"] = [a for a in payload["atributos"]]
        return service.update_woocommerce_producto(woo_id, **payload)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar producto en WooCommerce: {str(e)}")


@router.delete("/tienda/woocommerce-productos/{woo_id}", response_model=WooCommerceDeleteResponse)
def delete_woocommerce_producto(
    woo_id: int,
    force: bool = True,
    current_user=Depends(get_tienda_online_user),
):
    try:
        return service.delete_woocommerce_producto(woo_id, force=force)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al eliminar producto en WooCommerce: {str(e)}")


@router.delete("/tienda/productos/{producto_id}", response_model=WooTiendaProductoActionResponse)
def despublicar_producto_tienda(producto_id: int, current_user=Depends(get_tienda_online_user)):
    try:
        return service.despublicar_producto(producto_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al despublicar producto: {str(e)}")


@router.post("/tienda/sync-producto/{producto_id}", response_model=WooSyncProductoResponse, status_code=201)
def sync_producto_woocommerce(producto_id: int, current_user=Depends(get_tienda_online_user)):
    try:
        return service.sync_producto_woocommerce(producto_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al sincronizar producto con WooCommerce: {str(e)}")


@router.delete("/tienda/sync-producto/{producto_id}", response_model=WooSyncProductoResponse)
def unsync_producto_woocommerce(producto_id: int, current_user=Depends(get_tienda_online_user)):
    try:
        return service.unsync_producto_woocommerce(producto_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al despublicar producto en WooCommerce: {str(e)}")
