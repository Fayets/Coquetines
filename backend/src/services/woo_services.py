from datetime import date
import itertools
import uuid
from pathlib import Path

import httpx
from decouple import config
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


def assert_usuario_tienda_online(current_user) -> None:
    """Usuarios ADMIN/EMPLEADO asignados a la sucursal marcada como tienda online."""
    role = getattr(current_user, "role", None)
    if role not in ("ADMIN", "EMPLEADO"):
        raise HTTPException(
            status_code=403,
            detail="Solo usuarios de la sucursal tienda online pueden realizar esta acción.",
        )
    sucursal_id = getattr(current_user, "sucursal_id", None)
    if sucursal_id is None:
        raise HTTPException(
            status_code=403,
            detail="Tu usuario no está asignado a la sucursal tienda online.",
        )
    with db_session:
        tienda = _find_tienda_online()
        if _require_int(tienda.id, "id de sucursal tienda online") != _require_int(
            sucursal_id, "sucursal del usuario"
        ):
            raise HTTPException(
                status_code=403,
                detail="Solo usuarios de la sucursal tienda online pueden acceder.",
            )


def _woo_rest_credentials() -> tuple[str, str, str]:
    base = (config("WOO_STORE_URL", default="") or config("WOO_URL", default="") or "").strip().rstrip("/")
    consumer_key = (config("WOO_CONSUMER_KEY", default="") or "").strip()
    consumer_secret = (config("WOO_CONSUMER_SECRET", default="") or "").strip()
    if not base or not consumer_key or not consumer_secret:
        raise HTTPException(
            status_code=503,
            detail=(
                "WooCommerce no está configurado en el servidor. "
                "Definí WOO_STORE_URL, WOO_CONSUMER_KEY y WOO_CONSUMER_SECRET en el .env."
            ),
        )
    return base, consumer_key, consumer_secret


def _build_producto_sku(codigo: str, talle: str) -> str:
    codigo = str(codigo or "").strip()
    talle = str(talle or "").strip()
    if talle:
        return f"{codigo}-{talle}"
    return codigo


def _build_producto_nombre_woo(nombre: str, talle: str) -> str:
    nombre = str(nombre or "").strip()
    talle = str(talle or "").strip()
    if talle:
        return f"{nombre} - Talle {talle}"
    return nombre


def _woo_auth_params(consumer_key: str, consumer_secret: str) -> dict:
    return {"consumer_key": consumer_key, "consumer_secret": consumer_secret}


_WOO_IMAGE_CONTENT_TYPES = frozenset(
    {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}
)
_WOO_MAX_IMAGE_BYTES = 5 * 1024 * 1024
_WOO_IMAGE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
_WOO_UPLOADS_DIR = Path(__file__).resolve().parents[2] / "uploads" / "woo"


def _woo_wp_app_password() -> tuple[str, str] | None:
    user = (config("WOO_WP_USER", default="") or "").strip()
    password = (config("WOO_WP_APP_PASSWORD", default="") or "").replace(" ", "").strip()
    if user and password:
        return user, password
    return None


def _woo_public_api_url() -> str:
    return (config("PUBLIC_API_URL", default="") or "").strip().rstrip("/")


def _woo_upload_permission_help() -> str:
    return (
        "No se pudo subir la imagen a WordPress. Probá una de estas opciones:\n"
        "1. En WordPress, creá una contraseña de aplicación (Usuario administrador → Perfil → "
        "Contraseñas de aplicación) y agregá WOO_WP_USER y WOO_WP_APP_PASSWORD en el .env.\n"
        "2. O definí PUBLIC_API_URL con la URL pública de este backend para importar la imagen "
        "en Woo al guardar el producto.\n"
        "3. O usá el campo URL con un enlace directo a la imagen."
    )


def _woo_media_a_dict(item: dict) -> dict:
    guid = item.get("guid")
    guid_url = guid.get("rendered") if isinstance(guid, dict) else ""
    src = str(item.get("source_url") or guid_url or "")
    return {
        "id": _require_int(item.get("id"), "id de media WooCommerce"),
        "url": src,
        "alt": str(item.get("alt_text") or ""),
    }


def _woo_build_images_payload(imagenes: list[dict]) -> list[dict]:
    payload: list[dict] = []
    for img in imagenes:
        if not isinstance(img, dict):
            continue
        img_id = img.get("id")
        url = str(img.get("url") or img.get("src") or "").strip()
        alt = str(img.get("alt") or "").strip()
        entry: dict = {}
        if img_id not in (None, "", 0):
            entry["id"] = int(img_id)
            if alt:
                entry["alt"] = alt
        elif url:
            entry["src"] = url
            if alt:
                entry["alt"] = alt
        else:
            continue
        payload.append(entry)
    return payload


