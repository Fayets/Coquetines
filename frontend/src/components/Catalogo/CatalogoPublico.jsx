import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Instagram, Search, ShoppingBag, SlidersHorizontal } from "lucide-react";
import { apiUrl } from "../../utils/api";
import {
  INSTAGRAM_URL,
  WHATSAPP,
  formatearPrecio,
} from "../../utils/catalogo";
import { useCarrito } from "./useCarrito";
import ProductoCard from "./ProductoCard";
import CarritoDrawer from "./CarritoDrawer";
import { catalogoDemo, esModoDemo } from "./catalogoDemo";
import ConfirmarPedido from "./ConfirmarPedido";

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
      <div className="aspect-[4/5] animate-pulse" style={{ background: "var(--coq-arena)" }} />
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

export default function CatalogoPublico() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [talle, setTalle] = useState("todos");
  const [orden, setOrden] = useState("destacados");
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const demo = esModoDemo();

  // La barra de filtros se pega justo debajo del encabezado; medimos su alto
  // real para que no queden solapados si cambia el padding.
  const headerRef = useRef(null);
  const [altoHeader, setAltoHeader] = useState(65);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;
    const medir = () => setAltoHeader(el.getBoundingClientRect().height);
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const carrito = useCarrito();
  const { sincronizar } = carrito;

  useEffect(() => {
    document.title = "Coquetines Indumentaria | Catálogo";

    // Vista de maqueta (?demo=1): productos de muestra con fotos, para
    // mostrarle el catálogo a la clienta antes de cargar imágenes reales.
    if (demo) {
      const muestra = catalogoDemo();
      setDatos(muestra);
      sincronizar(muestra.productos);
      setCargando(false);
      return undefined;
    }

    let vivo = true;
    (async () => {
      try {
        const res = await fetch(apiUrl("/catalogo/productos"));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!vivo) return;
        setDatos(json);
        sincronizar(json.productos);
      } catch (e) {
        if (vivo) setError(e.message || "No pudimos cargar el catálogo");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [sincronizar, demo]);

  const productos = useMemo(() => datos?.productos ?? [], [datos]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    let lista = productos.filter((p) => {
      if (categoria !== "todas" && p.categoria !== categoria) return false;
      if (talle !== "todos" && p.talle !== talle) return false;
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

  const idsEnCarrito = useMemo(
    () => new Set(carrito.items.map((i) => i.id)),
    [carrito.items]
  );

  const hayFiltros = categoria !== "todas" || talle !== "todos" || busqueda.trim() !== "";

  const limpiarFiltros = () => {
    setCategoria("todas");
    setTalle("todos");
    setBusqueda("");
  };

  return (
    <div className="catalogo min-h-screen">
      {/* Barra de anuncio */}
      <div
        className="px-4 py-2 text-center text-[11px] font-medium tracking-wide"
        style={{ background: "var(--coq-espresso)", color: "var(--coq-crema)" }}
      >
        Envíos a todo el país
        <span className="hidden sm:inline"> · Retiro en La Rioja</span> · Pedidos
        por WhatsApp
      </div>

      {/* Encabezado */}
      <header
        ref={headerRef}
        className="sticky top-0 z-30 border-b backdrop-blur-md"
        style={{ borderColor: "var(--coq-linea)", background: "rgba(251,246,240,.9)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="script text-2xl"
            style={{ color: "var(--coq-terracota)" }}
          >
            Coquetines
          </button>

          <div className="flex items-center gap-1">
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-10 w-10 items-center justify-center rounded-full sm:flex"
              style={{ color: "var(--coq-espresso-2)" }}
              aria-label="Instagram de Coquetines"
            >
              <Instagram size={19} />
            </a>

            <button
              type="button"
              onClick={() => setCarritoAbierto(true)}
              className="relative flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold text-white"
              style={{ background: "var(--coq-espresso)" }}
            >
              <ShoppingBag size={16} />
              <span className="hidden sm:inline">Mi pedido</span>
              {carrito.unidades > 0 && (
                <span
                  className="flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold"
                  style={{ background: "var(--coq-terracota)" }}
                >
                  {carrito.unidades}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

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
                    onAgregar={(prod) => {
                      carrito.agregar(prod);
                      setCarritoAbierto(true);
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Pie */}
      <footer className="border-t" style={{ borderColor: "var(--coq-linea)", background: "var(--coq-crema-2)" }}>
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-4 py-10 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <p className="script text-2xl" style={{ color: "var(--coq-terracota)" }}>
              Coquetines
            </p>
            <p className="mt-2 text-xs" style={{ color: "var(--coq-espresso-2)" }}>
              Indumentaria · La Rioja, Argentina
            </p>
          </div>

          <div className="text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--coq-espresso-2)" }}>
              Rubros
            </p>
            <ul className="space-y-1" style={{ color: "var(--coq-espresso-2)" }}>
              <li>Bebés</li>
              <li>Niños y niñas</li>
              <li>Pre-teens</li>
            </ul>
          </div>

          <div className="text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--coq-espresso-2)" }}>
              Contacto
            </p>
            <a
              href={`https://wa.me/${WHATSAPP}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block hover:underline"
              style={{ color: "var(--coq-espresso-2)" }}
            >
              WhatsApp
            </a>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block hover:underline"
              style={{ color: "var(--coq-espresso-2)" }}
            >
              @coquetineslr
            </a>
          </div>
        </div>

        <p className="pb-8 text-center text-[11px]" style={{ color: "var(--coq-espresso-2)" }}>
          Los precios pueden variar. Confirmamos disponibilidad y valor final por WhatsApp.
        </p>
      </footer>

      {/* Barra flotante de pedido (móvil) */}
      {carrito.unidades > 0 && !carritoAbierto && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3 sm:hidden">
          <button
            type="button"
            onClick={() => setCarritoAbierto(true)}
            className="flex w-full items-center justify-between rounded-full px-5 py-3.5 text-sm font-semibold text-white shadow-lg"
            style={{ background: "var(--coq-espresso)" }}
          >
            <span>
              Ver pedido ({carrito.unidades})
            </span>
            <span>{formatearPrecio(carrito.total)}</span>
          </button>
        </div>
      )}

      {/* WhatsApp flotante (escritorio) */}
      <button
        type="button"
        onClick={() =>
          carrito.items.length
            ? setConfirmando(true)
            : window.open(`https://wa.me/${WHATSAPP}`, "_blank", "noopener,noreferrer")
        }
        className={`fixed bottom-6 right-6 z-30 h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 sm:flex ${
          carrito.unidades > 0 ? "hidden" : "flex"
        }`}
        style={{ background: "#25D366" }}
        aria-label="Escribir por WhatsApp"
      >
        <svg width="27" height="27" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.16c-.25.69-1.44 1.32-1.99 1.4-.53.08-1.19.11-1.92-.12-.44-.14-1.01-.33-1.74-.65-3.06-1.32-5.06-4.4-5.21-4.61-.15-.2-1.25-1.66-1.25-3.17s.79-2.25 1.07-2.56c.28-.31.61-.38.81-.38h.58c.19 0 .44-.07.69.53.25.6.86 2.11.94 2.26.08.15.13.33.03.53-.1.2-.15.33-.3.5-.15.18-.31.39-.45.53-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.03 1.12 1 2.06 1.31 2.36 1.46.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.28.1 1.76.83 2.06.98.3.15.5.23.57.35.08.13.08.73-.17 1.42Z" />
        </svg>
      </button>

      <CarritoDrawer
        abierto={carritoAbierto}
        onCerrar={() => setCarritoAbierto(false)}
        items={carrito.items}
        total={carrito.total}
        unidades={carrito.unidades}
        onCantidad={carrito.cambiarCantidad}
        onQuitar={carrito.quitar}
        onVaciar={carrito.vaciar}
        onGenerarPedido={() => setConfirmando(true)}
      />

      <ConfirmarPedido
        abierto={confirmando}
        onCerrar={() => setConfirmando(false)}
        items={carrito.items}
        total={carrito.total}
        unidades={carrito.unidades}
        demo={demo}
        onListo={() => {
          // El pedido ya está en el sistema: vaciamos para que no se mande dos veces.
          carrito.vaciar();
          setCarritoAbierto(false);
        }}
      />
    </div>
  );
}
