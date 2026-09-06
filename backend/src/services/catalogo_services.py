"""Catálogo web propio.

Publicar un producto es una propiedad del producto, no de una sucursal: acá no
existe la "sucursal tienda online". Cualquier producto de cualquier sucursal
puede salir al catálogo, y lo administra la dueña desde el panel.

Las fotos se guardan en la base (ver ImagenProducto) porque en Render el disco
es efímero y cada deploy las borraría.
"""

import io
from datetime import datetime

from fastapi import HTTPException
from pony.orm import db_session, desc

from src import models

ANCHO_MAXIMO = 900
CALIDAD_JPEG = 82
PESO_MAXIMO_SUBIDA = 12 * 1024 * 1024  # 12 MB: una foto de celular entra cómoda
MIMES_ACEPTADOS = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


def _precio_publico(producto) -> float:
    """Precio que ve la clienta: el web si se cargó, si no el de lista."""
    web = float(producto.precio_web or 0)
    return web if web > 0 else float(producto.precio_venta or 0)


def _a_dict_publico(producto) -> dict:
    return {
        "id": producto.id,
        "codigo": producto.codigo,
        "nombre": producto.nombre,
        "marca": producto.marca or None,
        "talle": producto.talle or "",
        "color": producto.color.name if producto.color else None,
        "categoria": producto.categoria.name if producto.categoria else None,
        "stock": int(producto.stock or 0),
        "precio": _precio_publico(producto),
        "imagen": producto.imagen_url or None,
    }


def _a_dict_admin(producto) -> dict:
    return {
        "id": producto.id,
        "codigo": producto.codigo,
        "nombre": producto.nombre,
        "marca": producto.marca or "",
        "talle": producto.talle or "",
        "color": producto.color.name if producto.color else "",
        "categoria": producto.categoria.name if producto.categoria else "",
        "sucursal": producto.sucursal.nombre if producto.sucursal else "",
        "sucursal_id": producto.sucursal.id if producto.sucursal else None,
        "stock": int(producto.stock or 0),
        "precio_venta": float(producto.precio_venta or 0),
        "precio_web": float(producto.precio_web or 0),
        "precio_publico": _precio_publico(producto),
        "publicado_web": bool(producto.publicado_web),
        "imagen_url": producto.imagen_url or "",
        "orden_web": int(producto.orden_web or 0),
    }


def _orden_talle(talle: str):
    limpio = (talle or "").strip()
    if limpio.isdigit():
        return (0, int(limpio), "")
    return (1, 0, limpio.upper())


