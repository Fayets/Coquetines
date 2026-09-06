import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Loader2, X } from "lucide-react";
import { crearPedido, formatearPrecio, pedirCarrito } from "../../utils/catalogo";

const VACIO = { nombre: "", telefono: "", localidad: "", nota: "" };

function Campo({ etiqueta, obligatorio, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline gap-1.5 text-xs font-medium">
        {etiqueta}
        {obligatorio && <span style={{ color: "var(--coq-terracota)" }}>*</span>}
        {hint && (
          <span className="text-[11px] font-normal" style={{ color: "var(--coq-espresso-2)" }}>
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

const claseInput =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors";
const estiloInput = { borderColor: "var(--coq-linea)", background: "#fff" };

/**
 * Cartel de confirmación del pedido.
 *
 * Registra el pedido en el sistema (para que caiga en el dashboard) y recién
 * después abre WhatsApp con el número asignado, así Coquetines puede cruzar el
 * mensaje con la fila del panel.
 */
export default function ConfirmarPedido({ abierto, onCerrar, items, total, unidades, demo, onListo }) {
  const [form, setForm] = useState(VACIO);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);
  const primerCampo = useRef(null);

  // Los handlers del padre son arrows inline: si el efecto dependiera de
  // ellos, cualquier re-render (por ejemplo al vaciar el carrito) volvería a
  // correrlo y borraría la pantalla de "pedido registrado".
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;
  const enviandoRef = useRef(enviando);
  enviandoRef.current = enviando;

  useEffect(() => {
    if (!abierto) return undefined;
    setError(null);
    setResultado(null);
    const onKey = (e) => {
      if (e.key === "Escape" && !enviandoRef.current) cerrarRef.current();
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => primerCampo.current?.focus(), 120);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [abierto]);

  if (!abierto) return null;

  const cambiar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const telefonoValido = form.telefono.replace(/\D/g, "").length >= 6;
  const puedeEnviar = form.nombre.trim().length >= 2 && telefonoValido && !enviando;

  const enviar = async (e) => {
    e.preventDefault();
    if (!puedeEnviar) return;
    setEnviando(true);
    setError(null);
    try {
      // En la maqueta los productos no existen en la base: simulamos el alta
      // para poder mostrar el circuito completo sin ensuciar el sistema.
      const respuesta = demo
        ? { numero: "W-DEMO", total }
        : await crearPedido({ items, ...form });

      setResultado(respuesta);
      pedirCarrito(items, {
        numero: respuesta.numero,
        nombre: form.nombre.trim(),
        localidad: form.localidad.trim(),
        nota: form.nota.trim(),
      });
      onListo?.(respuesta);
      setForm(VACIO);
    } catch (err) {
      setError(err.message || "No pudimos registrar el pedido.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-[#45373066] backdrop-blur-[2px]"
        onClick={() => !enviando && onCerrar()}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-pedido"
        className="entrada relative w-full max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl"
        style={{ background: "var(--coq-crema)" }}
      >
        {resultado ? (
          /* ---------------- pedido registrado ---------------- */
          <div className="px-6 py-10 text-center">
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: "var(--coq-salvia)" }}
            >
              <Check size={28} color="#fff" />
            </div>

            <h2 className="script text-3xl" style={{ color: "var(--coq-terracota)" }}>
              ¡Listo!
            </h2>

            <p className="mt-3 text-sm" style={{ color: "var(--coq-espresso-2)" }}>
              Tu pedido quedó registrado con el número
            </p>
            <p className="mt-1 text-2xl font-bold tracking-wide">{resultado.numero}</p>

            <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed" style={{ color: "var(--coq-espresso-2)" }}>
              Te abrimos WhatsApp con el detalle. Si no se abrió solo, tocá el
              botón de abajo. Coquetines se va a contactar con vos para
              confirmar disponibilidad, pago y envío.
            </p>

            <button
              type="button"
              onClick={() =>
                pedirCarrito(items, { numero: resultado.numero, nombre: form.nombre })
              }
              className="mt-6 w-full rounded-full py-3.5 text-sm font-semibold text-white"
              style={{ background: "var(--coq-terracota)" }}
            >
              Abrir WhatsApp
            </button>
            <button
              type="button"
              onClick={onCerrar}
              className="mt-2 w-full py-2 text-xs underline-offset-2 hover:underline"
              style={{ color: "var(--coq-espresso-2)" }}
            >
              Cerrar
            </button>
          </div>
        ) : (
          /* ---------------- formulario ---------------- */
          <form onSubmit={enviar}>
            <header
              className="flex items-start justify-between gap-3 border-b px-6 py-5"
              style={{ borderColor: "var(--coq-linea)" }}
            >
              <div>
                <h2 id="titulo-pedido" className="text-lg font-semibold">
                  ¿Deseás generar el pedido?
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--coq-espresso-2)" }}>
                  Coquetines se va a contactar con vos para confirmar
                  disponibilidad, forma de pago y envío. Todavía no es una
                  compra: no se cobra nada ahora.
                </p>
              </div>
              <button
                type="button"
                onClick={onCerrar}
                disabled={enviando}
                className="-mr-1 shrink-0 p-1 disabled:opacity-40"
                aria-label="Cerrar"
              >
                <X size={19} />
              </button>
            </header>

            <div
              className="flex items-center justify-between px-6 py-3 text-sm"
              style={{ background: "var(--coq-crema-2)" }}
            >
              <span style={{ color: "var(--coq-espresso-2)" }}>
                {unidades} {unidades === 1 ? "prenda" : "prendas"}
              </span>
              <span className="font-semibold" style={{ color: "var(--coq-terracota-osc)" }}>
                {formatearPrecio(total)}
              </span>
            </div>

            <div className="space-y-3 px-6 py-5">
              <Campo etiqueta="Nombre y apellido" obligatorio>
                <input
                  ref={primerCampo}
                  value={form.nombre}
                  onChange={cambiar("nombre")}
                  className={claseInput}
                  style={estiloInput}
                  autoComplete="name"
                  required
                />
              </Campo>

              <Campo etiqueta="Teléfono / WhatsApp" obligatorio>
                <input
                  value={form.telefono}
                  onChange={cambiar("telefono")}
                  className={claseInput}
                  style={estiloInput}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="380 123 4567"
                  required
                />
              </Campo>

              <Campo etiqueta="Localidad" hint="(para coordinar el envío)">
                <input
                  value={form.localidad}
                  onChange={cambiar("localidad")}
                  className={claseInput}
                  style={estiloInput}
                  placeholder="La Rioja"
                />
              </Campo>

              <Campo etiqueta="Nota" hint="(opcional)">
                <textarea
                  value={form.nota}
                  onChange={cambiar("nota")}
                  rows={2}
                  className={`${claseInput} resize-none`}
                  style={estiloInput}
                  placeholder="Es para regalo, ¿lo tenés en otro talle?…"
                />
              </Campo>

              {error && (
                <div
                  className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
                  style={{ background: "#fdecea", color: "#8a3128" }}
                >
                  <AlertCircle size={15} className="mt-px shrink-0" />
                  <div>
                    <p>{error}</p>
                    <button
                      type="button"
                      onClick={() => pedirCarrito(items, { nombre: form.nombre })}
                      className="mt-1 underline underline-offset-2"
                    >
                      Escribinos igual por WhatsApp
                    </button>
                  </div>
                </div>
              )}
            </div>

            <footer
              className="flex gap-2 border-t px-6 py-4"
              style={{ borderColor: "var(--coq-linea)", background: "var(--coq-crema-2)" }}
            >
              <button
                type="button"
                onClick={onCerrar}
                disabled={enviando}
                className="flex-1 rounded-full border py-3 text-sm font-semibold disabled:opacity-40"
                style={{ borderColor: "var(--coq-linea)", color: "var(--coq-espresso-2)" }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!puedeEnviar}
                className="flex flex-[1.4] items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white disabled:opacity-45"
                style={{ background: "var(--coq-terracota)" }}
              >
                {enviando && <Loader2 size={15} className="animate-spin" />}
                {enviando ? "Generando…" : "Sí, generar pedido"}
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}
