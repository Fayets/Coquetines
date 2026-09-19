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
        "descripcion_web": producto.descripcion_web or "",
        "tabla_talles_url": producto.tabla_talles_url or "",
        "fotos": len(producto.imagenes_web),
    }


def _clave_modelo(producto) -> tuple:
    """Qué filas del inventario son "el mismo modelo".

    El inventario guarda una fila por talle (286 de 316 modelos tienen varios),
    así que la clienta tiene que ver un solo producto con selector de talle.
    El color entra en la clave porque el mismo modelo en dos colores son dos
    productos distintos para quien compra.
    """
    return (
        (producto.nombre or "").strip().lower(),
        (producto.marca or "").strip().lower(),
        (producto.color.name if producto.color else "").strip().lower(),
    )


def _orden_talle(talle: str):
    limpio = (talle or "").strip()
    if limpio.isdigit():
        return (0, int(limpio), "")
    return (1, 0, limpio.upper())


class CatalogoServices:
    @staticmethod
    def _procesar(datos: bytes, mime: str) -> bytes:
        """Valida y normaliza una foto: rota según EXIF, achica y recomprime."""
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
            return salida.getvalue()
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=400, detail="No pudimos procesar la imagen.")

    # ---------------------------------------------------------------- público

    def _modelos_publicados(self, productos) -> dict:
        """Agrupa filas publicadas con stock en modelos, en orden estable."""
        modelos: dict = {}
        for p in productos:
            if not p.publicado_web or int(p.stock or 0) <= 0:
                continue
            clave = _clave_modelo(p)
            modelos.setdefault(clave, []).append(p)
        return modelos

    @staticmethod
    def _variantes_por_talle(filas) -> list[dict]:
        """Un talle = una opción para la clienta.

        El mismo talle puede existir en dos sucursales (son dos filas). Se
        suman los stocks y el pedido apunta a la fila con más unidades, que es
        la que más probablemente lo pueda cumplir.
        """
        por_talle: dict = {}
        for p in filas:
            por_talle.setdefault((p.talle or "").strip(), []).append(p)

        variantes = []
        for talle, grupo in por_talle.items():
            mejor = max(grupo, key=lambda p: int(p.stock or 0))
            variantes.append(
                {
                    "id": mejor.id,
                    "codigo": mejor.codigo,
                    "talle": talle,
                    "stock": sum(int(p.stock or 0) for p in grupo),
                    "precio": min(_precio_publico(p) for p in grupo),
                    "disponible": sum(int(p.stock or 0) for p in grupo) > 0,
                }
            )
        variantes.sort(key=lambda v: _orden_talle(v["talle"]))
        return variantes

    @staticmethod
    def _representante(filas):
        """Fila que le da identidad al modelo: la de menor id, para que la URL
        no cambie si se agrega o se agota un talle."""
        return min(filas, key=lambda p: p.id)

    def _modelo_a_dict(self, filas) -> dict:
        principal = self._representante(filas)
        variantes = self._variantes_por_talle(filas)
        precios = [v["precio"] for v in variantes] or [0]
        imagen = next((p.imagen_url for p in filas if p.imagen_url), None)
        return {
            "id": principal.id,
            "codigo": principal.codigo,
            "nombre": principal.nombre,
            "marca": principal.marca or None,
            "color": principal.color.name if principal.color else None,
            "categoria": principal.categoria.name if principal.categoria else None,
            "imagen": imagen,
            "precio": min(precios),
            "precio_hasta": max(precios),
            "stock": sum(v["stock"] for v in variantes),
            "talles": [v["talle"] for v in variantes if v["talle"]],
            # La tarjeta muestra el talle solo cuando el modelo tiene uno.
            "talle": variantes[0]["talle"] if len(variantes) == 1 else "",
        }

    def catalogo_publico(self) -> dict:
        """Lo que ve la clienta: modelos publicados y con stock, de cualquier sucursal."""
        with db_session:
            modelos = self._modelos_publicados(list(models.Product.select()))
            items = [self._modelo_a_dict(f) for f in modelos.values()]
            items.sort(key=lambda i: (i["nombre"] or "").lower())

            categorias = sorted({i["categoria"] for i in items if i["categoria"]})
            talles = sorted(
                {t for i in items for t in i["talles"] if t}, key=_orden_talle
            )
            return {
                "tienda": "Coquetines",
                "disponible": True,
                "productos": items,
                "categorias": categorias,
                "talles": talles,
            }

    def ficha_publica(self, producto_id: int) -> dict:
        """Ficha del modelo al que pertenece ese producto."""
        with db_session:
            ancla = models.Product.get(id=producto_id)
            if ancla is None or not ancla.publicado_web:
                raise HTTPException(status_code=404, detail="Producto no encontrado")

            todos = list(models.Product.select())
            clave = _clave_modelo(ancla)
            filas = [
                p for p in todos
                if p.publicado_web and _clave_modelo(p) == clave
            ]
            if not filas:
                raise HTTPException(status_code=404, detail="Producto no encontrado")

            principal = self._representante(filas)
            variantes = self._variantes_por_talle(filas)

            # Galería: la unión de las fotos del modelo, sin repetir. Así alcanza
            # con cargarlas en una fila para que las vea todo el modelo.
            galeria = []
            vistas = set()
            for p in sorted(filas, key=lambda x: x.id):
                for img in sorted(p.imagenes_web, key=lambda i: (i.orden or 0, i.id)):
                    if img.id in vistas:
                        continue
                    vistas.add(img.id)
                    galeria.append(f"/catalogo/imagen/{img.id}")
            if not galeria:
                suelta = next((p.imagen_url for p in filas if p.imagen_url), None)
                if suelta:
                    galeria.append(suelta)

            descripcion = next((p.descripcion_web for p in filas if p.descripcion_web), "")
            tabla = next((p.tabla_talles_url for p in filas if p.tabla_talles_url), "")

            # Relacionados: mismo rubro, distinto modelo.
            relacionados = []
            if principal.categoria:
                otros = self._modelos_publicados(todos)
                for c, f in otros.items():
                    if c == clave:
                        continue
                    rep = self._representante(f)
                    if rep.categoria and rep.categoria.id == principal.categoria.id:
                        relacionados.append(self._modelo_a_dict(f))
            relacionados.sort(key=lambda i: (i["nombre"] or "").lower())

            return {
                "id": principal.id,
                "nombre": principal.nombre,
                "marca": principal.marca or None,
                "color": principal.color.name if principal.color else None,
                "categoria": principal.categoria.name if principal.categoria else None,
                "descripcion": descripcion or "",
                "tabla_talles": tabla or None,
                "galeria": galeria,
                "variantes": variantes,
                "relacionados": relacionados[:8],
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

            # Descripción y tabla de talles describen el modelo, no un talle
            # suelto: se copian a todas las filas hermanas para que la dueña
            # no tenga que escribir lo mismo seis veces.
            de_modelo = {
                k: v for k, v in cambios.items()
                if k in ("descripcion_web", "tabla_talles_url") and v is not None
            }
            if de_modelo:
                clave = _clave_modelo(producto)
                for hermano in list(models.Product.select()):
                    if _clave_modelo(hermano) != clave:
                        continue
                    if "descripcion_web" in de_modelo:
                        hermano.descripcion_web = str(de_modelo["descripcion_web"]).strip()[:1200]
                    if "tabla_talles_url" in de_modelo:
                        hermano.tabla_talles_url = str(de_modelo["tabla_talles_url"]).strip()[:500]

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

    def guardar_imagen(
        self, producto_id: int, datos: bytes, mime: str, reemplazar: bool = True
    ) -> dict:
        """Redimensiona y guarda la foto; deja el producto apuntando a ella."""
        contenido = self._procesar(datos, mime)

        with db_session:
            producto = models.Product.get(id=producto_id)
            if producto is None:
                raise HTTPException(status_code=404, detail="Producto no encontrado")

            previas = list(producto.imagenes_web)
            if reemplazar:
                for vieja in previas:
                    vieja.delete()
                previas = []

            img = models.ImagenProducto(
                producto=producto,
                contenido=contenido,
                mime="image/jpeg",
                orden=len(previas),
                creada=datetime.now(),
            )
            img.flush()
            # La primera foto es la que sale en la tarjeta del catálogo.
            if reemplazar or not producto.imagen_url:
                producto.imagen_url = f"/catalogo/imagen/{img.id}"
            return {
                "imagen_url": producto.imagen_url,
                "peso_kb": round(len(contenido) / 1024, 1),
                "fotos": len(previas) + 1,
            }

    def guardar_tabla_talles(self, producto_id: int, datos: bytes, mime: str) -> dict:
        """Foto de la tabla de talles. Se aplica a todo el modelo."""
        guardada = self.guardar_imagen_suelta(datos, mime)
        return self.actualizar(producto_id, {"tabla_talles_url": guardada})

    def guardar_imagen_suelta(self, datos: bytes, mime: str) -> str:
        """Guarda una imagen sin colgarla de un producto (ej. tabla de talles)."""
        contenido = self._procesar(datos, mime)
        with db_session:
            img = models.ImagenProducto(
                producto=None,
                contenido=contenido,
                mime="image/jpeg",
                creada=datetime.now(),
            )
            img.flush()
            return f"/catalogo/imagen/{img.id}"

    def galeria(self, producto_id: int) -> list[dict]:
        with db_session:
            producto = models.Product.get(id=producto_id)
            if producto is None:
                raise HTTPException(status_code=404, detail="Producto no encontrado")
            return [
                {"id": i.id, "url": f"/catalogo/imagen/{i.id}", "orden": int(i.orden or 0)}
                for i in sorted(producto.imagenes_web, key=lambda x: (x.orden or 0, x.id))
            ]

    def borrar_foto(self, producto_id: int, imagen_id: int) -> dict:
        with db_session:
            producto = models.Product.get(id=producto_id)
            img = models.ImagenProducto.get(id=imagen_id)
            if producto is None or img is None:
                raise HTTPException(status_code=404, detail="No encontrado")
            era_portada = producto.imagen_url == f"/catalogo/imagen/{img.id}"
            img.delete()
            producto.imagenes_web.load()
            quedan = sorted(producto.imagenes_web, key=lambda x: (x.orden or 0, x.id))
            if era_portada:
                producto.imagen_url = f"/catalogo/imagen/{quedan[0].id}" if quedan else ""
            return {"imagen_url": producto.imagen_url or "", "fotos": len(quedan)}

    def borrar_imagen(self, producto_id: int) -> dict:
        with db_session:
            producto = models.Product.get(id=producto_id)
            if producto is None:
                raise HTTPException(status_code=404, detail="Producto no encontrado")
            for vieja in list(producto.imagenes_web):
                vieja.delete()
            producto.imagen_url = ""
            return {"imagen_url": ""}
