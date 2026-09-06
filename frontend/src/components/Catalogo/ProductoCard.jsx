import { Check, MessageCircle, Plus } from "lucide-react";
import {
  coloresDeProducto,
  consultarProducto,
  formatearPrecio,
  monograma,
  urlImagen,
} from "../../utils/catalogo";

/** Arco pastel del isologo, reutilizado como textura del mosaico. */
function ArcoDecorativo({ claro, oscuro }) {
  return (
    <svg
      className="absolute -right-6 -bottom-8 h-40 w-40 opacity-45"
      viewBox="0 0 100 60"
      fill="none"
      aria-hidden="true"
    >
      {[
        { r: 44, c: oscuro },
        { r: 34, c: claro },
        { r: 24, c: oscuro },
      ].map((a, i) => (
        <path
          key={i}
          d={`M ${50 - a.r} 55 A ${a.r} ${a.r} 0 0 1 ${50 + a.r} 55`}
          stroke={a.c}
          strokeWidth="6"
          strokeLinecap="round"
          opacity={0.55 - i * 0.1}
        />
      ))}
    </svg>
  );
}

export default function ProductoCard({ producto, enCarrito, onAgregar, indice }) {
  const [claro, oscuro] = coloresDeProducto(producto);
  const ultimas = producto.stock <= 3;
  const marcaVisible =
    producto.marca && producto.marca.toLowerCase() !== "generico" ? producto.marca : "";

  return (
    <article
      className="entrada group flex flex-col overflow-hidden rounded-2xl border bg-white/70 transition-all duration-300 hover:-translate-y-1"
      style={{
        borderColor: "var(--coq-linea)",
        boxShadow: "0 1px 2px rgba(69,55,48,.05)",
        animationDelay: `${Math.min(indice, 11) * 45}ms`,
      }}
    >
      {/* Si el producto tiene foto la mostramos; si no (el sistema todavía no
          guarda imágenes), armamos un mosaico con el color del inventario. */}
      <div
        className="relative aspect-[7/10] overflow-hidden"
        style={{ background: `linear-gradient(150deg, ${claro} 0%, ${oscuro} 100%)` }}
      >
        {producto.imagen ? (
          <img
            src={urlImagen(producto.imagen)}
            alt={producto.nombre}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <>
            <ArcoDecorativo claro={claro} oscuro={oscuro} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="script text-5xl transition-transform duration-500 group-hover:scale-110"
                style={{ color: "rgba(255,255,255,.85)" }}
              >
                {monograma(producto)}
              </span>
            </div>
          </>
        )}

        <span
          className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide backdrop-blur"
          style={{ background: "rgba(255,255,255,.85)", color: "var(--coq-espresso)" }}
        >
          Talle {producto.talle}
        </span>

        {ultimas && (
          <span
            className="absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[10px] font-semibold"
            style={{ background: "var(--coq-terracota)", color: "#fff" }}
          >
            {producto.stock === 1 ? "Última unidad" : `Quedan ${producto.stock}`}
          </span>
        )}

        <button
          type="button"
          onClick={() => consultarProducto(producto)}
          className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full shadow-sm transition-all duration-300 sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
          style={{ background: "#fff", color: "var(--coq-salvia)" }}
          title="Consultar este producto por WhatsApp"
          aria-label={`Consultar ${producto.nombre} por WhatsApp`}
        >
          <MessageCircle size={17} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        {/* Renglón siempre presente: si aparece y desaparece según la marca,
            las tarjetas de una misma fila quedan desparejas. */}
        <p
          className="truncate text-[10px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "var(--coq-espresso-2)" }}
        >
          {marcaVisible || "\u00A0"}
        </p>

        {/* Alto fijo de dos líneas: un nombre largo no puede empujar el precio
            ni el botón, o las tarjetas de la fila quedan desalineadas. */}
        <h3 className="line-clamp-2 min-h-[2.6em] text-[13px] font-medium leading-snug sm:text-[15px]">
          {producto.nombre}
        </h3>

        <p className="truncate text-xs" style={{ color: "var(--coq-espresso-2)" }}>
          {[producto.color, producto.categoria].filter(Boolean).join(" · ") || "\u00A0"}
        </p>

        {/* mt-auto: el pie se pega abajo, así el precio y el botón quedan a la
            misma altura en todas las tarjetas. */}
        <div className="mt-auto flex flex-col gap-2 pt-3">
          <p className="text-lg font-semibold" style={{ color: "var(--coq-terracota-osc)" }}>
            {formatearPrecio(producto.precio)}
          </p>

          <button
            type="button"
            onClick={() => onAgregar(producto)}
            className="flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-xs font-semibold text-white transition-colors"
            style={{ background: enCarrito ? "var(--coq-salvia)" : "var(--coq-espresso)" }}
          >
            {enCarrito ? <Check size={14} /> : <Plus size={14} />}
            {enCarrito ? "Sumar otra" : "Agregar"}
          </button>
        </div>
      </div>
    </article>
  );
}
