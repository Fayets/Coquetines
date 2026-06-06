from datetime import date

from fastapi import HTTPException
from pony.orm import db_session, flush

from src import models, schemas
from src.services.caja_services import CajaDiariaServices
from src.services.product_services import ProductServices
from src.services.sucursal_services import SucursalServices
from src.services.ventas_services import VentasServices

_sucursal_svc = SucursalServices()

PRECIO_TIPOS_VALIDOS = frozenset(
    {"precio_venta", "precio_efectivo", "precio_transferencia", "precio_et"}
)
_UNSET = object()


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


def _as_float(value, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _validar_precio_tipo(precio_tipo: str | None) -> str:
    tipo = (precio_tipo or "precio_venta").strip()
    if tipo not in PRECIO_TIPOS_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"precio_tipo inválido ({tipo!r}). Valores: {', '.join(sorted(PRECIO_TIPOS_VALIDOS))}.",
        )
    return tipo


def _precio_base_desde_dict(producto: dict, precio_tipo: str) -> float:
    tipo = _validar_precio_tipo(precio_tipo)
    pv = _as_float(producto.get("precio_venta"))
    if tipo == "precio_venta":
        return pv
    if tipo == "precio_efectivo":
        pe = _as_float(producto.get("precio_efectivo"))
        return pe if pe > 0 else pv
    if tipo == "precio_transferencia":
        pt = _as_float(producto.get("precio_transferencia"))
        return pt if pt > 0 else pv
    if tipo == "precio_et":
        pet = _as_float(producto.get("precio_et"))
        return pet if pet > 0 else pv
    return pv


def _aplicar_markup(precio_base: float, markup_pct: float) -> float:
    base = _as_float(precio_base)
    markup = _as_float(markup_pct)
    return round(base * (1.0 + markup / 100.0), 2)


def _resolve_precio_tipo(reg: models.TiendaOnlineProducto | None, tienda: models.Sucursal) -> str:
    if reg is not None and reg.precio_tipo is not None and str(reg.precio_tipo).strip():
        return _validar_precio_tipo(reg.precio_tipo)
    global_tipo = getattr(tienda, "precio_tipo_web", None)
    return _validar_precio_tipo(global_tipo if global_tipo else "precio_venta")


def _resolve_markup(reg: models.TiendaOnlineProducto | None, tienda: models.Sucursal) -> float:
    if reg is not None and reg.markup is not None:
        return _as_float(reg.markup)
    return _as_float(getattr(tienda, "markup_web", 0))


def _find_tienda_online() -> models.Sucursal:
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
    tienda = sucursales[0]
    if tienda.id is None:
        raise HTTPException(status_code=500, detail="La sucursal tienda online no tiene id asignado.")
    return tienda


def _get_tienda_online_sucursal() -> models.Sucursal:
    with db_session:
        return _find_tienda_online()


def _get_tienda_online_sucursal_id() -> int:
    with db_session:
        return _require_int(_find_tienda_online().id, "id de sucursal tienda online")


def _ensure_caja_abierta_hoy(sucursal_id: int) -> None:
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
    pid = _require_int(producto_id, "producto_id")
    stock_sid = _require_int(stock_sucursal_id, "sucursal_stock_id")
    with db_session:
        producto_orig = models.Product.get(id=pid)
        if not producto_orig:
            raise HTTPException(status_code=404, detail=f"Producto con ID {pid} no encontrado")
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


def _stock_sucursal_id_for_tienda(tienda: models.Sucursal) -> int:
    stock_id = getattr(tienda, "sucursal_stock_id", None)
    if stock_id is None:
        raise HTTPException(
            status_code=400,
            detail="La tienda online no tiene sucursal de stock configurada",
        )
    return _require_int(stock_id, "sucursal_stock_id de la tienda online")


def _woo_stock_sucursal_id(woo_sucursal_id: int) -> int:
    woo_sid = _require_int(woo_sucursal_id, "id de sucursal tienda online")
    with db_session:
        woo_suc = models.Sucursal.get(id=woo_sid)
        if not woo_suc:
            raise HTTPException(status_code=404, detail="Sucursal WooCommerce no encontrada")
        return _stock_sucursal_id_for_tienda(woo_suc)


