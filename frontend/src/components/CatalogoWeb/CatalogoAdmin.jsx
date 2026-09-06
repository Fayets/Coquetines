import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ImagePlus,
  Loader2,
  Search,
  X,
} from "lucide-react";
import Swal from "sweetalert2";
import useAuth from "../Hooks/useAuth";
import {
  actualizarProducto,
  borrarImagen,
  listarCatalogo,
  subirImagen,
} from "../../utils/catalogoAdmin";
import { urlImagen } from "../../utils/catalogo";
import { formatPrecio } from "../../utils/tiendaWebPrecios";

/** Celda de foto: click para subir, con vista previa y borrado. */
function CeldaFoto({ producto, onCambio }) {
  const input = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const foto = urlImagen(producto.imagen_url);

  const elegir = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setSubiendo(true);
    try {
      const r = await subirImagen(producto.id, archivo);
      onCambio({ ...producto, imagen_url: r.imagen_url });
    } catch (err) {
      const msg = err.response?.data?.detail;
      Swal.fire("Error", typeof msg === "string" ? msg : "No se pudo subir la foto.", "error");
    } finally {
      setSubiendo(false);
    }
  };

  const quitar = async () => {
    const { isConfirmed } = await Swal.fire({
      title: "¿Quitar la foto?",
      text: "El producto vuelve a mostrarse sin imagen en el catálogo.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Quitar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626",
    });
    if (!isConfirmed) return;
    try {
      await borrarImagen(producto.id);
      onCambio({ ...producto, imagen_url: "" });
    } catch {
      Swal.fire("Error", "No se pudo quitar la foto.", "error");
    }
  };

  return (
    <div className="relative">
      <input ref={input} type="file" accept="image/*" onChange={elegir} className="hidden" />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={subiendo}
        className="group relative flex h-16 w-14 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 transition-colors hover:border-teal-500 hover:bg-teal-50"
        title={foto ? "Cambiar foto" : "Subir foto"}
      >
        {subiendo ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        ) : foto ? (
          <>
            <img src={foto} alt="" className="h-full w-full object-cover" />
            <span className="absolute inset-0 hidden items-center justify-center bg-slate-900/50 group-hover:flex">
              <ImagePlus className="h-4 w-4 text-white" />
            </span>
          </>
        ) : (
          <ImagePlus className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {foto && !subiendo && (
        <button
          type="button"
          onClick={quitar}
          className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 shadow ring-1 ring-slate-200"
          title="Quitar foto"
        >
          <X className="h-3 w-3 text-slate-500" />
        </button>
      )}
    </div>
  );
}