def _woo_upload_media_response(response: httpx.Response) -> dict:
    if response.status_code >= 400:
        detail = "Error al subir imagen a WordPress"
        try:
            body = response.json()
            if isinstance(body, dict) and body.get("message"):
                detail = str(body["message"])
        except Exception:
            pass
        raise HTTPException(status_code=502, detail=detail)
    item = response.json()
    if not isinstance(item, dict):
        raise HTTPException(status_code=502, detail="Respuesta inesperada al subir imagen.")
    return _woo_media_a_dict(item)


def _woo_upload_media_wp(
    client: httpx.Client,
    base_url: str,
    file_bytes: bytes,
    filename: str,
    content_type: str,
    auth: dict | None = None,
    basic_auth: tuple[str, str] | None = None,
) -> dict:
    safe_name = filename.replace('"', "").strip() or "imagen.jpg"
    headers = {
        "Content-Disposition": f'attachment; filename="{safe_name}"',
        "Content-Type": content_type,
    }
    kwargs: dict = {"headers": headers, "content": file_bytes}
    if basic_auth:
        kwargs["auth"] = basic_auth
    elif auth:
        kwargs["params"] = auth
    response = client.post(f"{base_url}/wp-json/wp/v2/media", **kwargs)
    return _woo_upload_media_response(response)


def _woo_save_local_upload(file_bytes: bytes, content_type: str, public_base: str) -> dict:
    ext = _WOO_IMAGE_EXTENSIONS.get(content_type, ".jpg")
    _WOO_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    path = _WOO_UPLOADS_DIR / name
    path.write_bytes(file_bytes)
    return {
        "id": None,
        "url": f"{public_base}/static/woo-uploads/{name}",
        "alt": "",
    }


def _woo_upload_media(
    client: httpx.Client,
    base_url: str,
    auth: dict,
    file_bytes: bytes,
    filename: str,
    content_type: str,
) -> dict:
    return _woo_upload_media_wp(client, base_url, file_bytes, filename, content_type, auth=auth)


def _woo_handle_response_error(response: httpx.Response, context: str) -> None:
    if response.status_code == 401:
        detail = "Credenciales WooCommerce inválidas. Revisá WOO_CONSUMER_KEY y WOO_CONSUMER_SECRET."
        try:
            body = response.json()
            if isinstance(body, dict) and body.get("message"):
                msg = str(body["message"])
                lower = msg.lower()
                if "permisos de escritura" in lower or "write permission" in lower:
                    detail = (
                        "La clave API de WooCommerce solo tiene permiso de lectura. "
                        "Creá una nueva en WooCommerce → Ajustes → Avanzado → REST API "
                        "con permisos Lectura/Escritura y actualizá WOO_CONSUMER_KEY y WOO_CONSUMER_SECRET en el .env."
                    )
                else:
                    detail = f"WooCommerce rechazó la autenticación: {msg}"
        except Exception:
            pass
        raise HTTPException(status_code=502, detail=detail)
    if response.status_code >= 400:
        detail = context
        try:
            body = response.json()
            if isinstance(body, dict) and body.get("message"):
                detail = f"{context}: {body['message']}"
        except Exception:
            pass
        raise HTTPException(
            status_code=502,
            detail=f"{detail} (HTTP {response.status_code}).",
        )


def _woo_producto_remoto_a_dict(item: dict) -> dict:
    images = item.get("images") or []
    imagen_url = None
    if images and isinstance(images[0], dict):
        imagen_url = images[0].get("src")

    status = str(item.get("status") or "draft")
    if status == "publish":
        estado_label = "publicado"
    elif status == "draft":
        estado_label = "borrador"
    else:
        estado_label = status

    raw_stock = item.get("stock_quantity")
    stock = None
    if raw_stock is not None and raw_stock != "":
        try:
            stock = int(raw_stock)
        except (TypeError, ValueError):
            stock = None

    raw_price = item.get("regular_price") or item.get("price") or "0"
    try:
        precio = float(raw_price)
    except (TypeError, ValueError):
        precio = 0.0

    return {
        "woo_id": _require_int(item.get("id"), "id de producto WooCommerce"),
        "nombre": str(item.get("name") or ""),
        "sku": str(item.get("sku") or ""),
        "precio": precio,
        "stock": stock,
        "stock_status": item.get("stock_status"),
        "estado": status,
        "estado_label": estado_label,
        "imagen_url": imagen_url,
    }


def _woo_estado_label(status: str) -> str:
    if status == "publish":
        return "publicado"
    if status == "draft":
        return "borrador"
    if status == "trash":
        return "papelera"
    return status