def _registros_por_producto(tienda_id: int) -> dict[int, models.TiendaOnlineProducto]:
    tid = _require_int(tienda_id, "id de sucursal tienda online")
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
        if _require_int(suc_id, "id de sucursal tienda online") == tid:
            por_producto[_require_int(prod_id, "producto_id")] = r
    return por_producto


def _ids_productos_publicados(tienda_id: int) -> set[int]:
    por_producto = _registros_por_producto(tienda_id)
    return {pid for pid, reg in por_producto.items() if reg.activo}


def _precio_web_payload(producto: dict, reg: models.TiendaOnlineProducto | None, tienda: models.Sucursal) -> dict:
    precio_tipo = _resolve_precio_tipo(reg, tienda)
    markup_aplicado = _resolve_markup(reg, tienda)
    precio_base = _precio_base_desde_dict(producto, precio_tipo)
    precio_final = _aplicar_markup(precio_base, markup_aplicado)
    return {
        "precio_tipo": precio_tipo,
        "markup_aplicado": markup_aplicado,
        "precio_base": precio_base,
        "precio": precio_final,
    }


def _producto_a_dict_woo(p: dict, reg: models.TiendaOnlineProducto | None, tienda: models.Sucursal) -> dict:
    color = p.get("color") or {}
    categoria = p.get("categoria") or {}
    prod_id = p.get("id")
    if prod_id is None:
        raise HTTPException(status_code=500, detail="Producto sin id en catálogo de stock.")
    precios = _precio_web_payload(p, reg, tienda)
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
        **precios,
    }


