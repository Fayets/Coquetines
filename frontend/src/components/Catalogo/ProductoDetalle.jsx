import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { ArrowLeft, Check, Loader2, Ruler, ShoppingBag, X } from "lucide-react";
import { apiUrl } from "../../utils/api";
import {
  coloresDeProducto,
  formatearPrecio,
  monograma,
  urlImagen,
} from "../../utils/catalogo";

/** Lightbox de la tabla de talles. */
function TablaTalles({ url, onCerrar }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#453730cc]" onClick={onCerrar} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tabla de talles"
        className="relative max-h-full w-full max-w-lg overflow-auto rounded-2xl p-4"
        style={{ background: "var(--coq-crema)" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Tabla de talles</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-1">
            <X size={18} />
          </button>
        </div>
        <img src={urlImagen(url)} alt="Tabla de talles" className="w-full rounded-xl" />
      </div>
    </div>
  );
}

/** Tarjeta chica para la fila de relacionados. */
function Relacionado({ producto }) {
  const [claro, oscuro] = coloresDeProducto(producto);
  const foto = urlImagen(producto.imagen);
  return (
    <Link
      to={`/catalogo/producto/${producto.id}`}
      className="group block w-40 shrink-0 no-underline sm:w-44"
    >
      <div
        className="mb-2 aspect-[7/10] overflow-hidden rounded-xl"
        style={{ background: `linear-gradient(150deg, ${claro} 0%, ${oscuro} 100%)` }}
      >
        {foto ? (
          <img
            src={foto}
            alt={producto.nombre}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="script text-3xl" style={{ color: "rgba(255,255,255,.85)" }}>
              {monograma(producto)}
            </span>
          </div>
        )}
      </div>
      <p className="truncate text-[13px] font-medium" style={{ color: "var(--coq-espresso)" }}>
        {producto.nombre}
      </p>
      <p className="text-sm font-semibold" style={{ color: "var(--coq-terracota-osc)" }}>
        {formatearPrecio(producto.precio)}
      </p>
    </Link>
  );
}

export default function ProductoDetalle() {
  const { id } = useParams();
  // El carrito vive en el layout del catálogo.
  const { agregarAlPedido } = useOutletContext();
  const navigate = useNavigate();
  const [ficha, setFicha] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [fotoActiva, setFotoActiva] = useState(0);
  const [talleElegido, setTalleElegido] = useState(null);
  const [verTabla, setVerTabla] = useState(false);
  const [agregado, setAgregado] = useState(false);
  // Sin esto, agregar dos talles seguidos apaga el cartel antes de tiempo:
  // el temporizador del primero le gana al del segundo.
  const avisoRef = useRef(null);
  useEffect(() => () => clearTimeout(avisoRef.current), []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/catalogo/producto/${id}`));
      if (!res.ok) throw new Error(res.status === 404 ? "no-existe" : "error");
      const datos = await res.json();
      setFicha(datos);
      setFotoActiva(0);
      // Preseleccionamos si hay un solo talle disponible: un click menos.
      const conStock = datos.variantes.filter((v) => v.disponible);
      setTalleElegido(conStock.length === 1 ? conStock[0].talle : null);
      document.title = `${datos.nombre} | Coquetines`;
    } catch (e) {
      setError(e.message === "no-existe" ? "no-existe" : "error");
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    cargar();
    window.scrollTo(0, 0);
  }, [cargar]);

  const variante = useMemo(
    () => ficha?.variantes.find((v) => v.talle === talleElegido) ?? null,
    [ficha, talleElegido]
  );

  const precioMostrado = useMemo(() => {
    if (!ficha) return 0;
    if (variante) return variante.precio;
    const precios = ficha.variantes.map((v) => v.precio);
    return precios.length ? Math.min(...precios) : 0;
  }, [ficha, variante]);

  const sumar = () => {
    if (!variante) return;
    agregarAlPedido({
      id: variante.id,
      codigo: variante.codigo,
      nombre: ficha.nombre,
      marca: ficha.marca,
      talle: variante.talle,
      color: ficha.color,
      precio: variante.precio,
      stock: variante.stock,
      imagen: ficha.galeria[0] ?? null,
    });
    setAgregado(true);
    clearTimeout(avisoRef.current);
    avisoRef.current = setTimeout(() => setAgregado(false), 2000);
  };

  if (cargando) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--coq-terracota)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="script text-3xl" style={{ color: "var(--coq-terracota)" }}>
          {error === "no-existe" ? "No encontramos esta prenda" : "Algo salió mal"}
        </p>
        <p className="mt-3 text-sm" style={{ color: "var(--coq-espresso-2)" }}>
          {error === "no-existe"
            ? "Puede que se haya agotado o que ya no esté publicada."
            : "Probá de nuevo en un momento."}
        </p>
        <button
          type="button"
          onClick={() => navigate("/catalogo")}
          className="mt-6 rounded-full px-6 py-3 text-sm font-semibold text-white"
          style={{ background: "var(--coq-espresso)" }}
        >
          Volver al catálogo
        </button>
      </div>
    );
  }

  const [claro, oscuro] = coloresDeProducto({ color: ficha.color, codigo: ficha.id });
  const sinStock = ficha.variantes.every((v) => !v.disponible);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link
        to="/catalogo"
        className="mb-5 inline-flex items-center gap-1.5 text-sm no-underline"
        style={{ color: "var(--coq-espresso-2)" }}
      >
        <ArrowLeft size={15} />
        Volver al catálogo
      </Link>

      <div className="grid gap-8 md:grid-cols-2">
        {/* ---------------- galería ---------------- */}
        <div>
          <div
            className="overflow-hidden rounded-2xl"
            style={{ background: `linear-gradient(150deg, ${claro} 0%, ${oscuro} 100%)` }}
          >
            {ficha.galeria.length > 0 ? (
              <img
                src={urlImagen(ficha.galeria[fotoActiva])}
                alt={ficha.nombre}
                className="aspect-[7/10] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[7/10] items-center justify-center">
                <span className="script text-6xl" style={{ color: "rgba(255,255,255,.85)" }}>
                  {monograma(ficha)}
                </span>
              </div>
            )}
          </div>

          {ficha.galeria.length > 1 && (
            <div className="sin-scrollbar mt-3 flex gap-2 overflow-x-auto">
              {ficha.galeria.map((foto, i) => (
                <button
                  key={foto}
                  type="button"
                  onClick={() => setFotoActiva(i)}
                  className="h-20 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors"
                  style={{
                    borderColor:
                      i === fotoActiva ? "var(--coq-terracota)" : "var(--coq-linea)",
                  }}
                  aria-label={`Ver foto ${i + 1}`}
                >
                  <img src={urlImagen(foto)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ---------------- datos y compra ---------------- */}
        <div>
          {ficha.marca && ficha.marca.toLowerCase() !== "generico" && (
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: "var(--coq-espresso-2)" }}
            >
              {ficha.marca}
            </p>
          )}
          <h1 className="mt-1 text-2xl font-semibold leading-tight sm:text-3xl">
            {ficha.nombre}
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--coq-espresso-2)" }}>
            {[ficha.color, ficha.categoria].filter(Boolean).join(" · ")}
          </p>

          <p
            className="mt-4 text-3xl font-semibold"
            style={{ color: "var(--coq-terracota-osc)" }}
          >
            {formatearPrecio(precioMostrado)}
          </p>

          {/* talles */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Talle</span>
              {ficha.tabla_talles && (
                <button
                  type="button"
                  onClick={() => setVerTabla(true)}
                  className="inline-flex items-center gap-1.5 text-xs underline underline-offset-2"
                  style={{ color: "var(--coq-terracota)" }}
                >
                  <Ruler size={13} />
                  Ver tabla de talles
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {ficha.variantes.map((v) => {
                const activo = v.talle === talleElegido;
                return (
                  <button
                    key={v.id}
                    type="button"
                    disabled={!v.disponible}
                    onClick={() => setTalleElegido(v.talle)}
                    title={v.disponible ? `${v.stock} disponibles` : "Sin stock"}
                    className="min-w-12 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors disabled:line-through disabled:opacity-40"
                    style={{
                      borderColor: activo ? "var(--coq-espresso)" : "var(--coq-linea)",
                      background: activo ? "var(--coq-espresso)" : "#fff",
                      color: activo ? "#fff" : "var(--coq-espresso)",
                    }}
                  >
                    {v.talle || "Único"}
                  </button>
                );
              })}
            </div>

            {variante && variante.stock <= 3 && (
              <p className="mt-2 text-xs" style={{ color: "var(--coq-terracota)" }}>
                {variante.stock === 1
                  ? "Última unidad en este talle"
                  : `Quedan ${variante.stock} en este talle`}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={sumar}
            disabled={!variante || sinStock}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full py-4 text-sm font-semibold text-white transition-colors disabled:opacity-45"
            style={{ background: agregado ? "var(--coq-salvia)" : "var(--coq-espresso)" }}
          >
            {agregado ? <Check size={17} /> : <ShoppingBag size={17} />}
            {sinStock
              ? "Sin stock"
              : agregado
              ? "Agregado a tu pedido"
              : variante
              ? "Agregar al pedido"
              : "Elegí un talle"}
          </button>

          {ficha.descripcion && (
            <div
              className="mt-7 border-t pt-5"
              style={{ borderColor: "var(--coq-linea)" }}
            >
              <h2 className="mb-2 text-sm font-semibold">Descripción</h2>
              <p
                className="whitespace-pre-line text-sm leading-relaxed"
                style={{ color: "var(--coq-espresso-2)" }}
              >
                {ficha.descripcion}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ---------------- relacionados ---------------- */}
      {ficha.relacionados.length > 0 && (
        <section className="mt-14 border-t pt-8" style={{ borderColor: "var(--coq-linea)" }}>
          <h2 className="script mb-4 text-2xl" style={{ color: "var(--coq-terracota)" }}>
            También te puede gustar
          </h2>
          <div className="sin-scrollbar flex gap-4 overflow-x-auto pb-2">
            {ficha.relacionados.map((r) => (
              <Relacionado key={r.id} producto={r} />
            ))}
          </div>
        </section>
      )}

      {verTabla && ficha.tabla_talles && (
        <TablaTalles url={ficha.tabla_talles} onCerrar={() => setVerTabla(false)} />
      )}
    </div>
  );
}
