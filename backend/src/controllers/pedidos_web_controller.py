"""Pedidos web en el panel: bandeja para atender lo que llega del catálogo."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from src.controllers.auth_controller import get_current_user
from src.services.pedidos_web_services import PedidosWebServices
from src.services.woo_services import assert_usuario_tienda_online

router = APIRouter()
service = PedidosWebServices()


async def get_usuario_pedidos(current_user=Depends(get_current_user)):
    """La dueña ve todo; el resto, solo si atiende la tienda online."""
    if getattr(current_user, "role", None) == "OWNER":
        return current_user
    assert_usuario_tienda_online(current_user)
    return current_user


class PedidoItemItem(BaseModel):
    codigo: str
    nombre: str
    talle: str
    color: str
    cantidad: int
    precio_unitario: float
    subtotal: float


class PedidoItem(BaseModel):
    id: int
    numero: str
    cliente_nombre: str
    cliente_telefono: str
    cliente_localidad: str
    nota: str
    total: float
    estado: str
    fecha_hora: str | None = None
    contactado_en: str | None = None
    cantidad_items: int
    venta_id: int | None = None
    items: list[PedidoItemItem] = []


class PedidosResponse(BaseModel):
    pedidos: list[PedidoItem]
    conteos: dict[str, int]


class NuevosResponse(BaseModel):
    nuevos: int


class EstadoRequest(BaseModel):
    estado: str
    # Se completa cuando el pedido se cerró generando una venta.
    venta_id: int | None = None


class ItemVentaItem(BaseModel):
    producto_id: int | None = None
    codigo: str
    nombre: str
    talle: str
    color: str
    cantidad: int
    precio_pedido: float
    stock_actual: int
    sucursal_id: int | None = None
    sucursal: str
    disponible: bool


class EliminarResponse(BaseModel):
    message: str
    venta_eliminada: bool


class ParaVentaResponse(BaseModel):
    pedido: PedidoItem
    items: list[ItemVentaItem]
    sucursales_involucradas: list[int]
    todo_disponible: bool


@router.get("", response_model=PedidosResponse)
def listar_pedidos(
    estado: str | None = Query(None, description="NUEVO | CONTACTADO | CONFIRMADO | CANCELADO | TODOS"),
    limite: int = Query(100, ge=1, le=500),
    current_user=Depends(get_usuario_pedidos),
):
    return service.listar(estado=estado, limite=limite)


@router.get("/nuevos", response_model=NuevosResponse)
def contar_nuevos(current_user=Depends(get_usuario_pedidos)):
    """Sondeo barato para el aviso del panel: solo devuelve el número."""
    return {"nuevos": service.contar_nuevos()}


@router.patch("/{pedido_id}", response_model=PedidoItem)
def cambiar_estado(
    pedido_id: int,
    body: EstadoRequest,
    current_user=Depends(get_usuario_pedidos),
):
    return service.cambiar_estado(pedido_id, body.estado, body.venta_id)


@router.get("/{pedido_id}/para-venta", response_model=ParaVentaResponse)
def para_venta(pedido_id: int, current_user=Depends(get_usuario_pedidos)):
    """Lo que necesita la pantalla de venta para precargarse desde el pedido."""
    return service.items_para_venta(pedido_id)


@router.delete("/{pedido_id}", response_model=EliminarResponse)
def eliminar_pedido(
    pedido_id: int,
    eliminar_venta: bool = Query(
        False,
        description="Si el pedido ya generó una venta, borrarla también y devolver el stock",
    ),
    current_user=Depends(get_usuario_pedidos),
):
    return service.eliminar(pedido_id, eliminar_venta=eliminar_venta)