def _woo_sku_matches(item: dict, sku: str) -> bool:
    return str(item.get("sku") or "").strip() == str(sku or "").strip()


def _woo_find_product_by_sku(client: httpx.Client, base_url: str, auth: dict, sku: str) -> dict | None:
    sku = str(sku or "").strip()
    if not sku:
        return None

    def scan_batch(batch: list) -> dict | None:
        if not isinstance(batch, list):
            return None
        for item in batch:
            if isinstance(item, dict) and _woo_sku_matches(item, sku):
                return item
        return None

    # WooCommerce "any" no incluye productos en papelera (trash).
    for status in ("any", "trash", "draft", "private", "pending"):
        response = client.get(
            f"{base_url}/wp-json/wc/v3/products",
            params={**auth, "sku": sku, "per_page": 100, "status": status},
        )
        _woo_handle_response_error(response, "Error al buscar producto en WooCommerce")
        found = scan_batch(response.json())
        if found:
            return found

    for status in ("any", "trash"):
        page = 1
        while page <= 30:
            response = client.get(
                f"{base_url}/wp-json/wc/v3/products",
                params={**auth, "page": page, "per_page": 100, "status": status},
            )
            _woo_handle_response_error(response, "Error al buscar producto en WooCommerce")
            batch = response.json()
            if not isinstance(batch, list) or not batch:
                break
            for item in batch:
                if not isinstance(item, dict):
                    continue
                if _woo_sku_matches(item, sku):
                    return item
                if str(item.get("type") or "") == "variable":
                    parent_id = item.get("id")
                    if parent_id is None:
                        continue
                    var_response = client.get(
                        f"{base_url}/wp-json/wc/v3/products/{parent_id}/variations",
                        params={**auth, "per_page": 100, "status": "any"},
                    )
                    if var_response.status_code >= 400:
                        continue
                    var_batch = var_response.json()
                    if isinstance(var_batch, list):
                        for var in var_batch:
                            if isinstance(var, dict) and _woo_sku_matches(var, sku):
                                return var
            if len(batch) < 100:
                break
            page += 1

    return None


def _woo_categoria_a_dict(item: dict) -> dict:
    parent = item.get("parent")
    return {
        "id": _require_int(item.get("id"), "id de categoría WooCommerce"),
        "nombre": str(item.get("name") or ""),
        "slug": str(item.get("slug") or ""),
        "parent": int(parent) if parent not in (None, "") else 0,
    }


def _woo_fetch_all_categories(client: httpx.Client, base_url: str, auth: dict) -> list[dict]:
    categorias: list[dict] = []
    page = 1
    while page <= 30:
        response = client.get(
            f"{base_url}/wp-json/wc/v3/products/categories",
            params={**auth, "page": page, "per_page": 100, "orderby": "name", "order": "asc"},
        )
        _woo_handle_response_error(response, "Error al listar categorías de WooCommerce")
        batch = response.json()
        if not isinstance(batch, list) or not batch:
            break
        for item in batch:
            if isinstance(item, dict):
                categorias.append(_woo_categoria_a_dict(item))
        if len(batch) < 100:
            break
        page += 1
    return categorias


def _woo_is_duplicate_sku_error(response: httpx.Response) -> bool:
    if response.status_code != 400:
        return False
    try:
        body = response.json()
        if not isinstance(body, dict):
            return False
        msg = str(body.get("message") or body.get("code") or "").lower()
        return "lookup table" in msg or "already present" in msg or "product_sku" in msg
    except Exception:
        return False


def _woo_put_producto(client: httpx.Client, base_url: str, auth: dict, item: dict, payload: dict) -> httpx.Response:
    product_type = str(item.get("type") or "simple")
    product_id = item.get("id")
    parent_id = item.get("parent_id")
    if product_type == "variation" and parent_id:
        url = f"{base_url}/wp-json/wc/v3/products/{parent_id}/variations/{product_id}"
    else:
        url = f"{base_url}/wp-json/wc/v3/products/{product_id}"
    return client.put(url, params=auth, json=payload)


