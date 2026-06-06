from datetime import date

from fastapi import HTTPException
from pony.orm import db_session, flush

from src import models, schemas
from src.services.caja_services import CajaDiariaServices
from src.services.product_services import ProductServices
from src.services.sucursal_services import SucursalServices
from src.services.ventas_services import VentasServices

_sucursal_svc = SucursalServices()


def _require_int(value, field_name: str) -> int:
    if value is None:
        raise HTTPException(
            status_code=500,
            detail=f"{field_name} no está disponible (valor nulo). Revisá la configuración en base de datos.",
        )
    try:
        return int(value)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=500,
            detail=f"{field_name} inválido ({value!r}). Se esperaba un número entero.",
        )


def _get_tienda_online_sucursal_id() -> int:
    with db_session:
        candidatas = list(models.Sucursal.select(lambda s: s.activo))
        sucursales = sorted(
            (s for s in candidatas if s.es_tienda_online and s.id is not None),
            key=lambda s: int(s.id),
        )
        if not sucursales:
            raise HTTPException(
                status_code=400,
                detail="No hay ninguna sucursal configurada como tienda online",
            )
        return _require_int(sucursales[0].id, "id de sucursal tienda online")


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
    pid = _require_int(producto_id, "producto_id")
    stock_sid = _require_int(stock_sucursal_id, "sucursal_stock_id")
    with db_session:
        producto_orig = models.Product.get(id=pid)
        if not producto_orig:
            raise HTTPException(
                status_code=404,
                detail=f"Producto con ID {pid} no encontrado",
            )
        stock_suc = models.Sucursal.get(id=stock_sid)
        if not stock_suc:
            raise HTTPException(status_code=404, detail="Sucursal de stock no encontrada")
        codigo = str(producto_orig.codigo or "").strip()
        default_id = _sucursal_svc.get_or_create_default_sucursal_id()
        producto_stock = models.Product.get(codigo=codigo, sucursal=stock_suc)
        if not producto_stock and stock_sid == default_id:
            producto_stock = models.Product.get(codigo=codigo, sucursal=None)
        if not producto_stock:
            raise HTTPException(
                status_code=400,
                detail=f"No hay stock del producto {codigo} en la sucursal física configurada.",
            )
        return _require_int(producto_stock.id, "id del producto en sucursal de stock")


def _woo_stock_sucursal_id(woo_sucursal_id: int) -> int:
    woo_sid = _require_int(woo_sucursal_id, "id de sucursal tienda online")
    with db_session:
        woo_suc = models.Sucursal.get(id=woo_sid)
        if not woo_suc:
            raise HTTPException(status_code=404, detail="Sucursal WooCommerce no encontrada")
        stock_id = getattr(woo_suc, "sucursal_stock_id", None)
        if stock_id is None:
            raise HTTPException(
                status_code=400,
                detail="La tienda online no tiene sucursal de stock configurada",
            )
        return _require_int(stock_id, "sucursal_stock_id de la tienda online")


def _ids_productos_publicados(tienda_id: int) -> set[int]:
    tid = _require_int(tienda_id, "id de sucursal tienda online")
    with db_session:
        registros = list(models.TiendaOnlineProducto.select())
        ids: set[int] = set()
        for r in registros:
            if not r.activo:
                continue
            suc = r.sucursal_tienda
            prod = r.producto
            if suc is None or prod is None:
                continue
            suc_id = getattr(suc, "id", None)
            prod_id = getattr(prod, "id", None)
            if suc_id is None or prod_id is None:
                continue
            if _require_int(suc_id, "id de sucursal tienda online") == tid:
                ids.add(_require_int(prod_id, "id de producto publicado"))
        return ids


def _producto_a_dict_woo(p: dict) -> dict:
    color = p.get("color") or {}
    categoria = p.get("categoria") or {}
    prod_id = p.get("id")
    if prod_id is None:
        raise HTTPException(status_code=500, detail="Producto sin id en catálogo de stock.")
    return {
        "id": _require_int(prod_id, "producto_id"),
        "codigo": str(p.get("codigo") or ""),
        "nombre": str(p.get("nombre") or ""),
        "marca": p.get("marca"),
        "talle": str(p.get("talle") or ""),
        "color": color.get("name") if isinstance(color, dict) else None,
        "categoria": categoria.get("name") if isinstance(categoria, dict) else None,
        "stock": int(p.get("stock") or 0),
        "precio_venta": float(p.get("precio_venta") or 0),
        "precio_efectivo": float(p.get("precio_efectivo") or 0),
        "precio_transferencia": float(p.get("precio_transferencia") or 0),
    }


