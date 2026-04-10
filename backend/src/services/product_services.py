from pony.orm import db_session, select, sum
from fastapi import HTTPException
from pony.orm.core import TransactionIntegrityError
from src import models, schemas
from src.services.precio_producto import precio_transferencia_desde_et_o_explicito
from src.services.sucursal_services import SucursalServices


def _default_sucursal_id():
    """ID de la sucursal por defecto (evitar anidar db_session dentro de otros)."""
    return SucursalServices().get_or_create_default_sucursal_id()


def _product_to_dict(product, ocultar_costo: bool = False):
    """Convierte entidad Product a dict serializable. Si ocultar_costo=True (rol EMPLEADO), no devuelve el costo real."""
    try:
        suc = getattr(product, "sucursal", None)
        sid = int(suc.id) if (suc and getattr(suc, "id", None) is not None) else None
        cat = getattr(product, "categoria", None)
        if cat and getattr(cat, "id", None) is not None:
            categoria = {"id": int(cat.id), "name": str(getattr(cat, "name", "") or "")}
        else:
            categoria = None
        col = getattr(product, "color", None)
        if col and getattr(col, "id", None) is not None:
            color = {"id": int(col.id), "name": str(getattr(col, "name", "") or "")}
        else:
            color = {"id": 0, "name": "NEUTRO"}
        precio_costo = 0.0 if ocultar_costo else (float(product.precio_costo) if getattr(product, "precio_costo", None) is not None else 0.0)
        return {
            "id": int(getattr(product, "id", 0)),
            "sucursal_id": sid,
            "codigo": str(getattr(product, "codigo", "") or ""),
            "nombre": str(getattr(product, "nombre", "") or ""),
            "marca": str(getattr(product, "marca", "") or "Generico"),
            "talle": str(getattr(product, "talle", "") or ""),
            "categoria": categoria,
            "color": color,
            "precio_costo": precio_costo,
            "precio_venta": float(product.precio_venta) if getattr(product, "precio_venta", None) is not None else 0.0,
            "precio_et": float(product.precio_et) if getattr(product, "precio_et", None) is not None else 0.0,
            "precio_efectivo": float(getattr(product, "precio_efectivo", None) or 0),
            "precio_transferencia": float(getattr(product, "precio_transferencia", None) or 0),
            "stock": int(product.stock) if getattr(product, "stock", None) is not None else 0,
            "stock_minimo": int(product.stock_minimo) if getattr(product, "stock_minimo", None) is not None else 0,
        }
    except Exception as e:
        print(f"[_product_to_dict] Error en producto id={getattr(product, 'id', '?')}: {e}")
        raise


def _usuario_puede_modificar_producto(current_user, product) -> None:
    """OWNER: cualquier producto. ADMIN/EMPLEADO: solo el de su sucursal (o sin sucursal si es la default)."""
    role = getattr(current_user, "role", None)
    if role == "OWNER":
        return
    user_sid = getattr(current_user, "sucursal_id", None)
    if user_sid is None:
        raise HTTPException(
            status_code=403,
            detail="No tenés permiso para registrar ingreso de stock.",
        )
    user_sid = int(user_sid)
    ps = product.sucursal
    if ps is not None:
        if int(ps.id) != user_sid:
            raise HTTPException(
                status_code=403,
                detail="No podés ingresar stock de productos de otra sucursal.",
            )
        return
    default_id = _default_sucursal_id()
    if user_sid != default_id:
        raise HTTPException(
            status_code=403,
            detail="No podés modificar productos sin sucursal asignada.",
        )


