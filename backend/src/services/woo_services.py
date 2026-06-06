from fastapi import HTTPException

from src import schemas
from src.services.product_services import ProductServices
from src.services.ventas_services import VentasServices


class WooServices:
    def __init__(self):
        self._product_service = ProductServices()
        self._ventas_service = VentasServices()

    def list_productos(self, sucursal_id: int) -> list[dict]:
        productos = self._product_service.get_all_products(
            sucursal_id=int(sucursal_id),
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

        venta_data = schemas.VentaCreate(
            sucursal_id=int(sucursal_id),
            cliente=str(cliente).strip(),
            metodo_pago=str(metodo_pago).strip(),
            productos=[
                schemas.DetalleVentaCreate(
                    producto_id=int(item["producto_id"]),
                    cantidad=int(item["cantidad"]),
                    precio_unitario=float(item["precio_unitario"]),
                    tipo_precio=item.get("tipo_precio"),
                )
                for item in productos
            ],
        )
        return self._ventas_service.create_venta(venta_data, sucursal_id=int(sucursal_id))
