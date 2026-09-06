"""Catálogo público (landing / vidriera online).

Endpoint SIN autenticación y de solo lectura. Expone únicamente los productos
publicados en la tienda online con stock > 0 y su precio web ya resuelto
(markup aplicado). No devuelve costos, ni markup, ni precios internos: es la
información que cualquiera puede ver en la landing.

La landing consume esto; el pedido se cierra por WhatsApp, así que este módulo
nunca escribe en la base.
"""

from time import monotonic

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from src.services.catalogo_services import CatalogoServices
from src.services.pedidos_web_services import PedidosWebServices

router = APIRouter()
service = CatalogoServices()
pedidos = PedidosWebServices()

# Cache en memoria: la landing es pública y puede recibir muchas visitas
# seguidas; sin esto cada carga golpea la base.
_CACHE_TTL_SEGUNDOS = 60
_cache: dict | None = None
_cache_ts: float = 0.0


class CatalogoProductoItem(BaseModel):
    id: int
    codigo: str
    nombre: str
    marca: str | None = None
    talle: str
    color: str | None = None
    categoria: str | None = None
    stock: int
    precio: float
    imagen: str | None = None


class CatalogoResponse(BaseModel):
    tienda: str
    disponible: bool
    productos: list[CatalogoProductoItem]
    categorias: list[str]
    talles: list[str]


def _armar_catalogo() -> dict:
    return service.catalogo_publico()


@router.get("/productos", response_model=CatalogoResponse)
def list_catalogo():
    global _cache, _cache_ts
    ahora = monotonic()
    if _cache is not None and (ahora - _cache_ts) < _CACHE_TTL_SEGUNDOS:
        return _cache
    _cache = _armar_catalogo()
    _cache_ts = ahora
    return _cache


# ---------------------------------------------------------------------------
# Alta de pedidos desde la landing.
#
# Público a propósito: la clienta no tiene usuario. El pedido no toca stock ni
# caja — queda en el dashboard para que Coquetines la contacte. Los precios se
# recalculan en el servicio contra el catálogo publicado, nunca se confía en
# los que manda el navegador.
# ---------------------------------------------------------------------------


class PedidoItemRequest(BaseModel):
    producto_id: int
    cantidad: int = Field(..., gt=0)


class PedidoRequest(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=120)
    telefono: str = Field(..., min_length=6, max_length=40)
    localidad: str = Field("", max_length=120)
    nota: str = Field("", max_length=500)
    items: list[PedidoItemRequest] = Field(..., min_length=1)


class PedidoItemResponse(BaseModel):
    codigo: str
    nombre: str
    talle: str
    color: str
    cantidad: int
    precio_unitario: float


class PedidoResponse(BaseModel):
    numero: str
    total: float
    items: list[PedidoItemResponse]


@router.get("/imagen/{imagen_id}")
def obtener_imagen(imagen_id: int):
    """Foto de producto. Pública: la landing la muestra sin sesión."""
    contenido, mime = service.imagen(imagen_id)
    return Response(
        content=contenido,
        media_type=mime,
        # Las fotos no cambian: si cambia, cambia el id y con él la URL.
        headers={"Cache-Control": "public, max-age=604800"},
    )


@router.post("/pedidos", response_model=PedidoResponse, status_code=201)
def crear_pedido(body: PedidoRequest):
    return pedidos.crear(body)
