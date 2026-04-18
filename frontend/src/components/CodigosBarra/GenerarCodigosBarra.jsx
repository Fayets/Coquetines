import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { getToken, getUser } from "../../utils/sucursal";
import { API_URL as baseUrl } from "../../utils/api";
import { getSucursalId } from "../../utils/sucursal";
import Swal from "sweetalert2";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Printer,
  Package,
  Barcode,
  Loader2,
  X,
} from "lucide-react";

export default function GenerarCodigosBarra() {
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [seleccionados, setSeleccionados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);
  const searchRef = useRef(null);
  const scanTimerRef = useRef(null);

  const token = getToken();
  const user = getUser();

  useEffect(() => {
    fetchProductos();
  }, []);

  // Mantener el foco en el buscador para la lectora de códigos de barra
  useEffect(() => {
    if (searchRef.current) searchRef.current.focus();

    const refocus = () => {
      setTimeout(() => {
        if (
          searchRef.current &&
          document.activeElement?.tagName !== "INPUT" &&
          document.activeElement?.tagName !== "TEXTAREA"
        ) {
          searchRef.current.focus();
        }
      }, 50);
    };

    document.addEventListener("click", refocus);
    return () => document.removeEventListener("click", refocus);
  }, []);

  // Debounce: esperar 300ms después del último carácter para detectar lectura completa
  useEffect(() => {
    if (!busqueda) return;

    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);

    scanTimerRef.current = setTimeout(() => {
      const texto = busqueda.trim();
      if (!texto) return;
      const coincidencias = productos.filter(
        (p) => p.codigo && p.codigo.toLowerCase() === texto.toLowerCase()
      );
      if (coincidencias.length === 1) {
        agregarProducto(coincidencias[0]);
        setBusqueda("");
        setTimeout(() => searchRef.current?.focus(), 50);
      }
    }, 300);

    return () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  }, [busqueda, productos]);

  const fetchProductos = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const sid = getSucursalId();
      const url = `${baseUrl}/products/all${sid != null ? `?sucursal_id=${sid}` : ""}`;
      const res = await axios.get(url, { headers });
      setProductos(res.data || []);
    } catch (error) {
      console.error("Error al cargar productos:", error);
    } finally {
      setLoading(false);
    }
  };

  const productosFiltrados = productos.filter((p) => {
    const texto = busqueda.toLowerCase();
    return (
      p.codigo?.toLowerCase().includes(texto) ||
      p.nombre?.toLowerCase().includes(texto) ||
      p.talle?.toLowerCase().includes(texto)
    );
  });

  const agregarProducto = (producto) => {
    setSeleccionados((prev) => {
      const existente = prev.find((s) => s.id === producto.id);
      if (existente) {
        return prev.map((s) =>
          s.id === producto.id ? { ...s, cantidad: s.cantidad + 1 } : s
        );
      }
      return [
        ...prev,
        {
          id: producto.id,
          codigo: producto.codigo,
          nombre: producto.nombre,
          talle: producto.talle,
          precio_venta: producto.precio_venta,
          cantidad: 1,
        },
      ];
    });
  };

  const cambiarCantidad = (id, delta) => {
    setSeleccionados((prev) =>
      prev
        .map((s) =>
          s.id === id ? { ...s, cantidad: Math.max(0, s.cantidad + delta) } : s
        )
        .filter((s) => s.cantidad > 0)
    );
  };

  const actualizarCantidad = (id, valor) => {
    const num = parseInt(valor, 10);
    if (isNaN(num) || num < 1) return;
    setSeleccionados((prev) =>
      prev.map((s) => (s.id === id ? { ...s, cantidad: num } : s))
    );
  };

  const eliminarProducto = (id) => {
    setSeleccionados((prev) => prev.filter((s) => s.id !== id));
  };

  const limpiarTodo = () => {
    setSeleccionados([]);
  };

  const totalEtiquetas = seleccionados.reduce((acc, s) => acc + s.cantidad, 0);

  const generarPDF = async () => {
    if (seleccionados.length === 0) {
      Swal.fire("Atención", "Agregá al menos un producto para generar.", "warning");
      return;
    }

    setGenerando(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const body = {
        productos: seleccionados.map((s) => ({
          producto_id: s.id,
          cantidad: s.cantidad,
        })),
      };

      const res = await axios.post(`${baseUrl}/reportes/generate_barcodes`, body, {
        headers,
        responseType: "blob",
      });

      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "codigos_barra.pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      Swal.fire("PDF generado", `Se generaron ${totalEtiquetas} etiquetas.`, "success");
    } catch (error) {
      console.error("Error al generar PDF:", error);
      Swal.fire("Error", "No se pudo generar el PDF de códigos de barra.", "error");
    } finally {
      setGenerando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <Barcode className="h-7 w-7 text-teal-600" />
          Generar Códigos de Barra
        </h1>
        <p className="text-slate-500 mt-0.5">
          Buscá productos, seleccionalos y generá una hoja A4 con etiquetas listas para pegar.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* COLUMNA IZQUIERDA — Buscar productos */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col" style={{ maxHeight: "75vh" }}>
          <div className="p-4 border-b border-slate-100">
            <h2 className="text-base font-medium text-slate-900 mb-3 flex items-center gap-2">
              <Package className="h-5 w-5 text-slate-400" />
              Productos disponibles
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                autoFocus
                placeholder="Escaneá o buscá por código, nombre o talle..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
                    const texto = busqueda.trim();
                    if (!texto) return;
                    const coincidencias = productos.filter(
                      (p) => p.codigo && p.codigo.toLowerCase() === texto.toLowerCase()
                    );
                    if (coincidencias.length === 1) {
                      agregarProducto(coincidencias[0]);
                      setBusqueda("");
                    } else if (productosFiltrados.length === 1) {
                      agregarProducto(productosFiltrados[0]);
                      setBusqueda("");
                    }
                    setTimeout(() => searchRef.current?.focus(), 50);
                  }
                }}
                onBlur={() =>
                  setTimeout(() => {
                    const active = document.activeElement;
                    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
                    searchRef.current?.focus();
                  }, 150)
                }
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              {busqueda && (
                <button
                  onClick={() => {
                    setBusqueda("");
                    searchRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {productosFiltrados.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No se encontraron productos</p>
              </div>
            ) : (
              <div className="space-y-1">
                {productosFiltrados.map((p) => {
                  const yaSeleccionado = seleccionados.find((s) => s.id === p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => agregarProducto(p)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center justify-between group ${
                        yaSeleccionado
                          ? "bg-teal-50 border border-teal-200"
                          : "hover:bg-slate-50 border border-transparent"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                            {p.codigo}
                          </span>
                          {p.talle && (
                            <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                              {p.talle}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-slate-800 mt-1 truncate">
                          {p.nombre}
                        </p>
                        <p className="text-xs text-slate-400">
                          ${Number(p.precio_venta).toLocaleString()}
                        </p>
                      </div>
                      <div className="ml-3 shrink-0">
                        {yaSeleccionado ? (
                          <span className="text-xs text-teal-600 font-medium bg-teal-100 px-2 py-1 rounded-full">
                            x{yaSeleccionado.cantidad}
                          </span>
                        ) : (
                          <Plus className="h-5 w-5 text-slate-300 group-hover:text-teal-500 transition-colors" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA — Seleccionados */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col" style={{ maxHeight: "75vh" }}>
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-base font-medium text-slate-900 flex items-center gap-2">
              <Barcode className="h-5 w-5 text-slate-400" />
              Etiquetas a imprimir
              {seleccionados.length > 0 && (
                <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium">
                  {totalEtiquetas} etiqueta{totalEtiquetas !== 1 ? "s" : ""}
                </span>
              )}
            </h2>
            {seleccionados.length > 0 && (
              <button
                onClick={limpiarTodo}
                className="text-xs text-slate-400 hover:text-red-500 transition-colors"
              >
                Limpiar todo
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {seleccionados.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Barcode className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Seleccioná productos de la izquierda</p>
                <p className="text-xs mt-1">para agregar etiquetas</p>
              </div>
            ) : (
              <div className="space-y-1">
                {seleccionados.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          {s.codigo}
                        </span>
                        {s.talle && (
                          <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                            {s.talle}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-slate-800 mt-1 truncate">
                        {s.nombre}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => cambiarCantidad(s.id, -1)}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={s.cantidad}
                        onChange={(e) => actualizarCantidad(s.id, e.target.value)}
                        className="w-12 text-center text-sm font-medium border border-slate-200 rounded py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                      <button
                        onClick={() => cambiarCantidad(s.id, 1)}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    <button
                      onClick={() => eliminarProducto(s.id)}
                      className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {seleccionados.length > 0 && (
            <div className="p-4 border-t border-slate-100">
              <button
                onClick={generarPDF}
                disabled={generando}
                className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white font-medium py-3 px-4 rounded-lg transition-colors"
              >
                {generando ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Printer className="h-5 w-5" />
                    Generar PDF ({totalEtiquetas} etiqueta{totalEtiquetas !== 1 ? "s" : ""})
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
