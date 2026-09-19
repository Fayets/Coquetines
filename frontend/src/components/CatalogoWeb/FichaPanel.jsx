import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, ImagePlus, Loader2, Ruler, Trash2, X } from "lucide-react";
import Swal from "sweetalert2";
import {
  actualizarProducto,
  quitarDeGaleria,
  subirTablaTalles,
  sumarAGaleria,
  verGaleria,
} from "../../utils/catalogoAdmin";
import { urlImagen } from "../../utils/catalogo";

/**
 * Panel lateral para armar la ficha que ve la clienta.
 *
 * La descripción y la tabla de talles describen el modelo completo: el backend
 * las copia a todas las filas hermanas (mismo nombre, marca y color), así la
 * dueña no tiene que repetirlas talle por talle.
 */
export default function FichaPanel({ producto, onCerrar, onGuardado }) {
  const [descripcion, setDescripcion] = useState(producto?.descripcion_web ?? "");
  const [tabla, setTabla] = useState(producto?.tabla_talles_url ?? "");
  const [galeria, setGaleria] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const inputFoto = useRef(null);
  const inputTabla = useRef(null);

  const abierto = Boolean(producto);

  const cargar = useCallback(() => {
    if (!producto) return;
    setCargando(true);
    verGaleria(producto.id)
      .then(setGaleria)
      .catch(() => setGaleria([]))
      .finally(() => setCargando(false));
  }, [producto]);

  useEffect(() => {
    if (!abierto) return undefined;
    setDescripcion(producto.descripcion_web ?? "");
    setTabla(producto.tabla_talles_url ?? "");
    cargar();
    const onKey = (e) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto, producto, cargar, onCerrar]);

  if (!abierto) return null;

  const agregarFoto = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setSubiendo(true);
    try {
      const r = await sumarAGaleria(producto.id, archivo);
      cargar();
      onGuardado({ ...producto, imagen_url: r.imagen_url, fotos: r.fotos ?? 0 });
    } catch (err) {
      const msg = err.response?.data?.detail;
      Swal.fire("Error", typeof msg === "string" ? msg : "No se pudo subir la foto.", "error");
    } finally {
      setSubiendo(false);
    }
  };

  const quitarFoto = async (imagenId) => {
    try {
      const r = await quitarDeGaleria(producto.id, imagenId);
      setGaleria((g) => g.filter((f) => f.id !== imagenId));
      onGuardado({ ...producto, imagen_url: r.imagen_url, fotos: r.fotos ?? 0 });
    } catch {
      Swal.fire("Error", "No se pudo quitar la foto.", "error");
    }
  };

  const cargarTabla = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setSubiendo(true);
    try {
      const actualizado = await subirTablaTalles(producto.id, archivo);
      setTabla(actualizado.tabla_talles_url || "");
      onGuardado(actualizado);
      Swal.fire({
        icon: "success",
        title: "Tabla cargada",
        text: "Queda en todos los talles de este modelo.",
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (err) {
      const msg = err.response?.data?.detail;
      Swal.fire("Error", typeof msg === "string" ? msg : "No se pudo subir la tabla.", "error");
    } finally {
      setSubiendo(false);
    }
  };

  const guardarDescripcion = async () => {
    if ((descripcion ?? "") === (producto.descripcion_web ?? "")) return;
    setGuardando(true);
    try {
      const actualizado = await actualizarProducto(producto.id, {
        descripcion_web: descripcion,
      });
      onGuardado(actualizado);
    } catch {
      Swal.fire("Error", "No se pudo guardar la descripción.", "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/30" onClick={onCerrar} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Ficha de ${producto.nombre}`}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-slate-900">{producto.nombre}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {producto.codigo}
              {producto.color ? ` · ${producto.color}` : ""} · Talle {producto.talle}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Lo que cargues acá se aplica a todos los talles de este modelo.
            </p>
          </div>
          <button type="button" onClick={onCerrar} className="p-1" aria-label="Cerrar">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* ---------- galería ---------- */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Fotos</h3>
              <span className="text-xs text-slate-400">
                {galeria.length} {galeria.length === 1 ? "foto" : "fotos"}
              </span>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              La primera es la que se ve en el catálogo. Las demás aparecen en la ficha.
            </p>

            <input ref={inputFoto} type="file" accept="image/*" onChange={agregarFoto} className="hidden" />

            {cargando ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {galeria.map((foto, i) => (
                  <div key={foto.id} className="relative">
                    <img
                      src={urlImagen(foto.url)}
                      alt=""
                      className="aspect-[7/10] w-full rounded-lg object-cover"
                    />
                    {i === 0 && (
                      <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-slate-900/60 py-0.5 text-center text-[9px] font-medium text-white">
                        portada
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => quitarFoto(foto.id)}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 shadow ring-1 ring-slate-200"
                      aria-label="Quitar foto"
                    >
                      <X className="h-3 w-3 text-slate-500" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => inputFoto.current?.click()}
                  disabled={subiendo}
                  className="flex aspect-[7/10] items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 transition-colors hover:border-teal-500 hover:bg-teal-50 disabled:opacity-50"
                  title="Agregar foto"
                >
                  {subiendo ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4" />
                  )}
                </button>
              </div>
            )}
          </section>

          {/* ---------- descripción ---------- */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Descripción</h3>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              onBlur={guardarDescripcion}
              rows={4}
              maxLength={1200}
              placeholder="Tela, calce, detalles… Lo que le contarías a una clienta que pregunta."
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
            />
            <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
              <span>{guardando ? "Guardando…" : "Se guarda al salir del campo"}</span>
              <span>{descripcion.length}/1200</span>
            </div>
          </section>

          {/* ---------- tabla de talles ---------- */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <Ruler className="h-4 w-4 text-slate-400" />
              Tabla de talles
            </h3>
            <input ref={inputTabla} type="file" accept="image/*" onChange={cargarTabla} className="hidden" />

            {tabla ? (
              <div className="rounded-lg border border-slate-200 p-2">
                <img src={urlImagen(tabla)} alt="Tabla de talles" className="w-full rounded" />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => inputTabla.current?.click()}
                    className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cambiar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const actualizado = await actualizarProducto(producto.id, {
                        tabla_talles_url: "",
                      });
                      setTabla("");
                      onGuardado(actualizado);
                    }}
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputTabla.current?.click()}
                disabled={subiendo}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-6 text-sm text-slate-500 hover:border-teal-500 hover:bg-teal-50 disabled:opacity-50"
              >
                <ImagePlus className="h-4 w-4" />
                Subir la foto de la tabla
              </button>
            )}
          </section>
        </div>

        <footer className="border-t border-slate-200 px-5 py-3">
          <a
            href={`/catalogo/producto/${producto.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white no-underline hover:bg-slate-800"
          >
            <ExternalLink className="h-4 w-4" />
            Ver la ficha como la clienta
          </a>
        </footer>
      </aside>
    </>
  );
}