class WooServices:
    def __init__(self):
        self._product_service = ProductServices()
        self._ventas_service = VentasServices()

    def get_tienda_config(self) -> dict:
        with db_session:
            tienda = _find_tienda_online()
            return {
                "sucursal_tienda_id": _require_int(tienda.id, "id de sucursal tienda online"),
                "nombre": tienda.nombre,
                "markup_web": _as_float(getattr(tienda, "markup_web", 0)),
                "precio_tipo_web": _validar_precio_tipo(getattr(tienda, "precio_tipo_web", None)),
            }

    def update_tienda_config(
        self,
        markup_web: float | None = None,
        precio_tipo_web: str | None = None,
    ) -> dict:
        with db_session:
            tienda = _find_tienda_online()
            if markup_web is not None:
                tienda.markup_web = _as_float(markup_web)
            if precio_tipo_web is not None:
                tienda.precio_tipo_web = _validar_precio_tipo(precio_tipo_web)
            return {
                "sucursal_tienda_id": _require_int(tienda.id, "id de sucursal tienda online"),
                "markup_web": _as_float(getattr(tienda, "markup_web", 0)),
                "precio_tipo_web": _validar_precio_tipo(getattr(tienda, "precio_tipo_web", None)),
                "message": "Configuración de tienda online actualizada",
            }

    def list_productos(self) -> list[dict]:
        with db_session:
            tienda = _find_tienda_online()
            sid = _require_int(tienda.id, "id de sucursal tienda online")
            stock_sid = _stock_sucursal_id_for_tienda(tienda)
            publicados = _ids_productos_publicados(sid)
            por_producto = _registros_por_producto(sid)
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
                reg = por_producto.get(pid)
                resultado.append(_producto_a_dict_woo(p, reg, tienda))
            return resultado

    def list_tienda_productos_admin(self) -> dict:
        with db_session:
            tienda = _find_tienda_online()
            sid = _require_int(tienda.id, "id de sucursal tienda online")
            stock_sid = _stock_sucursal_id_for_tienda(tienda)
            markup_global = _as_float(getattr(tienda, "markup_web", 0))
            precio_tipo_global = _validar_precio_tipo(getattr(tienda, "precio_tipo_web", None))
            por_producto = _registros_por_producto(sid)
            productos = self._product_service.get_all_products(
                sucursal_id=stock_sid,
                ocultar_costo=True,
            )
            items: list[dict] = []
            for p in productos:
                if p.get("id") is None:
                    continue
                pid = _require_int(p["id"], "producto_id")
                reg = por_producto.get(pid)
                reg_id = _require_int(reg.id, "id de TiendaOnlineProducto") if reg else None
                precio_payload = _precio_web_payload(p, reg, tienda)
                items.append(
                    {
                        "producto_id": pid,
                        "codigo": str(p.get("codigo") or ""),
                        "nombre": str(p.get("nombre") or ""),
                        "talle": str(p.get("talle") or ""),
                        "stock": int(p.get("stock") or 0),
                        "publicado": bool(reg.activo) if reg else False,
                        "id": reg_id,
                        "precio_venta": _as_float(p.get("precio_venta")),
                        "precio_efectivo": _as_float(p.get("precio_efectivo")),
                        "precio_transferencia": _as_float(p.get("precio_transferencia")),
                        "precio_et": _as_float(p.get("precio_et")),
                        "precio_tipo": reg.precio_tipo if reg else None,
                        "markup": reg.markup if reg and reg.markup is not None else None,
                        "markup_global": markup_global,
                        "precio_tipo_global": precio_tipo_global,
                        "precio_tipo_resuelto": precio_payload["precio_tipo"],
                        "precio_base": precio_payload["precio_base"],
                        "markup_aplicado": precio_payload["markup_aplicado"],
                        "precio": precio_payload["precio"],
                    }
                )
            return {
                "config": {
                    "markup_web": markup_global,
                    "precio_tipo_web": precio_tipo_global,
                },
                "productos": items,
            }

    def update_producto_tienda(
        self,
        producto_id: int,
        precio_tipo: str | None = None,
        markup=_UNSET,
    ) -> dict:
        pid = _require_int(producto_id, "producto_id")
        sid = _get_tienda_online_sucursal_id()
        with db_session:
            tienda = models.Sucursal.get(id=sid)
            if not tienda:
                raise HTTPException(status_code=404, detail="Sucursal tienda online no encontrada")
            producto = models.Product.get(id=pid)
            if not producto:
                raise HTTPException(status_code=404, detail="Producto no encontrado")
            reg = models.TiendaOnlineProducto.get(sucursal_tienda=tienda, producto=producto)
            if not reg:
                raise HTTPException(
                    status_code=404,
                    detail="El producto no está publicado en la tienda online",
                )
            if precio_tipo is not None:
                reg.precio_tipo = _validar_precio_tipo(precio_tipo)
            if markup is not _UNSET:
                reg.markup = None if markup is None else _as_float(markup)
            flush()
            stock_sid = _stock_sucursal_id_for_tienda(tienda)
            productos = self._product_service.get_all_products(sucursal_id=stock_sid, ocultar_costo=True)
            p_dict = next((x for x in productos if x.get("id") == pid), None)
            if not p_dict:
                raise HTTPException(status_code=404, detail="Producto no encontrado en catálogo de stock")
            precio_payload = _precio_web_payload(p_dict, reg, tienda)
            return {
                "producto_id": pid,
                "precio_tipo": reg.precio_tipo,
                "markup": reg.markup,
                **precio_payload,
                "message": "Producto de tienda online actualizado",
            }

    def publicar_producto(self, producto_id: int) -> dict:
        pid = _require_int(producto_id, "producto_id")
        sid = _get_tienda_online_sucursal_id()
        stock_sid = _woo_stock_sucursal_id(sid)
        default_id = _sucursal_svc.get_or_create_default_sucursal_id()
        with db_session:
            producto = models.Product.get(id=pid)
            if not producto:
                raise HTTPException(status_code=404, detail="Producto no encontrado")
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
                    precio_tipo=_validar_precio_tipo(getattr(tienda, "precio_tipo_web", None)),
                    markup=None,
                )
            flush()
            return {
                "id": _require_int(reg.id, "id de TiendaOnlineProducto"),
                "producto_id": _require_int(producto.id, "producto_id"),
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
