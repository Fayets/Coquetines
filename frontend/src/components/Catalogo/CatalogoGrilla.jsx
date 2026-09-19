import { useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { Search, SlidersHorizontal } from "lucide-react";
import { WHATSAPP } from "../../utils/catalogo";
import ProductoCard from "./ProductoCard";

const ORDENES = [
  { valor: "destacados", etiqueta: "Sugeridos" },
  { valor: "precio-asc", etiqueta: "Menor precio" },
  { valor: "precio-desc", etiqueta: "Mayor precio" },
  { valor: "nombre", etiqueta: "A – Z" },
];

/** Arco pastel del isologo, en grande, para el encabezado. */
function ArcoHero() {
  const bandas = [
    { r: 46, c: "var(--coq-durazno)" },
    { r: 37, c: "var(--coq-terracota)" },
    { r: 28, c: "var(--coq-rosa)" },
    { r: 19, c: "var(--coq-salvia)" },
  ];
  return (
    <svg viewBox="0 0 100 56" className="h-12 w-20 shrink-0 sm:h-14 sm:w-24" fill="none" aria-hidden="true">
      {bandas.map((b, i) => (
        <path
          key={i}
          d={`M ${50 - b.r} 52 A ${b.r} ${b.r} 0 0 1 ${50 + b.r} 52`}
          stroke={b.c}
          strokeWidth="7"
          strokeLinecap="round"
        />
      ))}
      <path
        d="M50 44c-2.4-2.6-5.6-4.2-5.6-7 0-1.7 1.3-3 3-3 1.2 0 2.1.6 2.6 1.5.5-.9 1.4-1.5 2.6-1.5 1.7 0 3 1.3 3 3 0 2.8-3.2 4.4-5.6 7Z"
        fill="var(--coq-salvia)"
      />
    </svg>
  );
}

function Skeleton() {
  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{ borderColor: "var(--coq-linea)", background: "#fff" }}
    >
      <div className="aspect-[7/10] animate-pulse" style={{ background: "var(--coq-arena)" }} />
      <div className="space-y-2 p-4">
        <div className="h-3 w-2/3 animate-pulse rounded" style={{ background: "var(--coq-arena)" }} />
        <div className="h-3 w-1/3 animate-pulse rounded" style={{ background: "var(--coq-arena)" }} />
      </div>
    </div>
  );
}

function Chip({ activo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-medium transition-colors"
      style={{
        borderColor: activo ? "var(--coq-espresso)" : "var(--coq-linea)",
        background: activo ? "var(--coq-espresso)" : "transparent",
        color: activo ? "#fff" : "var(--coq-espresso-2)",
      }}
    >
      {children}
    </button>
  );
}

