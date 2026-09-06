import { useEffect } from "react";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { coloresDeProducto, formatearPrecio, monograma, urlImagen } from "../../utils/catalogo";

function Fila({ item, onCantidad, onQuitar }) {
  const [claro, oscuro] = coloresDeProducto(item);
  return (
    <li className="flex gap-3 py-4">
      <div
        className="flex h-16 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl"
        style={{ background: `linear-gradient(150deg, ${claro} 0%, ${oscuro} 100%)` }}
      >
        {item.imagen ? (
          <img src={urlImagen(item.imagen)} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="script text-lg" style={{ color: "rgba(255,255,255,.9)" }}>
            {monograma(item)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.nombre}</p>
        <p className="text-xs" style={{ color: "var(--coq-espresso-2)" }}>
          Talle {item.talle}
          {item.color ? ` · ${item.color}` : ""}
        </p>

        <div className="mt-2 flex items-center justify-between gap-2">
          <div
            className="flex items-center rounded-full border"
            style={{ borderColor: "var(--coq-linea)" }}
          >
            <button
              type="button"
              onClick={() => onCantidad(item.id, item.cantidad - 1)}
              className="flex h-7 w-7 items-center justify-center rounded-full"
              aria-label="Quitar una unidad"
            >
              <Minus size={13} />
            </button>
            <span className="w-6 text-center text-sm font-semibold">{item.cantidad}</span>
            <button
              type="button"
              onClick={() => onCantidad(item.id, item.cantidad + 1)}
              disabled={item.cantidad >= item.stock}
              className="flex h-7 w-7 items-center justify-center rounded-full disabled:opacity-30"
              aria-label="Sumar una unidad"
            >
              <Plus size={13} />
            </button>
          </div>

          <p className="text-sm font-semibold" style={{ color: "var(--coq-terracota-osc)" }}>
            {formatearPrecio(item.precio * item.cantidad)}
          </p>
        </div>

        {item.cantidad >= item.stock && (
          <p className="mt-1 text-[11px]" style={{ color: "var(--coq-terracota)" }}>
            Es todo el stock disponible
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onQuitar(item.id)}
        className="self-start p-1"
        style={{ color: "var(--coq-espresso-2)" }}
        aria-label={`Quitar ${item.nombre} del pedido`}
      >
        <Trash2 size={15} />
      </button>
    </li>
  );
}

export default function CarritoDrawer({
  abierto,
  onCerrar,
  items,
  total,
  unidades,
  onCantidad,
  onQuitar,
  onVaciar,
  onGenerarPedido,
}) {
  // Cerrar con Escape y bloquear el scroll del fondo mientras está abierto.
  useEffect(() => {
    if (!abierto) return undefined;
    const onKey = (e) => e.key === "Escape" && onCerrar();
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflowPrevio;
      window.removeEventListener("keydown", onKey);
    };
  }, [abierto, onCerrar]);

  return (
    <>
      <div
        onClick={onCerrar}
        className={`fixed inset-0 z-40 bg-[#45373033] backdrop-blur-[2px] transition-opacity duration-300 ${
          abierto ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Tu pedido"
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-[400px] flex-col shadow-2xl transition-transform duration-300 ease-out ${
          abierto ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ background: "var(--coq-crema)" }}
      >
        <header
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--coq-linea)" }}
        >
          <div>
            <h2 className="text-base font-semibold">Tu pedido</h2>
            <p className="text-xs" style={{ color: "var(--coq-espresso-2)" }}>
              {unidades} {unidades === 1 ? "prenda" : "prendas"}
            </p>
          </div>
          <button type="button" onClick={onCerrar} className="p-1.5" aria-label="Cerrar">
            <X size={20} />
          </button>
        </header>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            <ShoppingBag size={34} style={{ color: "var(--coq-linea)" }} />
            <p className="text-sm" style={{ color: "var(--coq-espresso-2)" }}>
              Todavía no elegiste nada. Sumá las prendas que te gusten y las
              consultamos juntas por WhatsApp.
            </p>
          </div>
        ) : (
          <>
            <ul
              className="flex-1 divide-y overflow-y-auto px-5"
              style={{ borderColor: "var(--coq-linea)" }}
            >
              {items.map((item) => (
                <Fila key={item.id} item={item} onCantidad={onCantidad} onQuitar={onQuitar} />
              ))}
            </ul>

            <footer
              className="border-t px-5 py-4"
              style={{ borderColor: "var(--coq-linea)", background: "var(--coq-crema-2)" }}
            >
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-sm" style={{ color: "var(--coq-espresso-2)" }}>
                  Total estimado
                </span>
                <span className="text-xl font-semibold" style={{ color: "var(--coq-terracota-osc)" }}>
                  {formatearPrecio(total)}
                </span>
              </div>

              <button
                type="button"
                onClick={onGenerarPedido}
                className="flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-semibold text-white transition-colors"
                style={{ background: "var(--coq-terracota)" }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.16c-.25.69-1.44 1.32-1.99 1.4-.53.08-1.19.11-1.92-.12-.44-.14-1.01-.33-1.74-.65-3.06-1.32-5.06-4.4-5.21-4.61-.15-.2-1.25-1.66-1.25-3.17s.79-2.25 1.07-2.56c.28-.31.61-.38.81-.38h.58c.19 0 .44-.07.69.53.25.6.86 2.11.94 2.26.08.15.13.33.03.53-.1.2-.15.33-.3.5-.15.18-.31.39-.45.53-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.03 1.12 1 2.06 1.31 2.36 1.46.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.28.1 1.76.83 2.06.98.3.15.5.23.57.35.08.13.08.73-.17 1.42Z" />
                </svg>
                Generar pedido
              </button>

              <button
                type="button"
                onClick={onVaciar}
                className="mt-2 w-full py-1.5 text-xs underline-offset-2 hover:underline"
                style={{ color: "var(--coq-espresso-2)" }}
              >
                Vaciar pedido
              </button>

              <p className="mt-3 text-center text-[11px] leading-relaxed" style={{ color: "var(--coq-espresso-2)" }}>
                Dejás tus datos, te damos un número de pedido y se abre
                WhatsApp con el detalle. Coquetines te contacta para cerrar.
              </p>
            </footer>
          </>
        )}
      </aside>
    </>
  );
}
