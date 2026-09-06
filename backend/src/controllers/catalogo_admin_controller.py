"""Administración del catálogo web desde el panel.

Lo maneja la dueña (OWNER). No hay sucursal "tienda online" de por medio:
cualquier producto de cualquier sucursal se puede publicar, ponerle foto y
fijarle un precio web.
"""

from fastapi import APIRouter, Depends, File, Query, UploadFile
from pydantic import BaseModel, Field

from src.controllers.auth_controller import get_current_user
from src.services.catalogo_services import CatalogoServices

router = APIRouter()
service = CatalogoServices()


async def get_usuario_catalogo(current_user=Depends(get_current_user)):
    """La dueña y los administradores manejan el catálogo."""
    from fastapi import HTTPException

    if getattr(current_user, "role", None) not in ("OWNER", "ADMIN"):
        raise HTTPException(
            status_code=403,
            detail="Solo la dueña o un administrador pueden manejar el catálogo web.",
        )
    return current_user


class ProductoCatalogoItem(BaseModel):
    id: int
    codigo: str
    nombre: str
    marca: str
    talle: str
    color: str
    categoria: str
    sucursal: str
    sucursal_id: int | None = None
    stock: int
    precio_venta: float
    precio_web: float
    precio_publico: float
    publicado_web: bool
    imagen_url: str
    orden_web: int
    # Total publicado tras el cambio (solo viene en el PATCH).
    publicados: int | None = None


class ListadoResponse(BaseModel):
    productos: list[ProductoCatalogoItem]
    total: int
    publicados: int
    pagina: int
    paginas: int


class ActualizarRequest(BaseModel):
    publicado_web: bool | None = None
    precio_web: float | None = Field(None, ge=0)
    imagen_url: str | None = None
    orden_web: int | None = None


class PublicarVariosRequest(BaseModel):
    ids: list[int] = Field(..., min_length=1, max_length=200)
    publicado: bool


class PublicarVariosResponse(BaseModel):
    actualizados: int
    publicado: bool


class ImagenResponse(BaseModel):
    imagen_url: str
    peso_kb: float | None = None


@router.get("", response_model=ListadoResponse)
def listar(
    busqueda: str | None = Query(None),
    solo_publicados: bool = Query(False),
    sucursal_id: int | None = Query(None),
    limite: int = Query(60, ge=1, le=200),
    pagina: int = Query(1, ge=1),
    current_user=Depends(get_usuario_catalogo),
):
    return service.listar_admin(
        busqueda=busqueda,
        solo_publicados=solo_publicados,
        sucursal_id=sucursal_id,
        limite=limite,
        pagina=pagina,
    )


@router.patch("/{producto_id}", response_model=ProductoCatalogoItem)
def actualizar(
    producto_id: int,
    body: ActualizarRequest,
    current_user=Depends(get_usuario_catalogo),
):
    return service.actualizar(producto_id, body.model_dump(exclude_unset=True))


@router.post("/publicar", response_model=PublicarVariosResponse)
def publicar_varios(
    body: PublicarVariosRequest,
    current_user=Depends(get_usuario_catalogo),
):
    return service.publicar_varios(body.ids, body.publicado)


@router.post("/{producto_id}/imagen", response_model=ImagenResponse, status_code=201)
async def subir_imagen(
    producto_id: int,
    archivo: UploadFile = File(...),
    current_user=Depends(get_usuario_catalogo),
):
    datos = await archivo.read()
    return service.guardar_imagen(producto_id, datos, archivo.content_type or "")


@router.delete("/{producto_id}/imagen", response_model=ImagenResponse)
def borrar_imagen(producto_id: int, current_user=Depends(get_usuario_catalogo)):
    return service.borrar_imagen(producto_id)