def _woo_upsert_producto_por_sku(
    client: httpx.Client, base_url: str, auth: dict, sku: str, payload: dict
) -> tuple[str, dict]:
    existing = _woo_find_product_by_sku(client, base_url, auth, sku)
    if existing:
        response = _woo_put_producto(client, base_url, auth, existing, payload)
        _woo_handle_response_error(response, "Error al sincronizar producto con WooCommerce")
        result = response.json()
        if not isinstance(result, dict):
            raise HTTPException(
                status_code=502,
                detail="Respuesta inesperada de WooCommerce al actualizar producto.",
            )
        was_trash = str(existing.get("status") or "") == "trash"
        action = "restored" if was_trash else "updated"
        return action, result

    response = client.post(
        f"{base_url}/wp-json/wc/v3/products",
        params=auth,
        json=payload,
    )
    if _woo_is_duplicate_sku_error(response):
        existing = _woo_find_product_by_sku(client, base_url, auth, sku)
        if existing:
            response = _woo_put_producto(client, base_url, auth, existing, payload)
            _woo_handle_response_error(response, "Error al sincronizar producto con WooCommerce")
            result = response.json()
            if not isinstance(result, dict):
                raise HTTPException(
                    status_code=502,
                    detail="Respuesta inesperada de WooCommerce al actualizar producto.",
                )
            was_trash = str(existing.get("status") or "") == "trash"
            action = "restored" if was_trash else "updated"
            return action, result

    _woo_handle_response_error(response, "Error al sincronizar producto con WooCommerce")
    result = response.json()
    if not isinstance(result, dict):
        raise HTTPException(
            status_code=502,
            detail="Respuesta inesperada de WooCommerce al sincronizar producto.",
        )
    return "created", result


def _woo_parse_atributos(item: dict) -> list[dict]:
    attrs = item.get("attributes") or []
    result: list[dict] = []
    for attr in attrs:
        if not isinstance(attr, dict):
            continue
        options = attr.get("options") or []
        result.append(
            {
                "id": int(attr.get("id") or 0),
                "nombre": str(attr.get("name") or ""),
                "opciones": [str(o) for o in options] if isinstance(options, list) else [],
                "visible": bool(attr.get("visible")),
                "variacion": bool(attr.get("variation")),
            }
        )
    return result


def _woo_variacion_a_dict(var: dict) -> dict:
    attrs = var.get("attributes") or []
    atributos: list[dict] = []
    for attr in attrs:
        if isinstance(attr, dict):
            atributos.append(
                {
                    "nombre": str(attr.get("name") or ""),
                    "opcion": str(attr.get("option") or ""),
                }
            )

    raw_stock = var.get("stock_quantity")
    stock = None
    if raw_stock is not None and raw_stock != "":
        try:
            stock = int(raw_stock)
        except (TypeError, ValueError):
            stock = None

    status = str(var.get("status") or "publish")
    regular = var.get("regular_price")
    sale = var.get("sale_price")

    return {
        "variacion_id": _require_int(var.get("id"), "id de variación WooCommerce"),
        "sku": str(var.get("sku") or ""),
        "precio_regular": str(regular) if regular not in (None, "") else "",
        "precio_oferta": str(sale) if sale not in (None, "") else "",
        "stock": stock,
        "stock_status": var.get("stock_status"),
        "estado": status,
        "estado_label": _woo_estado_label(status),
        "atributos": atributos,
    }


def _woo_fetch_variations(
    client: httpx.Client, base_url: str, auth: dict, product_id: int
) -> list[dict]:
    variations: list[dict] = []
    page = 1
    per_page = 100
    while True:
        response = client.get(
            f"{base_url}/wp-json/wc/v3/products/{product_id}/variations",
            params={**auth, "page": page, "per_page": per_page},
        )
        _woo_handle_response_error(response, "Error al obtener variaciones de WooCommerce")
        batch = response.json()
        if not isinstance(batch, list) or not batch:
            break
        for var in batch:
            if isinstance(var, dict):
                variations.append(_woo_variacion_a_dict(var))
        if len(batch) < per_page:
            break
        page += 1
    return variations


def _woo_variation_combo_key(attrs: list[dict]) -> tuple:
    pairs = []
    for a in attrs:
        nombre = str(a.get("nombre") or a.get("name") or "").strip().lower()
        opcion = str(a.get("opcion") or a.get("option") or "").strip().lower()
        if nombre and opcion:
            pairs.append((nombre, opcion))
    return tuple(sorted(pairs))


