import secrets

from decouple import config
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from src.services.woo_services import WooServices

WOO_API_KEY = (config("WOO_API_KEY", default="") or "").strip()


async def verify_woo_api_key(x_api_key: str = Header(..., alias="X-API-Key")):
    if not WOO_API_KEY or not secrets.compare_digest(x_api_key, WOO_API_KEY):
        raise HTTPException(status_code=401, detail="API key inválida o ausente")


router = APIRouter(dependencies=[Depends(verify_woo_api_key)])
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


class WooVentaResponse(BaseModel):
    message: str
    success: bool
    venta_id: int | None = None


@router.get("/productos", response_model=list[WooProductoItem])
def list_productos():
    try:
        return service.list_productos()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener productos: {str(e)}")


@router.post("/venta", response_model=WooVentaResponse, status_code=201)
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