class ProductServices:
    def _init_(self):
        pass

    def create_producto(self, codigo_data: schemas.ProductCreate, sucursal_id: int, es_empleado: bool = False) -> dict:
        with db_session:
            try:
                sucursal = models.Sucursal.get(id=sucursal_id)
                if not sucursal:
                    raise HTTPException(status_code=404, detail="Sucursal no encontrada")
                existing_product = models.Product.get(codigo=codigo_data.codigo, sucursal=sucursal)
                if existing_product:
                    raise HTTPException(
                        status_code=400,
                        detail=f"El código {codigo_data.codigo} ya está en uso en esta sucursal.",
                    )
                category = models.Category.get(id=codigo_data.categoria_id)
                if not category:
                    raise HTTPException(status_code=404, detail="Categoría no encontrada")
                color_ent = models.Color.get(id=codigo_data.color_id)
                if not color_ent:
                    raise HTTPException(status_code=404, detail="Color no encontrado")
                precio_costo = 0.0 if es_empleado else codigo_data.precio_costo
                tr_guardar = precio_transferencia_desde_et_o_explicito(
                    codigo_data.precio_et, codigo_data.precio_transferencia
                )
                producto = models.Product(
                    sucursal=sucursal,
                    codigo=codigo_data.codigo,
                    nombre=codigo_data.nombre,
                    marca=codigo_data.marca or "",
                    talle=codigo_data.talle,
                    categoria=category,
                    color=color_ent,
                    precio_costo=precio_costo,
                    precio_venta=codigo_data.precio_venta,
                    precio_et=codigo_data.precio_et,
                    precio_efectivo=codigo_data.precio_efectivo,
                    precio_transferencia=tr_guardar,
                    stock=codigo_data.stock,
                    stock_minimo=codigo_data.stock_minimo,
                )
                product_dict = producto.to_dict(exclude=["id"])
                product_dict["sucursal_id"] = sucursal_id
                if product_dict.get("categoria"):
                    product_dict["categoria"] = {"id": category.id, "name": category.name}
                product_dict["color"] = {"id": color_ent.id, "name": color_ent.name}
                return product_dict
            except HTTPException:
                raise
            except TransactionIntegrityError as e:
                # Normalmente esto es un código duplicado a nivel de base (UNIQUE en codigo)
                print(f"Error de integridad transaccional: {e}")
                raise HTTPException(
                    status_code=400,
                    detail=f"Ya existe un producto con el código {codigo_data.codigo}.",
                )
            except Exception as e:
                print(f"Error al crear el producto: {e}")
                raise HTTPException(status_code=500, detail="Error al crear el producto.")


    def get_product_by_code(self, codigo: str, sucursal_id: int | None, ocultar_costo: bool = False):
        with db_session:
            try:
                if sucursal_id is None:
                    # OWNER: buscar por código globalmente (codigo es único en DB)
                    product = models.Product.get(codigo=codigo)
                else:
                    sucursal = models.Sucursal.get(id=sucursal_id)
                    if not sucursal:
                        raise HTTPException(status_code=404, detail="Sucursal no encontrada")
                    default_id = _default_sucursal_id()
                    product = models.Product.get(codigo=codigo, sucursal=sucursal)
                    if not product and sucursal.id == default_id:
                        product = models.Product.get(codigo=codigo, sucursal=None)
                if not product:
                    raise HTTPException(status_code=404, detail="Producto no encontrado")
                precio_costo = 0.0 if ocultar_costo else float(product.precio_costo)
                col = product.color
                color_dict = {"id": int(col.id), "name": col.name} if col else {"id": 0, "name": "NEUTRO"}
                product_dict = {
                    "id": product.id,
                    "sucursal_id": product.sucursal.id if product.sucursal else None,
                    "codigo": product.codigo,
                    "nombre": product.nombre,
                    "marca": product.marca or "Generico",
                    "talle": product.talle,
                    "categoria": {"id": product.categoria.id, "name": product.categoria.name} if product.categoria else None,
                    "color": color_dict,
                    "precio_costo": precio_costo,
                    "precio_venta": float(product.precio_venta),
                    "precio_et": float(product.precio_et) if product.precio_et is not None else 0.0,
                    "precio_efectivo": float(getattr(product, "precio_efectivo", None) or 0),
                    "precio_transferencia": float(getattr(product, "precio_transferencia", None) or 0),
                    "stock": int(product.stock),
                    "stock_minimo": int(product.stock_minimo),
                }
                return product_dict
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al obtener el producto: {e}")
                raise HTTPException(status_code=500, detail="Error al obtener el producto")

    def get_all_products(self, sucursal_id: int | None, ocultar_costo: bool = False):
        default_id = None
        if sucursal_id is not None:
            try:
                default_id = _default_sucursal_id()
            except Exception as e:
                print(f"[get_all_products] Error obteniendo sucursal por defecto: {e}")
                default_id = None
        sid = int(sucursal_id) if sucursal_id is not None else None
        with db_session:
            try:
                all_products = list(models.Product.select())
                if sid is not None:
                    sucursal = models.Sucursal.get(id=sid)
                    if not sucursal:
                        raise HTTPException(status_code=404, detail="Sucursal no encontrada")
                    if default_id is not None and sid == default_id:
                        products = [p for p in all_products if p.sucursal is None or (p.sucursal is not None and p.sucursal.id == sid)]
                    else:
                        products = [p for p in all_products if p.sucursal is not None and p.sucursal.id == sid]
                else:
                    products = all_products
                return [_product_to_dict(p, ocultar_costo=ocultar_costo) for p in products]
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al obtener los productos: {e}")
                import traceback
                traceback.print_exc()
                raise HTTPException(status_code=500, detail=f"Error al obtener productos: {str(e)}")



    def update_product(self, codigo: str, sucursal_id: int, product_update: schemas.ProductUpdate, es_empleado: bool = False) -> dict:
        with db_session:
            try:
                sucursal = models.Sucursal.get(id=sucursal_id)
                if not sucursal:
                    raise HTTPException(status_code=404, detail="Sucursal no encontrada")
                product = models.Product.get(codigo=codigo, sucursal=sucursal)
                if not product:
                    default_id = _default_sucursal_id()
                    if sucursal_id == default_id:
                        product = models.Product.get(codigo=codigo, sucursal=None)
                if not product:
                    raise HTTPException(status_code=404, detail="Producto no encontrado")
                category = models.Category.get(id=product_update.categoria_id)
                if not category:
                    raise HTTPException(status_code=404, detail="Categoría no encontrada")
                color_ent = models.Color.get(id=product_update.color_id)
                if not color_ent:
                    raise HTTPException(status_code=404, detail="Color no encontrado")
                if product_update.codigo and product_update.codigo != product.codigo:
                    existing = models.Product.get(codigo=product_update.codigo, sucursal=sucursal)
                    if existing:
                        raise HTTPException(
                            status_code=400,
                            detail=f"El código {product_update.codigo} ya está en uso en esta sucursal.",
                        )
                    product.codigo = product_update.codigo
                product.nombre = product_update.nombre
                product.marca = product_update.marca or ""
                product.talle = product_update.talle
                if not es_empleado:
                    product.precio_costo = product_update.precio_costo
                product.precio_venta = product_update.precio_venta
                product.precio_et = product_update.precio_et
                product.precio_efectivo = product_update.precio_efectivo
                product.precio_transferencia = precio_transferencia_desde_et_o_explicito(
                    product_update.precio_et, product_update.precio_transferencia
                )
                product.stock = product_update.stock
                product.stock_minimo = product_update.stock_minimo
                product.categoria = category
                product.color = color_ent
                if product.sucursal is None and sucursal:
                    product.sucursal = sucursal
                return {"message": "Producto actualizado correctamente"}
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al actualizar el producto: {e}")
                raise HTTPException(status_code=500, detail="Error inesperado al actualizar el producto.")

    def delete_product(self, codigo: str, sucursal_id: int) -> dict:
        with db_session:
            try:
                sucursal = models.Sucursal.get(id=sucursal_id)
                if not sucursal:
                    raise HTTPException(status_code=404, detail="Sucursal no encontrada")
                product = models.Product.get(codigo=codigo, sucursal=sucursal)
                if not product and sucursal.id == _default_sucursal_id():
                    product = models.Product.get(codigo=codigo, sucursal=None)
                if not product:
                    raise HTTPException(status_code=404, detail="Producto no encontrado")
                product.delete()
                return {"message": "Producto eliminado correctamente"}
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al eliminar el producto: {e}")
                raise HTTPException(status_code=500, detail="Error inesperado al eliminar el producto.")

    def delete_product_by_codigo_if_unique(self, codigo: str) -> dict:
        """Para OWNER sin sucursal en la URL: elimina solo si hay un único producto con ese código."""
        with db_session:
            try:
                products = list(models.Product.select(lambda p: p.codigo == codigo))
                if len(products) == 0:
                    raise HTTPException(status_code=404, detail="Producto no encontrado")
                if len(products) > 1:
                    raise HTTPException(
                        status_code=400,
                        detail="Hay más de un producto con este código; indicá la sucursal en la URL (?sucursal_id=).",
                    )
                products[0].delete()
                return {"message": "Producto eliminado correctamente"}
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al eliminar el producto: {e}")
                raise HTTPException(status_code=500, detail="Error inesperado al eliminar el producto.")
            
    
    def get_low_stock_products(self, sucursal_id: int | None, ocultar_costo: bool = False):
        with db_session:
            try:
                if sucursal_id is not None:
                    sucursal = models.Sucursal.get(id=sucursal_id)
                    if not sucursal:
                        raise HTTPException(status_code=404, detail="Sucursal no encontrada")
                    default_id = _default_sucursal_id()
                    if sucursal.id == default_id:
                        low_stock_products = list(models.Product.select(lambda p: (p.sucursal == sucursal or p.sucursal is None) and p.stock < p.stock_minimo))
                    else:
                        low_stock_products = list(models.Product.select(lambda p: p.sucursal == sucursal and p.stock < p.stock_minimo))
                else:
                    low_stock_products = list(models.Product.select(lambda p: p.stock < p.stock_minimo))
                if not low_stock_products:
                    raise HTTPException(status_code=404, detail="No hay productos con stock bajo.")
                return [
                    {
                        "id": product.id,
                        "sucursal_id": product.sucursal.id if product.sucursal else None,
                        "codigo": product.codigo,
                        "nombre": product.nombre,
                        "marca": product.marca or "Generico",
                        "talle": product.talle,
                        "categoria": {"id": product.categoria.id, "name": product.categoria.name} if product.categoria else None,
                        "color": {"id": product.color.id, "name": product.color.name} if product.color else {"id": 0, "name": "NEUTRO"},
                        "stock": int(product.stock),
                        "stock_minimo": int(product.stock_minimo),
                        "precio_costo": 0.0 if ocultar_costo else float(product.precio_costo),
                        "precio_venta": float(product.precio_venta),
                        "precio_et": float(product.precio_et) if product.precio_et is not None else 0.0,
                        "precio_efectivo": float(getattr(product, "precio_efectivo", None) or 0),
                        "precio_transferencia": float(getattr(product, "precio_transferencia", None) or 0),
                    }
                    for product in low_stock_products
                ]
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al obtener productos con stock bajo: {e}")
                raise HTTPException(status_code=500, detail="Error inesperado al obtener productos con stock bajo.")

    def get_total_products(self, sucursal_id: int | None):
        default_id = None
        if sucursal_id is not None:
            try:
                default_id = _default_sucursal_id()
            except Exception:
                default_id = None
        sid = int(sucursal_id) if sucursal_id is not None else None
        with db_session:
            try:
                all_products = list(models.Product.select())
                if sid is not None:
                    if default_id is not None and sid == default_id:
                        products = [p for p in all_products if p.sucursal is None or (p.sucursal is not None and p.sucursal.id == sid)]
                    else:
                        products = [p for p in all_products if p.sucursal is not None and p.sucursal.id == sid]
                else:
                    products = all_products
                return {"total_products": len(products)}
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al obtener la cantidad de productos: {e}")
                raise HTTPException(status_code=500, detail="Error inesperado al obtener la cantidad de productos.")

    def get_inventory_value(self, sucursal_id: int | None):
        default_id = None
        if sucursal_id is not None:
            try:
                default_id = _default_sucursal_id()
            except Exception:
                default_id = None
        sid = int(sucursal_id) if sucursal_id is not None else None
        with db_session:
            try:
                all_products = list(models.Product.select())
                if sid is not None:
                    if default_id is not None and sid == default_id:
                        products = [p for p in all_products if p.sucursal is None or (p.sucursal is not None and p.sucursal.id == sid)]
                    else:
                        products = [p for p in all_products if p.sucursal is not None and p.sucursal.id == sid]
                else:
                    products = all_products
                total_value = sum((p.stock or 0) * (p.precio_venta or 0) for p in products)
                return {"inventory_value": total_value}
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al obtener el valor del inventario: {e}")
                raise HTTPException(status_code=500, detail="Error inesperado al obtener el valor del inventario.")

    def get_low_stock_count(self, sucursal_id: int | None):
        default_id = None
        if sucursal_id is not None:
            try:
                default_id = _default_sucursal_id()
            except Exception:
                default_id = None
        sid = int(sucursal_id) if sucursal_id is not None else None
        with db_session:
            try:
                all_products = list(models.Product.select())
                if sid is not None:
                    if default_id is not None and sid == default_id:
                        products = [p for p in all_products if (p.sucursal is None or (p.sucursal is not None and p.sucursal.id == sid)) and (p.stock or 0) < (p.stock_minimo or 0)]
                    else:
                        products = [p for p in all_products if p.sucursal is not None and p.sucursal.id == sid and (p.stock or 0) < (p.stock_minimo or 0)]
                else:
                    products = [p for p in all_products if (p.stock or 0) < (p.stock_minimo or 0)]
                return {"low_stock_count": len(products)}
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al obtener la cantidad de productos con stock bajo: {e}")
                raise HTTPException(status_code=500, detail="Error inesperado al obtener la cantidad de productos con stock bajo.")

    def get_stats_por_sucursal(self):
        """Para OWNER: cantidad de productos y valor de inventario por cada sucursal (1 sola pasada).

        Importante: evitamos llamar repetidamente a `list(Product.select())` dentro de un loop,
        porque en Render puede disparar timeouts/500 cuando hay muchos productos.
        """
        sucursal_svc = SucursalServices()
        sucursales = sucursal_svc.list_all(solo_activas=True)

        # Excluimos "Sucursal Principal" como se hacía antes.
        target = [
            {"id": s["id"], "nombre": s.get("nombre", "")}
            for s in sucursales
            if (s.get("nombre") or "") != "Sucursal Principal"
        ]
        target_ids = {s["id"] for s in target}
        if not target_ids:
            return []

        totals = {sid: 0 for sid in target_ids}
        values = {sid: 0.0 for sid in target_ids}

        with db_session:
            # Una sola lectura de Products; luego agregamos en Python por sucursal.
            all_products = list(models.Product.select())
            for p in all_products:
                sid = int(p.sucursal.id) if p.sucursal is not None and p.sucursal.id is not None else None
                if sid is None or sid not in target_ids:
                    continue
                totals[sid] += 1
                values[sid] += (p.stock or 0) * (p.precio_venta or 0)

        result = []
        for s in target:
            sid = s["id"]
            result.append(
                {
                    "sucursal_id": sid,
                    "sucursal_nombre": s["nombre"],
                    "total_products": totals.get(sid, 0),
                    "inventory_value": values.get(sid, 0.0),
                }
            )
        return result

    def buscar_stock_otras_sucursales(
        self,
        sucursal_propia_id: int,
        busqueda: str = "",
        talle: str = "",
        ocultar_costo: bool = False,
    ) -> list[dict]:
        """Busca productos en TODAS las sucursales distintas a la propia. Filtra por nombre/código y talle."""
        with db_session:
            try:
                all_products = list(models.Product.select())
                productos = [
                    p for p in all_products
                    if p.sucursal is not None and p.sucursal.id != sucursal_propia_id and p.stock > 0
                ]
                if busqueda:
                    term = busqueda.lower()
                    productos = [
                        p for p in productos
                        if term in (p.nombre or "").lower()
                        or term in (p.codigo or "").lower()
                        or term in (p.marca or "").lower()
                    ]
                if talle:
                    talle_lower = talle.lower()
                    productos = [
                        p for p in productos
                        if (p.talle or "").lower() == talle_lower
                    ]
                return [
                    {
                        **_product_to_dict(p, ocultar_costo=ocultar_costo),
                        "sucursal_nombre": p.sucursal.nombre if p.sucursal else "Sin sucursal",
                    }
                    for p in productos
                ]
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al buscar stock en otras sucursales: {e}")
                import traceback
                traceback.print_exc()
                raise HTTPException(status_code=500, detail="Error al buscar stock en otras sucursales.")

    def registrar_ingreso_stock(self, data: schemas.StockIngresoCreate, current_user) -> dict:
        with db_session:
            try:
                product = models.Product.get(id=data.producto_id)
                if not product:
                    raise HTTPException(status_code=404, detail="Producto no encontrado")
                _usuario_puede_modificar_producto(current_user, product)
                motivo = (data.motivo or "").strip() or None
                models.IngresoStock(
                    producto=product,
                    fecha=data.fecha,
                    cantidad=int(data.cantidad),
                    motivo=motivo,
                )
                product.stock = int(product.stock or 0) + int(data.cantidad)
                return {
                    "message": "Ingreso de stock registrado correctamente.",
                    "stock_actual": int(product.stock),
                }
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al registrar ingreso de stock: {e}")
                raise HTTPException(status_code=500, detail="Error al registrar el ingreso de stock.")

    def list_ingresos_stock_producto(self, producto_id: int, current_user) -> list[dict]:
        with db_session:
            try:
                product = models.Product.get(id=producto_id)
                if not product:
                    raise HTTPException(status_code=404, detail="Producto no encontrado")
                _usuario_puede_modificar_producto(current_user, product)
                # Evitar select() sobre IngresoStock: en algunas versiones de Pony rompe ("tuple index out of range").
                rows = list(product.ingresos_stock)
                rows.sort(key=lambda i: (i.fecha, i.id), reverse=True)
                return [
                    {
                        "id": int(r.id),
                        "fecha": r.fecha,
                        "cantidad": int(r.cantidad),
                        "motivo": r.motivo,
                    }
                    for r in rows
                ]
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al listar ingresos de stock: {e}")
                raise HTTPException(status_code=500, detail="Error al listar ingresos de stock.")