def _woo_generate_missing_variations(
    client: httpx.Client, base_url: str, auth: dict, product_id: int, item: dict
) -> None:
    if str(item.get("type") or "") != "variable":
        return

    var_attrs = [
        a for a in (item.get("attributes") or [])
        if isinstance(a, dict) and a.get("variation")
    ]
    if not var_attrs:
        return

    options_lists: list[list[tuple[str, int, str]]] = []
    for attr in var_attrs:
        name = str(attr.get("name") or "").strip()
        attr_id = int(attr.get("id") or 0)
        options = [str(o).strip() for o in (attr.get("options") or []) if str(o).strip()]
        if not name or not options:
            continue
        options_lists.append([(name, attr_id, opt) for opt in options])

    if not options_lists:
        return

    combinations = list(itertools.product(*options_lists))
    existing_raw = _woo_fetch_variations(client, base_url, auth, product_id)
    existing_keys = {_woo_variation_combo_key(v["atributos"]) for v in existing_raw}

    parent_sku = str(item.get("sku") or "").strip()
    parent_price = str(item.get("regular_price") or "").strip()

    for combo in combinations:
        attr_dicts = [{"nombre": name, "opcion": opt} for name, _, opt in combo]
        key = _woo_variation_combo_key(attr_dicts)
        if key in existing_keys:
            continue

        attr_payload = [
            {"id": attr_id, "name": name, "option": opt}
            for name, attr_id, opt in combo
        ]
        sku_suffix = "-".join(opt.replace(" ", "") for _, _, opt in combo)
        var_payload: dict = {
            "attributes": attr_payload,
            "regular_price": parent_price,
            "manage_stock": True,
            "stock_quantity": 0,
            "status": "publish",
        }
        if parent_sku:
            var_payload["sku"] = f"{parent_sku}-{sku_suffix}"

        response = client.post(
            f"{base_url}/wp-json/wc/v3/products/{product_id}/variations",
            params=auth,
            json=var_payload,
        )
        _woo_handle_response_error(response, "Error al crear variación en WooCommerce")


def _woo_update_variations(
    client: httpx.Client, base_url: str, auth: dict, product_id: int, variaciones: list[dict]
) -> None:
    for v in variaciones:
        vid = v.get("variacion_id")
        if not vid:
            continue
        payload: dict = {}
        if v.get("precio_regular") is not None:
            precio = str(v["precio_regular"]).strip()
            payload["regular_price"] = precio if precio else "0"
        if v.get("precio_oferta") is not None:
            oferta = str(v["precio_oferta"]).strip()
            payload["sale_price"] = oferta if oferta else ""
        if v.get("stock") is not None:
            stock_int = max(int(v["stock"]), 0)
            payload["manage_stock"] = True
            payload["stock_quantity"] = stock_int
            payload["stock_status"] = "instock" if stock_int > 0 else "outofstock"
        if not payload:
            continue
        response = client.put(
            f"{base_url}/wp-json/wc/v3/products/{product_id}/variations/{int(vid)}",
            params=auth,
            json=payload,
        )
        _woo_handle_response_error(response, "Error al actualizar variación en WooCommerce")


def _woo_producto_detalle_a_dict(item: dict, variaciones: list[dict] | None = None) -> dict:
    images = item.get("images") or []
    imagenes: list[dict] = []
    for img in images:
        if isinstance(img, dict) and img.get("src"):
            imagenes.append(
                {
                    "id": img.get("id"),
                    "url": str(img.get("src") or ""),
                    "alt": str(img.get("alt") or ""),
                }
            )

    categories = item.get("categories") or []
    categorias: list[dict] = []
    for cat in categories:
        if isinstance(cat, dict):
            categorias.append(
                {
                    "id": cat.get("id"),
                    "nombre": str(cat.get("name") or ""),
                    "slug": str(cat.get("slug") or ""),
                }
            )

    status = str(item.get("status") or "draft")
    raw_stock = item.get("stock_quantity")
    stock = None
    if raw_stock is not None and raw_stock != "":
        try:
            stock = int(raw_stock)
        except (TypeError, ValueError):
            stock = None

    regular = item.get("regular_price")
    sale = item.get("sale_price")
    tipo = str(item.get("type") or "simple")

    return {
        "woo_id": _require_int(item.get("id"), "id de producto WooCommerce"),
        "tipo": tipo,
        "tipo_label": "Variable" if tipo == "variable" else "Simple",
        "nombre": str(item.get("name") or ""),
        "descripcion": str(item.get("description") or ""),
        "descripcion_corta": str(item.get("short_description") or ""),
        "precio_regular": str(regular) if regular not in (None, "") else "",
        "precio_oferta": str(sale) if sale not in (None, "") else "",
        "stock": stock,
        "stock_status": item.get("stock_status"),
        "manage_stock": bool(item.get("manage_stock")),
        "imagenes": imagenes,
        "categorias": categorias,
        "atributos": _woo_parse_atributos(item),
        "variaciones": variaciones or [],
        "estado": status,
        "estado_label": _woo_estado_label(status),
        "sku": str(item.get("sku") or ""),
    }


def _woo_build_producto_detalle(
    client: httpx.Client, base_url: str, auth: dict, item: dict
) -> dict:
    tipo = str(item.get("type") or "simple")
    wid = _require_int(item.get("id"), "id de producto WooCommerce")
    variaciones: list[dict] = []
    if tipo == "variable":
        variaciones = _woo_fetch_variations(client, base_url, auth, wid)
    return _woo_producto_detalle_a_dict(item, variaciones)


