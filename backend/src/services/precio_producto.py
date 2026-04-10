"""Precio unitario de un producto según método de pago (fuente de verdad en backend)."""

from __future__ import annotations

import unicodedata


def _norm_metodo_pago(metodo_pago: str | None) -> str:
    s = (metodo_pago or "").strip().lower()
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def _as_float(x) -> float:
    if x is None:
        return 0.0
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def _valor_o_cero(x) -> float:
    v = _as_float(x)
    return 0.0 if v == 0.0 else v


def precio_transferencia_desde_et_o_explicito(precio_et: float, precio_transferencia: float) -> float:
    """Valor a guardar en precio_transferencia: copia E/T si ≠ 0; si E/T es 0, el precio transferencia explícito."""
    et = _as_float(precio_et)
    tr = _as_float(precio_transferencia)
    return float(et) if et != 0.0 else float(tr)


def obtener_precio_unitario(producto, metodo_pago: str) -> float:
    """
    Efectivo → precio_efectivo → precio_et → precio_venta
    Transferencia → precio_transferencia → precio_venta (precio_et ya no interviene)
    Otros (tarjeta, débito, crédito, etc.) → precio_venta → precio_et
    """
    mp = _norm_metodo_pago(metodo_pago)
    pv = _as_float(getattr(producto, "precio_venta", None))
    et = _as_float(getattr(producto, "precio_et", None))
    pe = _valor_o_cero(getattr(producto, "precio_efectivo", None))
    pt = _valor_o_cero(getattr(producto, "precio_transferencia", None))

    if mp == "efectivo":
        if pe != 0.0:
            return float(pe)
        if et != 0.0:
            return float(et)
        return float(pv)

    if mp == "transferencia":
        if pt != 0.0:
            return float(pt)
        return float(pv)

    if pv != 0.0:
        return float(pv)
    if et != 0.0:
        return float(et)
    return 0.0


def obtener_precio(producto, metodo_pago: str) -> float:
    """Alias de obtener_precio_unitario (precio por unidad)."""
    return obtener_precio_unitario(producto, metodo_pago)
