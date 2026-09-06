export const PRECIO_TIPOS = [
  { value: "precio_venta", label: "Precio venta" },
  { value: "precio_efectivo", label: "Precio efectivo" },
  { value: "precio_transferencia", label: "Precio transferencia" },
  { value: "precio_et", label: "Precio ET" },
];

export const labelPrecioTipo = (tipo) =>
  PRECIO_TIPOS.find((t) => t.value === tipo)?.label || tipo;

export function precioBaseDesdeProducto(producto, precioTipo) {
  const tipo = precioTipo || "precio_venta";
  const pv = Number(producto.precio_venta) || 0;
  if (tipo === "precio_venta") return pv;
  if (tipo === "precio_efectivo") {
    const pe = Number(producto.precio_efectivo) || 0;
    return pe > 0 ? pe : pv;
  }
  if (tipo === "precio_transferencia") {
    const pt = Number(producto.precio_transferencia) || 0;
    return pt > 0 ? pt : pv;
  }
  if (tipo === "precio_et") {
    const pet = Number(producto.precio_et) || 0;
    return pet > 0 ? pet : pv;
  }
  return pv;
}

export function aplicarMarkup(precioBase, markupPct) {
  const base = Number(precioBase) || 0;
  const markup = Number(markupPct) || 0;
  return Math.round(base * (1 + markup / 100) * 100) / 100;
}

export function formatPrecio(n) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}
