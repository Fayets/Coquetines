import random
import string
from pony.orm import db_session
from fastapi import HTTPException
from src import models, schemas
from src.db import db
from src.services.precio_producto import precio_transferencia_desde_et_o_explicito


def _generar_codigo_unico():
    """Genera un código que no exista en Products (evita duplicados cuando codigo es unique en DB)."""
    for _ in range(50):
        codigo = "T-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
        if not models.Product.get(codigo=codigo):
            return codigo
    for _ in range(20):
        codigo = "T-" + "".join(random.choices(string.digits, k=8))
        if not models.Product.get(codigo=codigo):
            return codigo
    raise HTTPException(
        status_code=500,
        detail="No se pudo generar un código único para el producto en destino. Reintentá.",
    )


class SucursalServices:
    def __init__(self):
        pass

    def get_or_create_default_sucursal(self):
        """Crea la sucursal por defecto si no existe (migración de sistema single-sucursal)."""
        with db_session:
            sucursal = models.Sucursal.get(nombre="Sucursal Principal")
            if not sucursal:
                sucursal = models.Sucursal(
                    nombre="Sucursal Principal",
                    direccion="",
                    activo=True,
                )
            return sucursal

    def get_or_create_default_sucursal_id(self) -> int:
        """Devuelve el id de la sucursal por defecto (para usar fuera de db_session)."""
        with db_session:
            sucursal = models.Sucursal.get(nombre="Sucursal Principal")
            if not sucursal:
                sucursal = models.Sucursal(
                    nombre="Sucursal Principal",
                    direccion="",
                    activo=True,
                )
                db.flush()
            if sucursal.id is None:
                db.flush()
            if sucursal.id is None:
                raise HTTPException(status_code=500, detail="Error al obtener id de sucursal por defecto")
            return int(sucursal.id)

    def list_all(self, solo_activas: bool = True):
        with db_session:
            try:
                q = models.Sucursal.select()
                if solo_activas:
                    q = q.filter(lambda s: s.activo)
                sucursales = list(q)
                return [
                    {
                        "id": s.id,
                        "nombre": s.nombre,
                        "direccion": s.direccion or "",
                        "activo": s.activo,
                    }
                    for s in sucursales
                ]
            except Exception as e:
                print(f"Error al listar sucursales: {e}")
                # Fallback: si falla el filtro por `activo` (por diferencias de esquema en BD),
                # igual intentamos listar sucursales sin filtrar y marcándolas como activas.
                try:
                    sucursales = list(models.Sucursal.select())
                    return [
                        {
                            "id": s.id,
                            "nombre": s.nombre,
                            "direccion": s.direccion or "",
                            "activo": True,
                        }
                        for s in sucursales
                    ]
                except Exception as e2:
                    raise HTTPException(
                        status_code=500,
                        detail=(
                            "Error al listar sucursales. "
                            f"Primary: {type(e).__name__}: {str(e)}. "
                            f"Fallback: {type(e2).__name__}: {str(e2)}"
                        ),
                    )

    def get_by_id(self, sucursal_id: int):
        with db_session:
            s = models.Sucursal.get(id=sucursal_id)
            if not s:
                raise HTTPException(status_code=404, detail="Sucursal no encontrada")
            return {
                "id": s.id,
                "nombre": s.nombre,
                "direccion": s.direccion or "",
                "activo": s.activo,
            }

    def create(self, data: schemas.SucursalCreate) -> dict:
        with db_session:
            try:
                sucursal = models.Sucursal(
                    nombre=data.nombre,
                    direccion=data.direccion or "",
                    activo=True,
                )
                db.flush()  # así el id está asignado antes de devolver
                return {
                    "id": int(sucursal.id),
                    "nombre": sucursal.nombre,
                    "direccion": sucursal.direccion or "",
                    "activo": sucursal.activo,
                }
            except Exception as e:
                print(f"Error al crear sucursal: {e}")
                raise HTTPException(status_code=500, detail="Error al crear sucursal.")

    def update(self, sucursal_id: int, data: schemas.SucursalCreate) -> dict:
        with db_session:
            s = models.Sucursal.get(id=sucursal_id)
            if not s:
                raise HTTPException(status_code=404, detail="Sucursal no encontrada")
            s.nombre = data.nombre
            s.direccion = data.direccion or ""
            return {"message": "Sucursal actualizada correctamente"}

    def delete(self, sucursal_id: int) -> dict:
        with db_session:
            s = models.Sucursal.get(id=sucursal_id)
            if not s:
                raise HTTPException(status_code=404, detail="Sucursal no encontrada")
            if s.nombre == "Sucursal Principal":
                raise HTTPException(
                    status_code=400,
                    detail="No se puede eliminar la Sucursal Principal.",
                )
            if len(s.productos) > 0 or len(s.ventas) > 0 or len(s.cajas) > 0 or len(s.creditos) > 0:
                raise HTTPException(
                    status_code=400,
                    detail="No se puede eliminar: la sucursal tiene productos, ventas, caja o créditos asociados.",
                )
            nombre = s.nombre
            s.delete()
            return {"message": f"Sucursal '{nombre}' eliminada correctamente."}

    def transferir_stock(
        self,
        sucursal_origen_id: int,
        sucursal_destino_id: int,
        producto_codigo: str,
        cantidad: int,
    ) -> dict:
        if sucursal_origen_id == sucursal_destino_id:
            raise HTTPException(
                status_code=400,
                detail="La sucursal origen y destino deben ser distintas.",
            )
        if cantidad <= 0:
            raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0.")

        with db_session:
            origen = models.Sucursal.get(id=sucursal_origen_id)
            destino = models.Sucursal.get(id=sucursal_destino_id)
            if not origen or not destino:
                raise HTTPException(status_code=404, detail="Sucursal origen o destino no encontrada.")

            # Producto en sucursal origen (mismo código, sucursal origen)
            producto_origen = models.Product.get(
                codigo=producto_codigo,
                sucursal=origen,
            )
            if not producto_origen:
                raise HTTPException(
                    status_code=404,
                    detail=f"No existe el producto con código '{producto_codigo}' en la sucursal origen.",
                )
            if producto_origen.stock < cantidad:
                raise HTTPException(
                    status_code=400,
                    detail=f"Stock insuficiente en sucursal origen. Disponible: {producto_origen.stock}.",
                )

            # Producto en sucursal destino: puede no existir (crear con mismo datos) o existir (sumar stock)
            producto_destino = models.Product.get(
                codigo=producto_codigo,
                sucursal=destino,
            )
            if not producto_destino:
                # Código en destino: si ya existe en la DB (unique global), generar uno nuevo
                codigo_destino = producto_origen.codigo
                if models.Product.get(codigo=codigo_destino):
                    codigo_destino = _generar_codigo_unico()
                categoria = producto_origen.categoria
                color_o = producto_origen.color
                if color_o is None:
                    color_o = models.Color.get(name="NEUTRO")
                if color_o is None:
                    raise HTTPException(
                        status_code=500,
                        detail="Falta el color NEUTRO en la base de datos; ejecutá la migración SQL.",
                    )
                producto_destino = models.Product(
                    sucursal=destino,
                    codigo=codigo_destino,
                    nombre=producto_origen.nombre,
                    marca=producto_origen.marca or "Generico",
                    talle=producto_origen.talle,
                    categoria=categoria,
                    color=color_o,
                    precio_costo=producto_origen.precio_costo,
                    precio_venta=producto_origen.precio_venta,
                    precio_et=producto_origen.precio_et or 0,
                    precio_efectivo=getattr(producto_origen, "precio_efectivo", None) or 0,
                    precio_transferencia=precio_transferencia_desde_et_o_explicito(
                        float(producto_origen.precio_et or 0),
                        float(getattr(producto_origen, "precio_transferencia", None) or 0),
                    ),
                    stock=cantidad,
                    stock_minimo=producto_origen.stock_minimo,
                )
            else:
                producto_destino.stock += cantidad

            producto_origen.stock -= cantidad

            return {
                "message": f"Transferencia realizada: {cantidad} unidad(es) de '{producto_codigo}' a {destino.nombre}.",
                "stock_origen_actual": producto_origen.stock,
                "stock_destino_actual": producto_destino.stock,
            }

    def crear_producto_clon_transferencia_en_sucursal(
        self,
        producto_origen,
        sucursal_destino: models.Sucursal,
    ) -> models.Product:
        """
        Crea en sucursal_destino un artículo con el mismo catálogo que producto_origen (nombre, talle, color, precios).
        Stock inicial 0 (el llamador suma la devolución). Misma regla de código que transferir_stock: si el código ya
        existe en otra fila (único global), genera un código tipo T-XXXXXX.
        Debe llamarse dentro de un db_session ya abierto.
        """
        if producto_origen is None or sucursal_destino is None:
            raise HTTPException(status_code=500, detail="Datos inválidos al clonar producto en sucursal.")
        destino = sucursal_destino
        codigo_destino = (producto_origen.codigo or "").strip()
        if models.Product.get(codigo=codigo_destino):
            codigo_destino = _generar_codigo_unico()
        categoria = producto_origen.categoria
        color_o = producto_origen.color
        if color_o is None:
            color_o = models.Color.get(name="NEUTRO")
        if color_o is None:
            raise HTTPException(
                status_code=500,
                detail="Falta el color NEUTRO en la base de datos; ejecutá la migración SQL.",
            )
        return models.Product(
            sucursal=destino,
            codigo=codigo_destino,
            nombre=producto_origen.nombre,
            marca=producto_origen.marca or "Generico",
            talle=producto_origen.talle,
            categoria=categoria,
            color=color_o,
            precio_costo=producto_origen.precio_costo,
            precio_venta=producto_origen.precio_venta,
            precio_et=producto_origen.precio_et or 0,
            precio_efectivo=getattr(producto_origen, "precio_efectivo", None) or 0,
            precio_transferencia=precio_transferencia_desde_et_o_explicito(
                float(producto_origen.precio_et or 0),
                float(getattr(producto_origen, "precio_transferencia", None) or 0),
            ),
            stock=0,
            stock_minimo=producto_origen.stock_minimo,
        )