class CatalogoServices:
    # ---------------------------------------------------------------- público

    def catalogo_publico(self) -> dict:
        """Lo que ve la clienta: publicado y con stock, de cualquier sucursal."""
        with db_session:
            productos = [
                p
                for p in list(models.Product.select())
                if p.publicado_web and int(p.stock or 0) > 0
            ]
            productos.sort(key=lambda p: (-(p.orden_web or 0), p.nombre or ""))

            items = [_a_dict_publico(p) for p in productos]
            categorias = sorted({i["categoria"] for i in items if i["categoria"]})
            talles = sorted({i["talle"] for i in items if i["talle"]}, key=_orden_talle)
            return {
                "tienda": "Coquetines",
                "disponible": True,
                "productos": items,
                "categorias": categorias,
                "talles": talles,
            }

    def imagen(self, imagen_id: int):
        with db_session:
            img = models.ImagenProducto.get(id=imagen_id)
            if img is None:
                raise HTTPException(status_code=404, detail="Imagen no encontrada")
            return bytes(img.contenido), img.mime

    # ------------------------------------------------------------------ panel

    def listar_admin(
        self,
        busqueda: str | None = None,
        solo_publicados: bool = False,
        sucursal_id: int | None = None,
        limite: int = 60,
        pagina: int = 1,
    ) -> dict:
        with db_session:
            productos = list(models.Product.select())

            if sucursal_id is not None:
                productos = [
                    p for p in productos
                    if p.sucursal and p.sucursal.id == int(sucursal_id)
                ]
            if solo_publicados:
                productos = [p for p in productos if p.publicado_web]
            if busqueda:
                q = busqueda.strip().lower()
                productos = [
                    p for p in productos
                    if q in (p.nombre or "").lower()
                    or q in (p.codigo or "").lower()
                    or q in (p.marca or "").lower()
                ]

            # Orden estable por nombre. Antes iban los publicados primero, pero
            # entonces cada vez que se publicaba algo la fila saltaba al tope en
            # la siguiente carga y se perdía de vista. Para ver solo lo
            # publicado está el filtro.
            productos.sort(key=lambda p: ((p.nombre or "").lower(), p.talle or ""))

            total = len(productos)
            publicados = sum(1 for p in list(models.Product.select()) if p.publicado_web)
            inicio = max(0, (int(pagina) - 1) * int(limite))
            pagina_actual = productos[inicio : inicio + int(limite)]

            return {
                "productos": [_a_dict_admin(p) for p in pagina_actual],
                "total": total,
                "publicados": publicados,
                "pagina": int(pagina),
                "paginas": max(1, -(-total // int(limite))),
            }

    def actualizar(self, producto_id: int, cambios: dict) -> dict:
        with db_session:
            producto = models.Product.get(id=producto_id)
            if producto is None:
                raise HTTPException(status_code=404, detail="Producto no encontrado")

            if "publicado_web" in cambios and cambios["publicado_web"] is not None:
                producto.publicado_web = bool(cambios["publicado_web"])
            if "precio_web" in cambios and cambios["precio_web"] is not None:
                precio = float(cambios["precio_web"])
                if precio < 0:
                    raise HTTPException(status_code=400, detail="El precio web no puede ser negativo.")
                producto.precio_web = precio
            if "imagen_url" in cambios and cambios["imagen_url"] is not None:
                producto.imagen_url = str(cambios["imagen_url"]).strip()[:500]
            if "orden_web" in cambios and cambios["orden_web"] is not None:
                producto.orden_web = int(cambios["orden_web"])

            # El total va en la respuesta para que el panel no tenga que llevar
            # la cuenta a mano: sumándola en el cliente se desfasaba.
            resultado = _a_dict_admin(producto)
            resultado["publicados"] = sum(
                1 for p in list(models.Product.select()) if p.publicado_web
            )
            return resultado

    def publicar_varios(self, ids: list[int], publicado: bool) -> dict:
        with db_session:
            tocados = 0
            for pid in ids:
                producto = models.Product.get(id=int(pid))
                if producto is None:
                    continue
                producto.publicado_web = bool(publicado)
                tocados += 1
            return {"actualizados": tocados, "publicado": bool(publicado)}

    # ------------------------------------------------------------------ fotos

    def guardar_imagen(self, producto_id: int, datos: bytes, mime: str) -> dict:
        """Redimensiona y guarda la foto; deja el producto apuntando a ella."""
        if len(datos) > PESO_MAXIMO_SUBIDA:
            raise HTTPException(status_code=413, detail="La foto pesa más de 12 MB.")
        if mime not in MIMES_ACEPTADOS:
            raise HTTPException(
                status_code=415,
                detail="Formato no soportado. Usá JPG, PNG o WEBP.",
            )

        try:
            from PIL import Image, ImageOps

            imagen = Image.open(io.BytesIO(datos))
            imagen = ImageOps.exif_transpose(imagen)  # respeta la rotación del celular
            imagen = imagen.convert("RGB")
            if imagen.width > ANCHO_MAXIMO:
                alto = round(imagen.height * ANCHO_MAXIMO / imagen.width)
                imagen = imagen.resize((ANCHO_MAXIMO, alto), Image.LANCZOS)
            salida = io.BytesIO()
            imagen.save(salida, format="JPEG", quality=CALIDAD_JPEG, optimize=True)
            contenido = salida.getvalue()
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=400, detail="No pudimos procesar la imagen.")

        with db_session:
            producto = models.Product.get(id=producto_id)
            if producto is None:
                raise HTTPException(status_code=404, detail="Producto no encontrado")

            # Una foto por producto: la anterior se reemplaza para no acumular.
            for vieja in list(producto.imagenes_web):
                vieja.delete()

            img = models.ImagenProducto(
                producto=producto,
                contenido=contenido,
                mime="image/jpeg",
                creada=datetime.now(),
            )
            img.flush()
            producto.imagen_url = f"/catalogo/imagen/{img.id}"
            return {
                "imagen_url": producto.imagen_url,
                "peso_kb": round(len(contenido) / 1024, 1),
            }

    def borrar_imagen(self, producto_id: int) -> dict:
        with db_session:
            producto = models.Product.get(id=producto_id)
            if producto is None:
                raise HTTPException(status_code=404, detail="Producto no encontrado")
            for vieja in list(producto.imagenes_web):
                vieja.delete()
            producto.imagen_url = ""
            return {"imagen_url": ""}
