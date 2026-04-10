/**
 * Alineado con backend: src/services/precio_producto.py (obtener_precio_unitario).
 * @param {object} producto
 * @param {string} metodoPago — ej. "Efectivo", "Transferencia", "Credito", "Débito"
 * @returns {number}
 */
export function precioUnitarioPorMetodoPago(producto, metodoPago) {
  const norm = String(metodoPago || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const nz = (v) => {
    const n = num(v);
    return n === 0 ? 0 : n;
  };

  const pv = num(producto?.precio_venta);
  const et = num(producto?.precio_et);
  const pe = nz(producto?.precio_efectivo);
  const pt = nz(producto?.precio_transferencia);

  if (norm === "efectivo") {
    if (pe !== 0) return pe;
    if (et !== 0) return et;
    return pv;
  }
  if (norm === "transferencia") {
    if (pt !== 0) return pt;
    return pv;
  }
  if (pv !== 0) return pv;
  return et;
}
