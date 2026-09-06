import { apiUrl } from "./api";

/**
 * Utilidades del catálogo público (landing).
 * No dependen de sesión ni de axios: la landing es anónima.
 */

/** Número de WhatsApp del negocio, en formato internacional sin "+" ni espacios. */
export const WHATSAPP = (
  import.meta.env.VITE_WHATSAPP_CATALOGO ?? "543804661203"
)
  .toString()
  .replace(/\D/g, "");

export const INSTAGRAM_URL = "https://www.instagram.com/coquetineslr/";

const FORMATO_PRECIO = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Resuelve la URL de la foto de un producto.
 *
 * Solo las que sirve el backend ("/catalogo/imagen/12") necesitan la URL del
 * API, porque el front corre en otro puerto. Cualquier otra ruta relativa es
 * del propio front (por ejemplo /catalogo-demo/*, que vive en public/) y tiene
 * que quedar tal cual; una URL externa (Cloudinary, etc.) también.
 */
const RUTA_IMAGEN_API = "/catalogo/imagen/";

export function urlImagen(imagen) {
  if (!imagen) return null;
  if (imagen.startsWith(RUTA_IMAGEN_API)) return apiUrl(imagen);
  return imagen;
}

export function formatearPrecio(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "$ —";
  return FORMATO_PRECIO.format(n);
}

/**
 * Paleta para el mosaico de cada producto. Como el sistema todavía no guarda
 * fotos, la tarjeta usa el color cargado en el inventario para pintar el tile.
 */
const COLORES = {
  blanco: ["#FFFFFF", "#F0E9E0"],
  crudo: ["#FAF3E8", "#EADCC9"],
  beige: ["#F2E4D2", "#DCC6AC"],
  arena: ["#EFE0CC", "#D8C0A2"],
  camel: ["#DFC0A0", "#C39B72"],
  marron: ["#B08968", "#7F5F45"],
  chocolate: ["#8C6249", "#5E4130"],
  negro: ["#4A4A4A", "#232323"],
  gris: ["#DCDCDC", "#AFAFAF"],
  celeste: ["#D5E7F0", "#A8C9DC"],
  azul: ["#AFC4DE", "#6E8AAF"],
  rosa: ["#F5D9DA", "#E3B0B2"],
  rosado: ["#F5D9DA", "#E3B0B2"],
  fucsia: ["#EFC0D3", "#D07FA5"],
  rojo: ["#E9AFA5", "#C4685C"],
  bordo: ["#C08A88", "#8A4A4C"],
  verde: ["#CFDCC2", "#9DAE8B"],
  oliva: ["#C9CDA9", "#95996F"],
  amarillo: ["#F6E6BE", "#E2C57F"],
  mostaza: ["#EED9A6", "#CFAA5B"],
  naranja: ["#F6D2B4", "#DFA271"],
  lila: ["#E0D6EB", "#B7A6CC"],
  violeta: ["#D2C6E2", "#9E8CBB"],
  nude: ["#F1DECF", "#DBBCA5"],
  neutro: ["#F1E7DA", "#D7C6B2"],
};

const FALLBACK = [
  ["#F3E4D4", "#DCC2A5"],
  ["#EFE1E2", "#D6BCBD"],
  ["#E4EADF", "#C2CFBB"],
  ["#EAE3F0", "#CBBEDA"],
  ["#F5E9D2", "#DCC79A"],
];

function normalizar(texto) {
  return (texto ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Devuelve [claro, oscuro] para pintar el degradado de la tarjeta. */
export function coloresDeProducto(producto) {
  const color = normalizar(producto?.color);
  for (const clave of Object.keys(COLORES)) {
    if (color.includes(clave)) return COLORES[clave];
  }
  // Sin color reconocible: pastel estable derivado del código, para que el
  // mismo producto se vea siempre igual.
  const semilla = normalizar(producto?.codigo || producto?.nombre);
  let hash = 0;
  for (let i = 0; i < semilla.length; i += 1) {
    hash = (hash * 31 + semilla.charCodeAt(i)) % 9973;
  }
  return FALLBACK[hash % FALLBACK.length];
}

/** Iniciales para el monograma del mosaico. */
export function monograma(producto) {
  const palabras = (producto?.nombre || "")
    .split(/\s+/)
    .filter((p) => p.length > 1);
  if (!palabras.length) return "C";
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[1][0]).toUpperCase();
}

function detalle(producto) {
  const partes = [];
  if (producto?.talle) partes.push(`talle ${producto.talle}`);
  if (producto?.color) partes.push(producto.color);
  return partes.length ? ` (${partes.join(" · ")})` : "";
}

function abrirWhatsApp(texto) {
  const url = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Consulta por un único producto desde la tarjeta. */
export function consultarProducto(producto) {
  const texto =
    `¡Hola Coquetines! 🤎\n\n` +
    `Me interesa este producto del catálogo:\n` +
    `• ${producto.nombre}${detalle(producto)} — ${formatearPrecio(producto.precio)}\n` +
    `  Código: ${producto.codigo}\n\n` +
    `¿Está disponible?`;
  abrirWhatsApp(texto);
}

/**
 * Abre WhatsApp con el detalle del pedido.
 *
 * Cuando el pedido se registró en el sistema le pasamos el `numero`: es lo que
 * permite que Coquetines cruce el mensaje de WhatsApp con la fila del
 * dashboard. Sin número (por ejemplo si falló el alta) el mensaje sale igual,
 * para no dejar a la clienta sin poder escribir.
 */
export function pedirCarrito(items, datos = {}) {
  const lineas = items.map(
    (i) =>
      `• ${i.cantidad}× ${i.nombre}${detalle(i)} — ${formatearPrecio(
        i.precio * i.cantidad
      )}\n  Código: ${i.codigo}`
  );
  const total = items.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
  const unidades = items.reduce((acc, i) => acc + i.cantidad, 0);

  const encabezado = datos.numero
    ? `¡Hola Coquetines! 🤎\n\nPedido N° *${datos.numero}*\n\n` +
      `Detalle (${unidades} ${unidades === 1 ? "prenda" : "prendas"}):\n\n`
    : `¡Hola Coquetines! 🤎\n\nQuiero hacer este pedido (${unidades} ${
        unidades === 1 ? "prenda" : "prendas"
      }):\n\n`;

  const pie = [];
  if (datos.nombre) pie.push(`Nombre: ${datos.nombre}`);
  if (datos.localidad) pie.push(`Localidad: ${datos.localidad}`);
  if (datos.nota) pie.push(`Nota: ${datos.nota}`);

  const texto =
    encabezado +
    `${lineas.join("\n")}\n\n` +
    `Total estimado: ${formatearPrecio(total)}\n` +
    (pie.length ? `\n${pie.join("\n")}\n` : "") +
    (datos.numero
      ? `\nYa dejé el pedido cargado en la web. Quedo a la espera 💛`
      : `\nPedido armado desde el catálogo web. Quedo a la espera para coordinar pago y entrega 💛`);

  abrirWhatsApp(texto);
}

/**
 * Registra el pedido en el sistema y devuelve su número.
 * Los precios se recalculan en el backend: acá solo van producto y cantidad.
 */
export async function crearPedido({ items, nombre, telefono, localidad, nota }) {
  const res = await fetch(apiUrl("/catalogo/pedidos"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre,
      telefono,
      localidad: localidad || "",
      nota: nota || "",
      items: items.map((i) => ({ producto_id: i.id, cantidad: i.cantidad })),
    }),
  });

  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) {
    const detalleError =
      typeof cuerpo?.detail === "string"
        ? cuerpo.detail
        : "No pudimos registrar el pedido.";
    throw new Error(detalleError);
  }
  return cuerpo;
}