class WooServices:
    def __init__(self):
        self._product_service = ProductServices()
        self._ventas_service = VentasServices()

    def list_productos(self) -> list[dict]:
        sid = _get_tienda_online_sucursal_id()
        stock_sid = _woo_stock_sucursal_id(sid)
        publicados = _ids_productos_publicados(sid)
        productos = self._product_service.get_all_products(
            sucursal_id=stock_sid,
            ocultar_costo=True,
        )
        resultado: list[dict] = []
        for p in productos:
            if p.get("id") is None:
                continue
            pid = _require_int(p["id"], "producto_id")
            stock = int(p.get("stock") or 0)
            if stock <= 0 or pid not in publicados:
                continue
            resultado.append(_producto_a_dict_woo(p))
        return resultado

    def list_tienda_productos_admin(self) -> list[dict]:
        sid = _get_tienda_online_sucursal_id()
        stock_sid = _woo_stock_sucursal_id(sid)
        productos = self._product_service.get_all_products(
            sucursal_id=stock_sid,
            ocultar_costo=True,
        )
        with db_session:
            registros = list(models.TiendaOnlineProducto.select())
            por_producto: dict[int, models.TiendaOnlineProducto] = {}
            for r in registros:
                suc = r.sucursal_tienda
                prod = r.producto
                if suc is None or prod is None:
                    continue
                suc_id = getattr(suc, "id", None)
                prod_id = getattr(prod, "id", None)
                if suc_id is None or prod_id is None:
                    continue
                if _require_int(suc_id, "id de sucursal tienda online") == sid:
                    por_producto[_require_int(prod_id, "producto_id")] = r
        resultado: list[dict] = []
        for p in productos:
            if p.get("id") is None:
                continue
            pid = _require_int(p["id"], "producto_id")
            reg = por_producto.get(pid)
            reg_id = _require_int(reg.id, "id de TiendaOnlineProducto") if reg else None
            resultado.append(
                {
                    "producto_id": pid,
                    "codigo": str(p.get("codigo") or ""),
                    "nombre": str(p.get("nombre") or ""),
                    "talle": str(p.get("talle") or ""),
                    "stock": int(p.get("stock") or 0),
                    "publicado": bool(reg.activo) if reg else False,
                    "id": reg_id,
                }
            )
        return resultado

    def publicar_producto(self, producto_id: int) -> dict:
        pid = _require_int(producto_id, "producto_id")
        sid = _get_tienda_online_sucursal_id()
        stock_sid = _woo_stock_sucursal_id(sid)
        default_id = _sucursal_svc.get_or_create_default_sucursal_id()
        with db_session:
            producto = models.Product.get(id=pid)
            if not producto:
                raise HTTPException(status_code=404, detail="Producto no encontrado")
            if producto.id is None:
                raise HTTPException(status_code=500, detail="El producto no tiene id asignado en base de datos.")
            prod_suc_id = producto.sucursal.id if producto.sucursal else None
            if prod_suc_id is None and stock_sid != default_id:
                raise HTTPException(
                    status_code=400,
                    detail="El producto no pertenece a la sucursal de stock de la tienda online",
                )
            if prod_suc_id is not None and _require_int(prod_suc_id, "sucursal del producto") != stock_sid:
                raise HTTPException(
                    status_code=400,
                    detail="El producto no pertenece a la sucursal de stock de la tienda online",
                )
            tienda = models.Sucursal.get(id=sid)
            if not tienda:
                raise HTTPException(status_code=404, detail="Sucursal tienda online no encontrada")
            reg = models.TiendaOnlineProducto.get(sucursal_tienda=tienda, producto=producto)
            if reg:
                reg.activo = True
            else:
                reg = models.TiendaOnlineProducto(
                    sucursal_tienda=tienda,
                    producto=producto,
                    activo=True,
                )
            flush()
            reg_id = _require_int(reg.id, "id de TiendaOnlineProducto")
            prod_id = _require_int(producto.id, "producto_id")
            return {
                "id": reg_id,
                "producto_id": prod_id,
                "activo": True,
                "message": "Producto publicado en la tienda online",
            }

    def despublicar_producto(self, producto_id: int) -> dict:
        pid = _require_int(producto_id, "producto_id")
        sid = _get_tienda_online_sucursal_id()
        with db_session:
            producto = models.Product.get(id=pid)
            if not producto:
                raise HTTPException(status_code=404, detail="Producto no encontrado")
            tienda = models.Sucursal.get(id=sid)
            if not tienda:
                raise HTTPException(status_code=404, detail="Sucursal tienda online no encontrada")
            reg = models.TiendaOnlineProducto.get(sucursal_tienda=tienda, producto=producto)
            if not reg:
                raise HTTPException(
                    status_code=404,
                    detail="El producto no está publicado en la tienda online",
                )
            reg.activo = False
            return {
                "id": _require_int(reg.id, "id de TiendaOnlineProducto"),
                "producto_id": _require_int(producto.id, "producto_id"),
                "activo": False,
                "message": "Producto despublicado de la tienda online",
            }

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
        publicados = _ids_productos_publicados(sid)
        _ensure_caja_abierta_hoy(sid)

        lineas: list[schemas.DetalleVentaCreate] = []
        for item in productos:
            raw_pid = item.get("producto_id")
            if raw_pid is None:
                raise HTTPException(status_code=400, detail="Cada ítem debe incluir producto_id.")
            producto_id_orig = _require_int(raw_pid, "producto_id")
            if producto_id_orig not in publicados:
                raise HTTPException(
                    status_code=400,
                    detail=f"El producto {producto_id_orig} no está publicado en la tienda online",
                )
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
