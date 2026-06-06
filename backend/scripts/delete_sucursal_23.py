"""
Elimina la sucursal id=23 y todos los registros asociados (cascada manual).
Ejecutar desde backend/: python3 scripts/delete_sucursal_23.py
"""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import main  # noqa: E402,F401

from pony.orm import db_session, commit  # noqa: E402
from src import models  # noqa: E402

SUCURSAL_ID = 23
SID = SUCURSAL_ID


def step(msg: str, count: int = 0) -> None:
    suffix = f" ({count} registro(s))" if count else ""
    print(f"  → {msg}{suffix}")


def _unique_by_id(*querysets):
    seen: set[int] = set()
    out = []
    for qs in querysets:
        for obj in qs:
            if obj.id not in seen:
                seen.add(obj.id)
                out.append(obj)
    return out


def delete_queryset(label: str, items) -> int:
    items = list(items)
    n = len(items)
    if n:
        step(f"Eliminando {label}", n)
        for obj in items:
            obj.delete()
        commit()
    else:
        step(f"Sin {label} para eliminar")
    return n


@db_session
def run() -> None:
    suc = models.Sucursal.get(id=SID)
    if not suc:
        print(f"ERROR: No existe sucursal con id={SID}")
        sys.exit(1)

    print(f"\n=== Eliminación en cascada: sucursal #{SID} '{suc.nombre}' ===\n")

    totals: dict[str, int] = {}

    totals["NotasCredito"] = delete_queryset(
        "NotasCredito",
        models.NotaCredito.select(lambda n: n.sucursal.id == SID),
    )

    totals["CambioVenta"] = delete_queryset(
        "CambioVenta",
        _unique_by_id(
            models.CambioVenta.select(lambda c: c.sucursal.id == SID),
            models.CambioVenta.select(lambda c: c.venta_original.sucursal.id == SID),
        ),
    )

    totals["MovimientoCaja"] = delete_queryset(
        "MovimientoCaja",
        models.MovimientoCaja.select(lambda m: m.caja.sucursal.id == SID),
    )

    totals["VentaPago"] = delete_queryset(
        "VentaPago",
        models.VentaPago.select(lambda p: p.venta.sucursal.id == SID),
    )

    totals["VentaProducto"] = delete_queryset(
        "VentaProducto",
        models.VentaProducto.select(lambda vp: vp.venta.sucursal.id == SID),
    )

    totals["Venta"] = delete_queryset(
        "Venta",
        models.Venta.select(lambda v: v.sucursal.id == SID),
    )

    totals["CajaDiaria"] = delete_queryset(
        "CajaDiaria",
        models.CajaDiaria.select(lambda c: c.sucursal.id == SID),
    )

    totals["PagoCredito"] = delete_queryset(
        "PagoCredito",
        models.PagoCredito.select(lambda p: p.credito.sucursal.id == SID),
    )

    totals["CreditoProducto"] = delete_queryset(
        "CreditoProducto",
        models.CreditoProducto.select(lambda cp: cp.credito.sucursal.id == SID),
    )

    totals["CreditoPersonal"] = delete_queryset(
        "CreditoPersonal",
        models.CreditoPersonal.select(lambda c: c.sucursal.id == SID),
    )

    totals["Cliente"] = delete_queryset(
        "Cliente",
        models.Cliente.select(lambda c: c.sucursal.id == SID),
    )

    totals["IngresoStock"] = delete_queryset(
        "IngresoStock",
        models.IngresoStock.select(lambda i: i.producto.sucursal.id == SID),
    )

    totals["Product"] = delete_queryset(
        "Product",
        models.Product.select(lambda p: p.sucursal.id == SID),
    )

    totals["User"] = delete_queryset(
        "User",
        models.User.select(lambda u: u.sucursal.id == SID),
    )

    refs = list(models.Sucursal.select(lambda s: s.sucursal_stock_id == SID))
    if refs:
        step("Limpiando sucursal_stock_id en otras sucursales", len(refs))
        for s in refs:
            print(f"      · Sucursal #{s.id} '{s.nombre}': sucursal_stock_id → NULL")
            s.sucursal_stock_id = None
        commit()
        totals["SucursalStockRef"] = len(refs)
    else:
        step("Sin otras sucursales con sucursal_stock_id apuntando aquí")
        totals["SucursalStockRef"] = 0

    nombre = suc.nombre
    step(f"Eliminando Sucursal #{SID} '{nombre}'")
    suc.delete()
    commit()
    totals["Sucursal"] = 1

    print("\n=== Resumen ===")
    for k, v in totals.items():
        if v:
            print(f"  {k}: {v}")
    print(f"\n✓ Sucursal #{SID} '{nombre}' eliminada correctamente.\n")


if __name__ == "__main__":
    run()
