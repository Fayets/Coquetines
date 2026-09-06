"""Pedidos generados desde el catálogo público.

Un pedido web es una intención de compra, no una venta: no mueve stock ni
caja. Queda en el dashboard para que Coquetines contacte a la clienta y, si se
confirma, cargue la venta por el circuito normal.
"""

import uuid
from datetime import datetime

from fastapi import HTTPException
from pony.orm import db_session, desc

from src import models
from src.services.catalogo_services import CatalogoServices
from src.services.ventas_services import VentasServices

MAX_ITEMS = 40
MAX_CANTIDAD_POR_ITEM = 20

ESTADOS = {e.value for e in models.EstadoPedidoWeb}


def _numero_de_pedido(pedido_id: int) -> str:
    return f"W-{pedido_id:04d}"


def _limpiar(texto, maximo: int) -> str:
    return (texto or "").strip()[:maximo]


class PedidosWebServices:
    def __init__(self):
        self._catalogo = CatalogoServices()
        self._ventas = VentasServices()

    # ------------------------------------------------------------------ público

    def crear(self, datos) -> dict:
        """Crea un pedido desde la landing.

        Los precios NUNCA se toman del navegador: se recalculan contra el
        catálogo publicado. Si el visitante manipula el JS, el pedido que llega
        al dashboard sigue teniendo los precios reales.
        """
        items_pedidos = datos.items
        if not items_pedidos:
            raise HTTPException(status_code=400, detail="El pedido no tiene productos.")
        if len(items_pedidos) > MAX_ITEMS:
            raise HTTPException(
                status_code=400,
                detail=f"El pedido no puede tener más de {MAX_ITEMS} productos distintos.",
            )

        catalogo = {p["id"]: p for p in self._catalogo.catalogo_publico()["productos"]}

        lineas = []
        for item in items_pedidos:
            producto = catalogo.get(item.producto_id)
            if producto is None:
                raise HTTPException(
                    status_code=409,
                    detail="Uno de los productos ya no está disponible. Actualizá el catálogo y probá de nuevo.",
                )
            cantidad = int(item.cantidad)
            if cantidad < 1 or cantidad > MAX_CANTIDAD_POR_ITEM:
                raise HTTPException(status_code=400, detail="Cantidad inválida en el pedido.")
            if cantidad > int(producto["stock"]):
                raise HTTPException(
                    status_code=409,
                    detail=f"Nos queda menos stock de «{producto['nombre']}» del que pediste.",
                )
            lineas.append((producto, cantidad))

        total = sum(float(p["precio"]) * c for p, c in lineas)

        with db_session:
            pedido = models.PedidoWeb(
                # Provisorio y único: Pony rechaza el string vacío en un
                # Required, y el número final necesita el id que asigna al
                # hacer flush unas líneas más abajo.
                numero=f"tmp-{uuid.uuid4().hex}",
                cliente_nombre=_limpiar(datos.nombre, 120),
                cliente_telefono=_limpiar(datos.telefono, 40),
                cliente_localidad=_limpiar(datos.localidad, 120),
                nota=_limpiar(datos.nota, 500),
                total=total,
                estado=models.EstadoPedidoWeb.NUEVO.value,
                fecha_hora=datetime.now(),
            )
            pedido.flush()  # necesitamos el id para armar el número visible
            pedido.numero = _numero_de_pedido(pedido.id)

            for producto, cantidad in lineas:
                models.PedidoWebItem(
                    pedido=pedido,
                    producto=models.Product.get(id=producto["id"]),
                    codigo=str(producto["codigo"]),
                    nombre=str(producto["nombre"]),
                    talle=str(producto.get("talle") or ""),
                    color=str(producto.get("color") or ""),
                    cantidad=cantidad,
                    precio_unitario=float(producto["precio"]),
                )

            return {
                "numero": pedido.numero,
                "total": total,
                "items": [
                    {
                        "codigo": p["codigo"],
                        "nombre": p["nombre"],
                        "talle": p.get("talle") or "",
                        "color": p.get("color") or "",
                        "cantidad": c,
                        "precio_unitario": float(p["precio"]),
                    }
                    for p, c in lineas
                ],
            }

    # ------------------------------------------------------------------- panel

    @staticmethod
    def _a_dict(pedido, con_items: bool = True) -> dict:
        base = {
            "id": pedido.id,
            "numero": pedido.numero,
            "cliente_nombre": pedido.cliente_nombre,
            "cliente_telefono": pedido.cliente_telefono,
            "cliente_localidad": pedido.cliente_localidad or "",
            "nota": pedido.nota or "",
            "total": float(pedido.total or 0),
            "estado": pedido.estado,
            "fecha_hora": pedido.fecha_hora.isoformat() if pedido.fecha_hora else None,
            "contactado_en": pedido.contactado_en.isoformat() if pedido.contactado_en else None,
            "venta_id": pedido.venta_id,
            "cantidad_items": sum(i.cantidad for i in pedido.items),
        }
        if con_items:
            base["items"] = [
                {
                    "codigo": i.codigo,
                    "nombre": i.nombre,
                    "talle": i.talle or "",
                    "color": i.color or "",
                    "cantidad": i.cantidad,
                    "precio_unitario": float(i.precio_unitario or 0),
                    "subtotal": float(i.precio_unitario or 0) * i.cantidad,
                }
                for i in sorted(pedido.items, key=lambda x: x.id)
            ]
        return base

    def _todos(self) -> list:
        """Todos los pedidos, del más nuevo al más viejo.

        Se trae la tabla entera y se filtra en Python a propósito: son pedidos
        web de un local (decenas, no millones) y los `lambda` de Pony traducen
        mal cuando la variable externa se llama igual que el atributo
        (`p.estado == estado` devolvía resultados vacíos). Si algún día esto
        crece a miles, conviene volver a filtrar en la base.
        """
        pedidos = list(models.PedidoWeb.select())
        pedidos.sort(key=lambda p: p.id, reverse=True)
        return pedidos

    def listar(self, estado: str | None = None, limite: int = 100) -> dict:
        with db_session:
            pedidos = self._todos()

            conteos = {e: 0 for e in sorted(ESTADOS)}
            for pedido in pedidos:
                if pedido.estado in conteos:
                    conteos[pedido.estado] += 1

            if estado and estado != "TODOS":
                if estado not in ESTADOS:
                    raise HTTPException(status_code=400, detail="Estado inválido.")
                pedidos = [p for p in pedidos if p.estado == estado]

            resultado = []
            for pedido in pedidos[:limite]:
                resultado.append(self._a_dict(pedido))

            return {"pedidos": resultado, "conteos": conteos}

    def contar_nuevos(self) -> int:
        nuevo = models.EstadoPedidoWeb.NUEVO.value
        with db_session:
            return sum(1 for p in self._todos() if p.estado == nuevo)

    def cambiar_estado(self, pedido_id: int, estado: str, venta_id: int | None = None) -> dict:
        if estado not in ESTADOS:
            raise HTTPException(status_code=400, detail="Estado inválido.")
        with db_session:
            pedido = models.PedidoWeb.get(id=pedido_id)
            if pedido is None:
                raise HTTPException(status_code=404, detail="Pedido no encontrado.")
            pedido.estado = estado
            if estado == models.EstadoPedidoWeb.CONTACTADO.value and not pedido.contactado_en:
                pedido.contactado_en = datetime.now()
            if venta_id is not None:
                pedido.venta_id = int(venta_id)
            return self._a_dict(pedido)

    def items_para_venta(self, pedido_id: int) -> dict:
        """Datos del pedido listos para precargar la pantalla de venta.

        Se resuelve contra el stock actual: entre que la clienta pidió y que se
        cierra la venta puede haberse vendido la última unidad en el local.
        """
        with db_session:
            pedido = models.PedidoWeb.get(id=pedido_id)
            if pedido is None:
                raise HTTPException(status_code=404, detail="Pedido no encontrado.")

            items = []
            for i in sorted(pedido.items, key=lambda x: x.id):
                producto = i.producto
                items.append(
                    {
                        "producto_id": producto.id if producto else None,
                        "codigo": i.codigo,
                        "nombre": i.nombre,
                        "talle": i.talle or "",
                        "color": i.color or "",
                        "cantidad": i.cantidad,
                        "precio_pedido": float(i.precio_unitario or 0),
                        "stock_actual": int(producto.stock or 0) if producto else 0,
                        "sucursal_id": producto.sucursal.id if producto and producto.sucursal else None,
                        "sucursal": producto.sucursal.nombre if producto and producto.sucursal else "",
                        "disponible": bool(producto) and int(producto.stock or 0) >= i.cantidad,
                    }
                )

            sucursales = sorted({i["sucursal_id"] for i in items if i["sucursal_id"]})
            return {
                "pedido": self._a_dict(pedido),
                "items": items,
                "sucursales_involucradas": sucursales,
                "todo_disponible": all(i["disponible"] for i in items),
            }

    def eliminar(self, pedido_id: int, eliminar_venta: bool = False) -> dict:
        """Borra un pedido web.

        Un pedido por sí solo no mueve nada: borrarlo no tiene efecto sobre el
        stock. Lo que sí lo movió, si se llegó a cerrar, es la venta. Por eso,
        si el pedido tiene una venta enganchada hay que decir explícitamente
        que también se borre: ahí sí vuelve el stock y se revierte la caja.
        """
        with db_session:
            pedido = models.PedidoWeb.get(id=pedido_id)
            if pedido is None:
                raise HTTPException(status_code=404, detail="Pedido no encontrado.")
            numero = pedido.numero
            venta_id = pedido.venta_id

        if venta_id and not eliminar_venta:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"El pedido {numero} ya se cerró con la venta #{venta_id}. "
                    "Confirmá si también querés borrar esa venta y devolver el stock."
                ),
            )

        mensaje_venta = ""
        if venta_id and eliminar_venta:
            # delete_venta devuelve el stock y revierte el ingreso de caja.
            resultado = self._ventas.delete_venta(venta_id)
            mensaje_venta = " " + str(resultado.get("message") or "")

        with db_session:
            pedido = models.PedidoWeb.get(id=pedido_id)
            if pedido is None:
                raise HTTPException(status_code=404, detail="Pedido no encontrado.")
            for item in list(pedido.items):
                item.delete()
            pedido.delete()

        return {
            "message": f"Pedido {numero} eliminado.{mensaje_venta}",
            "venta_eliminada": bool(venta_id and eliminar_venta),
        }