def _woo_fetch_product_raw(client: httpx.Client, base_url: str, auth: dict, woo_id: int) -> dict:
    response = client.get(
        f"{base_url}/wp-json/wc/v3/products/{woo_id}",
        params=auth,
    )
    _woo_handle_response_error(response, "Error al obtener producto de WooCommerce")
    item = response.json()
    if not isinstance(item, dict):
        raise HTTPException(
            status_code=502,
            detail="Respuesta inesperada de WooCommerce al obtener producto.",
        )
    return item


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

    def list_woocommerce_productos(self) -> list[dict]:
        base_url, consumer_key, consumer_secret = _woo_rest_credentials()
        url = f"{base_url}/wp-json/wc/v3/products"
        productos: list[dict] = []
        seen_ids: set[int] = set()

        try:
            with httpx.Client(timeout=30.0) as client:
                for status in ("any", "trash"):
                    page = 1
                    while True:
                        response = client.get(
                            url,
                            params={
                                "page": page,
                                "per_page": 100,
                                "status": status,
                                "consumer_key": consumer_key,
                                "consumer_secret": consumer_secret,
                            },
                        )
                        if response.status_code == 401:
                            raise HTTPException(
                                status_code=502,
                                detail="Credenciales WooCommerce inválidas. Revisá WOO_CONSUMER_KEY y WOO_CONSUMER_SECRET.",
                            )
                        if response.status_code >= 400:
                            raise HTTPException(
                                status_code=502,
                                detail=f"Error al consultar WooCommerce (HTTP {response.status_code}).",
                            )
                        batch = response.json()
                        if not isinstance(batch, list):
                            raise HTTPException(
                                status_code=502,
                                detail="Respuesta inesperada de WooCommerce al listar productos.",
                            )
                        if not batch:
                            break
                        for item in batch:
                            if not isinstance(item, dict) or item.get("id") is None:
                                continue
                            wid = _require_int(item.get("id"), "id de producto WooCommerce")
                            if wid in seen_ids:
                                continue
                            seen_ids.add(wid)
                            productos.append(_woo_producto_remoto_a_dict(item))
                        if len(batch) < 100:
                            break
                        page += 1
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"No se pudo conectar con WooCommerce: {exc}",
            ) from exc

        return productos

    def _get_producto_sync_context(self, producto_id: int, require_publicado: bool) -> dict:
        pid = _require_int(producto_id, "producto_id")
        sid = _get_tienda_online_sucursal_id()
        stock_sid = _woo_stock_sucursal_id(sid)
        with db_session:
            tienda = models.Sucursal.get(id=sid)
            if not tienda:
                raise HTTPException(status_code=404, detail="Sucursal tienda online no encontrada")
            producto = models.Product.get(id=pid)
            if not producto:
                raise HTTPException(status_code=404, detail="Producto no encontrado")
            reg = models.TiendaOnlineProducto.get(sucursal_tienda=tienda, producto=producto)
            if require_publicado and (not reg or not reg.activo):
                raise HTTPException(
                    status_code=400,
                    detail="El producto no está publicado en la tienda online",
                )
            productos = self._product_service.get_all_products(
                sucursal_id=stock_sid,
                ocultar_costo=True,
            )
            p_dict = next((x for x in productos if x.get("id") == pid), None)
            if not p_dict:
                raise HTTPException(status_code=404, detail="Producto no encontrado en catálogo de stock")
            precio_payload = _precio_web_payload(p_dict, reg, tienda)
            return {
                "producto_id": pid,
                "codigo": str(p_dict.get("codigo") or ""),
                "nombre": str(p_dict.get("nombre") or ""),
                "talle": str(p_dict.get("talle") or ""),
                "stock": int(p_dict.get("stock") or 0),
                "precio": precio_payload["precio"],
            }

    def sync_producto_woocommerce(self, producto_id: int) -> dict:
        ctx = self._get_producto_sync_context(producto_id, require_publicado=True)
        sku = _build_producto_sku(ctx["codigo"], ctx["talle"])
        nombre = _build_producto_nombre_woo(ctx["nombre"], ctx["talle"])
        stock = ctx["stock"]
        payload = {
            "name": nombre,
            "sku": sku,
            "regular_price": f"{ctx['precio']:.2f}",
            "status": "publish",
            "manage_stock": True,
            "stock_quantity": max(stock, 0),
            "stock_status": "instock" if stock > 0 else "outofstock",
        }

        base_url, consumer_key, consumer_secret = _woo_rest_credentials()
        auth = _woo_auth_params(consumer_key, consumer_secret)

        try:
            with httpx.Client(timeout=30.0) as client:
                action, result = _woo_upsert_producto_por_sku(client, base_url, auth, sku, payload)
                woo_id = _require_int(result.get("id"), "id de producto WooCommerce")
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"No se pudo conectar con WooCommerce: {exc}",
            ) from exc

        message = {
            "updated": "Producto actualizado en WooCommerce",
            "created": "Producto creado en WooCommerce",
            "restored": "Producto restaurado desde la papelera y publicado en WooCommerce",
        }.get(action, "Producto sincronizado en WooCommerce")
        return {
            "producto_id": ctx["producto_id"],
            "woo_id": woo_id,
            "sku": sku,
            "action": action,
            "message": message,
        }

    def unsync_producto_woocommerce(self, producto_id: int) -> dict:
        ctx = self._get_producto_sync_context(producto_id, require_publicado=False)
        sku = _build_producto_sku(ctx["codigo"], ctx["talle"])
        base_url, consumer_key, consumer_secret = _woo_rest_credentials()
        auth = _woo_auth_params(consumer_key, consumer_secret)

        try:
            with httpx.Client(timeout=30.0) as client:
                existing = _woo_find_product_by_sku(client, base_url, auth, sku)
                if not existing:
                    return {
                        "producto_id": ctx["producto_id"],
                        "woo_id": None,
                        "sku": sku,
                        "message": "No se encontró el producto en WooCommerce",
                    }
                woo_id = _require_int(existing.get("id"), "id de producto WooCommerce")
                response = _woo_put_producto(
                    client, base_url, auth, existing, {"status": "draft"}
                )
                _woo_handle_response_error(response, "Error al despublicar producto en WooCommerce")
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"No se pudo conectar con WooCommerce: {exc}",
            ) from exc

        return {
            "producto_id": ctx["producto_id"],
            "woo_id": woo_id,
            "sku": sku,
            "message": "Producto movido a borrador en WooCommerce",
        }

    def get_woocommerce_producto(self, woo_id: int) -> dict:
        wid = _require_int(woo_id, "woo_id")
        base_url, consumer_key, consumer_secret = _woo_rest_credentials()
        auth = _woo_auth_params(consumer_key, consumer_secret)
        try:
            with httpx.Client(timeout=30.0) as client:
                item = _woo_fetch_product_raw(client, base_url, auth, wid)
                return _woo_build_producto_detalle(client, base_url, auth, item)
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"No se pudo conectar con WooCommerce: {exc}",
            ) from exc

    def update_woocommerce_producto(
        self,
        woo_id: int,
        nombre: str | None = None,
        descripcion: str | None = None,
        descripcion_corta: str | None = None,
        precio_regular: str | None = None,
        precio_oferta: str | None = None,
        stock: int | None = None,
        estado: str | None = None,
        atributos: list[dict] | None = None,
        categoria_id: int | None = _UNSET,
        tipo: str | None = None,
        variaciones: list[dict] | None = None,
        generar_variaciones: bool = False,
        imagenes: list[dict] | None = None,
    ) -> dict:
        wid = _require_int(woo_id, "woo_id")
        payload: dict = {}
        if nombre is not None:
            payload["name"] = str(nombre).strip()
        if descripcion is not None:
            payload["description"] = str(descripcion)
        if descripcion_corta is not None:
            payload["short_description"] = str(descripcion_corta)
        if precio_regular is not None:
            precio_str = str(precio_regular).strip()
            payload["regular_price"] = precio_str if precio_str else "0"
        if precio_oferta is not None:
            oferta_str = str(precio_oferta).strip()
            payload["sale_price"] = oferta_str if oferta_str else ""
        if stock is not None:
            stock_int = int(stock)
            payload["manage_stock"] = True
            payload["stock_quantity"] = max(stock_int, 0)
            payload["stock_status"] = "instock" if stock_int > 0 else "outofstock"
        if estado is not None:
            estado_norm = str(estado).strip().lower()
            if estado_norm not in ("publish", "draft", "trash"):
                raise HTTPException(
                    status_code=400,
                    detail="estado inválido. Valores permitidos: publish, draft, trash.",
                )
            payload["status"] = estado_norm
        if atributos is not None:
            payload["attributes"] = [
                {
                    "id": int(a.get("id") or 0),
                    "name": str(a.get("nombre") or ""),
                    "options": [str(o) for o in (a.get("opciones") or []) if str(o).strip()],
                    "visible": bool(a.get("visible")),
                    "variation": bool(a.get("variacion")),
                }
                for a in atributos
                if str(a.get("nombre") or "").strip()
            ]
        if categoria_id is not _UNSET:
            if categoria_id is None or int(categoria_id) <= 0:
                payload["categories"] = []
            else:
                payload["categories"] = [{"id": int(categoria_id)}]
        if tipo is not None:
            tipo_norm = str(tipo).strip().lower()
            if tipo_norm not in ("simple", "variable"):
                raise HTTPException(
                    status_code=400,
                    detail="tipo inválido. Valores permitidos: simple, variable.",
                )
            payload["type"] = tipo_norm
            if tipo_norm == "variable":
                payload["regular_price"] = ""
                payload["sale_price"] = ""
                payload["manage_stock"] = False
        if imagenes is not None:
            payload["images"] = _woo_build_images_payload(imagenes)

        if not payload:
            raise HTTPException(status_code=400, detail="No hay campos para actualizar.")

        base_url, consumer_key, consumer_secret = _woo_rest_credentials()
        auth = _woo_auth_params(consumer_key, consumer_secret)

        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.put(
                    f"{base_url}/wp-json/wc/v3/products/{wid}",
                    params=auth,
                    json=payload,
                )
                _woo_handle_response_error(response, "Error al actualizar producto en WooCommerce")
                item = response.json()
                if not isinstance(item, dict):
                    raise HTTPException(
                        status_code=502,
                        detail="Respuesta inesperada de WooCommerce al actualizar producto.",
                    )
                if generar_variaciones or str(item.get("type") or "") == "variable":
                    _woo_generate_missing_variations(client, base_url, auth, wid, item)
                if variaciones is not None:
                    _woo_update_variations(client, base_url, auth, wid, variaciones)
                result = _woo_build_producto_detalle(client, base_url, auth, item)
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"No se pudo conectar con WooCommerce: {exc}",
            ) from exc

        result["message"] = "Producto actualizado en WooCommerce"
        return result

    def delete_woocommerce_producto(self, woo_id: int, force: bool = True) -> dict:
        wid = _require_int(woo_id, "woo_id")
        base_url, consumer_key, consumer_secret = _woo_rest_credentials()
        auth = _woo_auth_params(consumer_key, consumer_secret)
        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.delete(
                    f"{base_url}/wp-json/wc/v3/products/{wid}",
                    params={**auth, "force": str(force).lower()},
                )
                _woo_handle_response_error(response, "Error al eliminar producto en WooCommerce")
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"No se pudo conectar con WooCommerce: {exc}",
            ) from exc
        return {
            "woo_id": wid,
            "message": "Producto eliminado definitivamente de WooCommerce",
        }

    def upload_woocommerce_imagen(
        self, file_bytes: bytes, filename: str, content_type: str
    ) -> dict:
        if not file_bytes:
            raise HTTPException(status_code=400, detail="El archivo de imagen está vacío.")
        if len(file_bytes) > _WOO_MAX_IMAGE_BYTES:
            raise HTTPException(status_code=400, detail="La imagen no puede superar 5 MB.")
        ctype = (content_type or "").split(";")[0].strip().lower()
        if ctype not in _WOO_IMAGE_CONTENT_TYPES:
            raise HTTPException(
                status_code=400,
                detail="Formato no permitido. Usá JPG, PNG, WEBP o GIF.",
            )

        base_url, consumer_key, consumer_secret = _woo_rest_credentials()
        auth = _woo_auth_params(consumer_key, consumer_secret)
        wp_auth = _woo_wp_app_password()
        public_base = _woo_public_api_url()
        upload_errors: list[str] = []

        try:
            with httpx.Client(timeout=60.0) as client:
                if wp_auth:
                    try:
                        return _woo_upload_media_wp(
                            client,
                            base_url,
                            file_bytes,
                            filename,
                            ctype,
                            basic_auth=wp_auth,
                        )
                    except HTTPException as exc:
                        upload_errors.append(str(exc.detail))

                try:
                    return _woo_upload_media(
                        client, base_url, auth, file_bytes, filename, ctype
                    )
                except HTTPException as exc:
                    upload_errors.append(str(exc.detail))

                if public_base:
                    return _woo_save_local_upload(file_bytes, ctype, public_base)
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"No se pudo conectar con WooCommerce: {exc}",
            ) from exc

        detail = _woo_upload_permission_help()
        if upload_errors:
            detail = f"{upload_errors[-1]}\n\n{detail}"
        raise HTTPException(status_code=502, detail=detail)

    def list_woocommerce_categorias(self) -> list[dict]:
        base_url, consumer_key, consumer_secret = _woo_rest_credentials()
        auth = _woo_auth_params(consumer_key, consumer_secret)
        try:
            with httpx.Client(timeout=30.0) as client:
                return _woo_fetch_all_categories(client, base_url, auth)
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"No se pudo conectar con WooCommerce: {exc}",
            ) from exc