/** Precio web editable; vacío = usa el precio de lista. */
function CeldaPrecio({ producto, onCambio }) {
  const [valor, setValor] = useState(producto.precio_web ? String(producto.precio_web) : "");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setValor(producto.precio_web ? String(producto.precio_web) : "");
  }, [producto.precio_web]);

  const guardar = async () => {
    const nuevo = valor.trim() === "" ? 0 : Number(valor);
    if (!Number.isFinite(nuevo) || nuevo < 0) {
      setValor(producto.precio_web ? String(producto.precio_web) : "");
      return;
    }
    if (nuevo === Number(producto.precio_web || 0)) return;
    setGuardando(true);
    try {
      const actualizado = await actualizarProducto(producto.id, { precio_web: nuevo });
      onCambio(actualizado);
    } catch {
      Swal.fire("Error", "No se pudo guardar el precio.", "error");
      setValor(producto.precio_web ? String(producto.precio_web) : "");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-slate-400">$</span>
      <input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        inputMode="decimal"
        placeholder={String(producto.precio_venta)}
        className="w-24 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-teal-500"
      />
      {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
    </div>
  );
}

/**
 * Switch de publicación con estado propio.
 *
 * Vive acá y no en el arreglo del padre a propósito: cuando dependía del merge
 * de la lista, dos clicks seguidos sobre la misma fila mostraban el valor
 * anterior hasta el render siguiente. Con estado local el switch responde al
 * toque y solo se sincroniza cuando el servidor confirma o falla.
 */
function CeldaPublicado({ producto, onCambio }) {
  const [publicado, setPublicado] = useState(Boolean(producto.publicado_web));
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setPublicado(Boolean(producto.publicado_web));
  }, [producto.publicado_web]);

  const alternar = async () => {
    if (guardando) return;
    const nuevo = !publicado;
    setPublicado(nuevo);
    setGuardando(true);
    try {
      const actualizado = await actualizarProducto(producto.id, { publicado_web: nuevo });
      setPublicado(Boolean(actualizado.publicado_web));
      onCambio(actualizado);
    } catch {
      setPublicado(!nuevo);
      Swal.fire("Error", "No se pudo cambiar la publicación.", "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={alternar}
        aria-pressed={publicado}
        title={
          producto.stock <= 0 ? "Sin stock no se muestra aunque esté publicado" : ""
        }
        className={`inline-flex h-7 w-12 items-center rounded-full px-0.5 transition-colors ${
          publicado ? "bg-teal-600" : "bg-slate-200"
        }`}
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full bg-white shadow transition-transform ${
            publicado ? "translate-x-5" : ""
          }`}
        >
          {publicado && <Check className="h-3 w-3 text-teal-600" />}
        </span>
      </button>
      {publicado && producto.stock <= 0 && (
        <p className="mt-1 text-[10px] text-amber-600">sin stock</p>
      )}
    </>
  );
}

export default function CatalogoAdmin() {
  const isAuthenticated = useAuth();
  const [datos, setDatos] = useState({ productos: [], total: 0, publicados: 0, pagina: 1, paginas: 1 });
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplicada, setBusquedaAplicada] = useState("");
  const [soloPublicados, setSoloPublicados] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  // Cada listado lleva número: si vuelve uno viejo (pedido antes de que la
  // dueña tocara un switch), se descarta en vez de pisar el cambio.
  const peticion = useRef(0);

  const cargar = useCallback(() => {
    const mia = ++peticion.current;
    setCargando(true);
    setError("");
    listarCatalogo({ busqueda: busquedaAplicada, soloPublicados, pagina, limite: 20 })
      .then((d) => {
        if (mia === peticion.current) setDatos(d);
      })
      .catch((err) => {
        if (mia !== peticion.current) return;
        const msg = err.response?.data?.detail;
        setError(typeof msg === "string" ? msg : "No se pudo cargar el catálogo.");
      })
      .finally(() => {
        if (mia === peticion.current) setCargando(false);
      });
  }, [busquedaAplicada, soloPublicados, pagina]);

  useEffect(() => {
    if (isAuthenticated) cargar();
  }, [isAuthenticated, cargar]);

  // Buscar con una pausa, para no pegarle a la API en cada tecla. En el primer
  // render se saltea: si no, la pantalla pedía el listado dos veces al entrar.
  const primerRender = useRef(true);
  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      return undefined;
    }
    const t = setTimeout(() => {
      setBusquedaAplicada(busqueda);
      setPagina(1);
    }, 350);
    return () => clearTimeout(t);
  }, [busqueda]);

  const reemplazar = (actualizado) =>
    setDatos((d) => ({
      ...d,
      productos: d.productos.map((p) =>
        p.id === actualizado.id ? { ...p, ...actualizado } : p
      ),
    }));

  if (!isAuthenticated) return null;

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Catálogo web</h1>
          <p className="mt-1 text-sm text-slate-500">
            Elegí qué productos se ven en la web, subiles una foto y poneles
            precio. Publicar no mueve stock: solo los muestra.
          </p>
        </div>
        <a
          href="/catalogo"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 no-underline hover:bg-slate-50"
        >
          <ExternalLink className="h-4 w-4" />
          Ver el catálogo
        </a>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por código, nombre o marca…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-500"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            setSoloPublicados((v) => !v);
            setPagina(1);
          }}
          className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
            soloPublicados
              ? "border-teal-600 bg-teal-600 text-white"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Solo publicados ({datos.publicados})
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Foto</th>
              <th className="px-4 py-3 text-left font-semibold">Producto</th>
              <th className="px-4 py-3 text-left font-semibold">Sucursal</th>
              <th className="px-4 py-3 text-center font-semibold">Stock</th>
              <th className="px-4 py-3 text-right font-semibold">Lista</th>
              <th className="px-4 py-3 text-left font-semibold">Precio web</th>
              <th className="px-4 py-3 text-center font-semibold">En la web</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-slate-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : datos.productos.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-sm text-slate-500">
                  No hay productos con ese filtro.
                </td>
              </tr>
            ) : (
              datos.productos.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <CeldaFoto producto={p} onCambio={reemplazar} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{p.nombre}</p>
                    <p className="text-xs text-slate-400">
                      {p.codigo}
                      {p.talle ? ` · Talle ${p.talle}` : ""}
                      {p.color ? ` · ${p.color}` : ""}
                      {p.marca ? ` · ${p.marca}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{p.sucursal}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={p.stock > 0 ? "text-slate-700" : "font-medium text-red-500"}>
                      {p.stock}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">
                    {formatPrecio(p.precio_venta)}
                  </td>
                  <td className="px-4 py-3">
                    <CeldaPrecio producto={p} onCambio={reemplazar} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <CeldaPublicado
                      producto={p}
                      onCambio={(actualizado) => {
                        reemplazar(actualizado);
                        // El total lo manda el servidor: contarlo acá se desfasaba.
                        if (typeof actualizado.publicados === "number") {
                          setDatos((d) => ({ ...d, publicados: actualizado.publicados }));
                        }
                      }}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>
          {datos.total} productos · {datos.publicados} en la web
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => p - 1)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </button>
          <span>
            Página {datos.pagina} de {datos.paginas}
          </span>
          <button
            type="button"
            disabled={pagina >= datos.paginas}
            onClick={() => setPagina((p) => p + 1)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
          >
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