/** Vidriera: hero, filtros y grilla de modelos. */
export default function CatalogoGrilla() {
  const {
    datos,
    productos,
    cargando,
    error,
    busqueda,
    setBusqueda,
    categoria,
    setCategoria,
    talle,
    setTalle,
    orden,
    setOrden,
    agregarAlPedido,
    idsEnCarrito,
    altoHeader,
  } = useOutletContext();

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    let lista = productos.filter((p) => {
      if (categoria !== "todas" && p.categoria !== categoria) return false;
      if (talle !== "todos" && !(p.talles || []).includes(talle)) return false;
      if (!q) return true;
      return [p.nombre, p.marca, p.color, p.categoria, p.codigo]
        .filter(Boolean)
        .some((campo) => campo.toLowerCase().includes(q));
    });

    lista = [...lista];
    if (orden === "precio-asc") lista.sort((a, b) => a.precio - b.precio);
    else if (orden === "precio-desc") lista.sort((a, b) => b.precio - a.precio);
    else if (orden === "nombre") lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    else lista.sort((a, b) => a.stock - b.stock || a.nombre.localeCompare(b.nombre, "es"));
    return lista;
  }, [productos, busqueda, categoria, talle, orden]);

  const hayFiltros = categoria !== "todas" || talle !== "todos" || busqueda.trim() !== "";

  const limpiarFiltros = () => {
    setCategoria("todas");
    setTalle("todos");
    setBusqueda("");
  };

  return (
    <>
    {/* Hero: banda compacta. Esta página es un catálogo, no una home de
        marca — quien llega desde Instagram viene a ver prendas y precios,
        así que el saludo tiene que caber junto a la primera fila. */}
    <section className="relative overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, var(--coq-crema-2) 0%, var(--coq-crema) 70%)",
        }}
      />
      <div className="relative mx-auto flex max-w-5xl items-center gap-3 px-4 py-5 text-left sm:gap-6 sm:py-7">
        <ArcoHero />

        <div className="min-w-0 flex-1">
          <h1 className="script text-3xl leading-tight sm:text-4xl" style={{ color: "var(--coq-terracota)" }}>
            Delicadeza en cada detalle
          </h1>
          <p className="mt-0.5 text-xs leading-relaxed sm:text-sm" style={{ color: "var(--coq-espresso-2)" }}>
            Indumentaria para bebés, niños y pre-teens. Armá tu pedido y lo
            cerramos por WhatsApp.
          </p>
        </div>

        <a
          href={`https://wa.me/${WHATSAPP}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden shrink-0 rounded-full border px-5 py-2.5 text-xs font-semibold sm:block"
          style={{ borderColor: "var(--coq-terracota)", color: "var(--coq-terracota)" }}
        >
          Escribinos
        </a>
      </div>
    </section>

    {/* Filtros */}
    <div
      id="catalogo"
      className="sticky z-20 border-y backdrop-blur-md"
      style={{
        top: `${altoHeader}px`,
        borderColor: "var(--coq-linea)",
        background: "rgba(251,246,240,.92)",
      }}
    >
      <div className="mx-auto max-w-6xl px-4 py-3">
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
            style={{ color: "var(--coq-espresso-2)" }}
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, color o marca…"
            className="w-full rounded-full border py-2.5 pl-10 pr-4 text-sm outline-none"
            style={{ borderColor: "var(--coq-linea)", background: "#fff" }}
            aria-label="Buscar productos"
          />
        </div>

        {/* Selects y categorías comparten fila: apilados comían media
            pantalla de celular antes de la primera prenda. */}
        <div className="sin-scrollbar mt-2.5 flex items-center gap-2 overflow-x-auto pb-0.5">
          <SlidersHorizontal size={15} className="shrink-0" style={{ color: "var(--coq-espresso-2)" }} />

          <select
            value={talle}
            onChange={(e) => setTalle(e.target.value)}
            className="shrink-0 rounded-full border px-3 py-2 text-xs outline-none"
            style={{ borderColor: "var(--coq-linea)", background: "#fff" }}
            aria-label="Filtrar por talle"
          >
            <option value="todos">Todos los talles</option>
            {(datos?.talles ?? []).map((t) => (
              <option key={t} value={t}>
                Talle {t}
              </option>
            ))}
          </select>

          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value)}
            className="shrink-0 rounded-full border px-3 py-2 text-xs outline-none"
            style={{ borderColor: "var(--coq-linea)", background: "#fff" }}
            aria-label="Ordenar"
          >
            {ORDENES.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </select>

          {(datos?.categorias ?? []).length > 0 && (
            <>
              <span
                className="mx-1 h-5 w-px shrink-0"
                style={{ background: "var(--coq-linea)" }}
                aria-hidden="true"
              />
              <Chip activo={categoria === "todas"} onClick={() => setCategoria("todas")}>
                Todo
              </Chip>
              {datos.categorias.map((c) => (
                <Chip key={c} activo={categoria === c} onClick={() => setCategoria(c)}>
                  {c}
                </Chip>
              ))}
            </>
          )}
        </div>
      </div>
    </div>

    {/* Grilla */}
    <main className="mx-auto max-w-6xl px-4 py-8">
      {cargando && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} />
          ))}
        </div>
      )}

      {!cargando && error && (
        <div className="py-20 text-center">
          <p className="text-sm" style={{ color: "var(--coq-espresso-2)" }}>
            No pudimos cargar el catálogo en este momento.
          </p>
          <a
            href={`https://wa.me/${WHATSAPP}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block rounded-full px-6 py-3 text-sm font-semibold text-white"
            style={{ background: "var(--coq-terracota)" }}
          >
            Consultanos por WhatsApp
          </a>
        </div>
      )}

      {!cargando && !error && productos.length === 0 && (
        <div className="py-20 text-center">
          <p className="script text-2xl" style={{ color: "var(--coq-terracota)" }}>
            Estamos cargando novedades
          </p>
          <p className="mx-auto mt-3 max-w-sm text-sm" style={{ color: "var(--coq-espresso-2)" }}>
            En un ratito vas a ver acá las prendas disponibles. Mientras tanto,
            escribinos y te contamos qué tenemos.
          </p>
        </div>
      )}

      {!cargando && !error && productos.length > 0 && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs" style={{ color: "var(--coq-espresso-2)" }}>
              {visibles.length} {visibles.length === 1 ? "resultado" : "resultados"}
              <span className="hidden sm:inline"> · precios actualizados desde nuestro stock</span>
            </p>
            {hayFiltros && (
              <button
                type="button"
                onClick={limpiarFiltros}
                className="text-xs underline underline-offset-2"
                style={{ color: "var(--coq-terracota)" }}
              >
                Limpiar filtros
              </button>
            )}
          </div>

          {visibles.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm" style={{ color: "var(--coq-espresso-2)" }}>
                No encontramos prendas con esos filtros.
              </p>
              <button
                type="button"
                onClick={limpiarFiltros}
                className="mt-4 rounded-full border px-5 py-2.5 text-xs font-semibold"
                style={{ borderColor: "var(--coq-terracota)", color: "var(--coq-terracota)" }}
              >
                Ver todo el catálogo
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {visibles.map((p, i) => (
                <ProductoCard
                  key={p.id}
                  producto={p}
                  indice={i}
                  enCarrito={idsEnCarrito.has(p.id)}
                  onAgregar={agregarAlPedido}
                />
              ))}
            </div>
          )}
        </>
      )}
    </main>
    </>
  );
}
