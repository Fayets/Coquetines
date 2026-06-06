from datetime import date

from fastapi import HTTPException
from pony.orm import db_session

from src import models, schemas
from src.services.caja_services import CajaDiariaServices
from src.services.product_services import ProductServices
from src.services.sucursal_services import SucursalServices
from src.services.ventas_services import VentasServices

_sucursal_svc = SucursalServices()


def _get_tienda_online_sucursal_id() -> int:
    with db_session:
        candidatas = list(models.Sucursal.select(lambda s: s.activo))
        sucursales = sorted(
            (s for s in candidatas if s.es_tienda_online),
            key=lambda s: s.id,
        )
        if not sucursales:
            raise HTTPException(
                status_code=400,
                detail="No hay ninguna sucursal configurada como tienda online",
            )
        return int(sucursales[0].id)


def _ensure_caja_abierta_hoy(sucursal_id: int) -> None:
    """Abre caja del día (turno mañana, saldo 0) si no hay ninguna abierta para la sucursal."""
    caja_svc = CajaDiariaServices()
    hoy = date.today()
    with db_session:
        abiertas = caja_svc._cajas_abiertas_del_dia(sucursal_id, hoy)
    if len(abiertas) > 1:
        raise HTTPException(
            status_code=400,
            detail="Hay más de una caja abierta el mismo día. Cerrá un turno antes de continuar.",
        )
    if len(abiertas) == 0:
        caja_svc.abrir_caja(sucursal_id=sucursal_id, saldo_inicial=0, fecha=hoy)


def _producto_id_en_sucursal_stock(producto_id: int, stock_sucursal_id: int) -> int:
    """Resuelve el producto equivalente (mismo código) en la sucursal física de stock."""
    with db_session:
        producto_orig = models.Product.get(id=int(producto_id))
        if not producto_orig:
            raise HTTPException(
                status_code=404,
                detail=f"Producto con ID {producto_id} no encontrado",
            )
        stock_suc = models.Sucursal.get(id=int(stock_sucursal_id))
        if not stock_suc:
            raise HTTPException(status_code=404, detail="Sucursal de stock no encontrada")
        codigo = str(producto_orig.codigo or "").strip()
        default_id = _sucursal_svc.get_or_create_default_sucursal_id()
        producto_stock = models.Product.get(codigo=codigo, sucursal=stock_suc)
        if not producto_stock and int(stock_sucursal_id) == default_id:
            producto_stock = models.Product.get(codigo=codigo, sucursal=None)
        if not producto_stock:
            raise HTTPException(
                status_code=400,
                detail=f"No hay stock del producto {codigo} en la sucursal física configurada.",
            )
        return int(producto_stock.id)


def _woo_stock_sucursal_id(woo_sucursal_id: int) -> int:
    with db_session:
        woo_suc = models.Sucursal.get(id=int(woo_sucursal_id))
        if not woo_suc:
            raise HTTPException(status_code=404, detail="Sucursal WooCommerce no encontrada")
        stock_id = getattr(woo_suc, "sucursal_stock_id", None)
        if stock_id is None:
            raise HTTPException(
                status_code=400,
                detail="La tienda online no tiene sucursal de stock configurada",
            )
        return int(stock_id)


class WooServices:
    def __init__(self):
        self._product_service = ProductServices()
        self._ventas_service = VentasServices()

    def list_productos(self) -> list[dict]:
        sid = _get_tienda_online_sucursal_id()
        stock_sid = _woo_stock_sucursal_id(sid)
        productos = self._product_service.get_all_products(
            sucursal_id=int(stock_sid),
            ocultar_costo=True,
        )
        resultado: list[dict] = []
        for p in productos:
            stock = int(p.get("stock") or 0)
            if stock <= 0:
                continue
            color = p.get("color") or {}
            categoria = p.get("categoria") or {}
            resultado.append(
                {
                    "id": int(p["id"]),
                    "codigo": str(p.get("codigo") or ""),
                    "nombre": str(p.get("nombre") or ""),
                    "marca": p.get("marca"),
                    "talle": str(p.get("talle") or ""),
                    "color": color.get("name") if isinstance(color, dict) else None,
                    "categoria": categoria.get("name") if isinstance(categoria, dict) else None,
                    "stock": stock,
                    "precio_venta": float(p.get("precio_venta") or 0),
                    "precio_efectivo": float(p.get("precio_efectivo") or 0),
                    "precio_transferencia": float(p.get("precio_transferencia") or 0),
                }
            )
        return resultado

    def crear_venta(
        self,
        sucursal_id: int,
        cliente: str,
        metodo_pago: str,
        productos: list[dict],
    ) -> dict:
        if not productos:
            raise HTTPException(status_code=400, detail="La venta debe incluir al menos un producto.")

        sid = _get_tienda_online_sucursal_id()
        stock_sid = _woo_stock_sucursal_id(sid)
        _ensure_caja_abierta_hoy(sid)

        lineas: list[schemas.DetalleVentaCreate] = []
        for item in productos:
            producto_id_orig = int(item["producto_id"])
            producto_id_stock = _producto_id_en_sucursal_stock(producto_id_orig, stock_sid)
            lineas.append(
                schemas.DetalleVentaCreate(
                    producto_id=producto_id_stock,
                    cantidad=int(item["cantidad"]),
                    precio_unitario=float(item["precio_unitario"]),
                    tipo_precio=item.get("tipo_precio"),
                )
            )

        venta_data = schemas.VentaCreate(
            sucursal_id=sid,
            cliente=str(cliente).strip(),
            metodo_pago=str(metodo_pago).strip(),
            productos=lineas,
        )
        return self._ventas_service.create_venta(venta_data, sucursal_id=sid)
