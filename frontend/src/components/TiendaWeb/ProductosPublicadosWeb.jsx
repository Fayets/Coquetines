import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Search, Trash2, Loader2 } from "lucide-react";
import Swal from "sweetalert2";
import useAuth from "../Hooks/useAuth";
import { formatPrecio } from "../../utils/tiendaWebPrecios";
import { useTiendaOnlineContext } from "./useTiendaOnlineContext";
import WooProductoSlidePanel from "./WooProductoSlidePanel";
import { API_URL } from "../../utils/api";

function stockWooLabel(producto) {
  if (producto.stock != null && producto.stock !== "") return String(producto.stock);
  if (producto.stock_status === "instock") return "En stock";
  if (producto.stock_status === "outofstock") return "Sin stock";
  return producto.stock_status || "—";
}

export default function ProductosPublicadosWeb() {
  const isAuthenticated = useAuth();
  const { token, tiendaOnline, loading: contextLoading } = useTiendaOnlineContext();
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedWooId, setSelectedWooId] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [deletingWooId, setDeletingWooId] = useState(null);

  const fetchProductos = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError("");
    axios
      .get(`${API_URL}/woo/tienda/woocommerce-productos`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        setProductos(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => {
        const msg = err.response?.data?.detail || "No se pudieron cargar los productos de WooCommerce.";
        setError(typeof msg === "string" ? msg : "No se pudieron cargar los productos de WooCommerce.");
        Swal.fire("Error", typeof msg === "string" ? msg : "No se pudieron cargar los productos.", "error");
        setProductos([]);
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (tiendaOnline) fetchProductos();
  }, [tiendaOnline, fetchProductos]);

  const openPanel = (wooId) => {
    setSelectedWooId(wooId);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setSelectedWooId(null);
  };

  const handleDeleteProducto = async (e, producto) => {
    e.stopPropagation();
    e.preventDefault();
    if (!token || deletingWooId) return;

    const result = await Swal.fire({
      icon: "warning",
      title: "¿Eliminar definitivamente?",
      text: `"${producto.nombre}" se borrará de WooCommerce y no se podrá recuperar. El SKU quedará libre para volver a publicar.`,
      showCancelButton: true,
      confirmButtonText: "Eliminar definitivamente",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626",
    });
    if (!result.isConfirmed) return;

    setDeletingWooId(producto.woo_id);
    try {
      await axios.delete(`${API_URL}/woo/tienda/woocommerce-productos/${producto.woo_id}`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { force: true },
      });
      if (selectedWooId === producto.woo_id) closePanel();
      fetchProductos();
      Swal.fire({
        icon: "success",
        title: "Eliminado",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err) {
      const msg = err.response?.data?.detail || "No se pudo eliminar el producto.";
      Swal.fire("Error", typeof msg === "string" ? msg : "No se pudo eliminar el producto.", "error");
    } finally {
      setDeletingWooId(null);
    }
  };

  const filtrados = productos.filter((p) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      (p.nombre || "").toLowerCase().includes(q) ||
      (p.sku || "").toLowerCase().includes(q)
    );
  });

  if (!isAuthenticated) {
    return (
      <div className="p-8">
        <p className="text-slate-600">No tenés acceso.</p>
      </div>
    );
  }

  if (!tiendaOnline) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        {contextLoading ? (
          <div className="w-10 h-10 border-2 border-slate-200 border-t-violet-600 rounded-full animate-spin" />
        ) : (
          <p className="text-slate-600 text-sm">No tenés acceso a la tienda online.</p>
        )}
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-slate-900">Productos publicados</h1>
        <p className="text-slate-500 text-sm mt-1">
          {productos.length} producto{productos.length !== 1 ? "s" : ""} en la tienda WooCommerce
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre o SKU…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-violet-600 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-12 px-4">
            <p className="text-sm text-rose-600 mb-3">{error}</p>
            <button
              type="button"
              onClick={fetchProductos}
              className="text-sm text-violet-600 font-medium hover:text-violet-800"
            >
              Reintentar
            </button>
          </div>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-slate-500 italic text-center py-12">
            {searchTerm.trim()
              ? "No hay productos en WooCommerce que coincidan con la búsqueda."
              : "No hay productos en la tienda WooCommerce."}
          </p>
        ) : (
          <div className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 max-h-[calc(100vh-240px)] overflow-y-auto">
            {filtrados.map((p) => (
              <article
                key={p.woo_id}
                role="button"
                tabIndex={0}
                onClick={() => openPanel(p.woo_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openPanel(p.woo_id);
                  }
                }}
                className="group rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow hover:border-violet-200 transition-all overflow-hidden flex flex-col cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1"
              >
                <div className="aspect-[4/3] bg-slate-100 relative">
                  <button
                    type="button"
                    onClick={(e) => handleDeleteProducto(e, p)}
                    disabled={deletingWooId === p.woo_id}
                    aria-label="Eliminar producto"
                    title="Eliminar definitivamente"
                    className="absolute top-1.5 left-1.5 z-10 p-1.5 rounded-full bg-white/95 text-slate-500 hover:text-rose-600 hover:bg-white shadow-sm border border-slate-200/80 transition-colors disabled:opacity-60"
                  >
                    {deletingWooId === p.woo_id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                  {p.imagen_url ? (
                    <img
                      src={p.imagen_url}
                      alt={p.nombre}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                      Sin imagen
                    </div>
                  )}
                  <span
                    className={`absolute top-1.5 right-1.5 inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase ${
                      p.estado === "publish"
                        ? "bg-emerald-500/90 text-white"
                        : p.estado === "trash"
                          ? "bg-amber-500/90 text-white"
                          : "bg-slate-600/80 text-white"
                    }`}
                  >
                    {p.estado_label}
                  </span>
                </div>
                <div className="p-2.5 flex flex-col flex-1">
                  <h2 className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2 mb-0.5">{p.nombre}</h2>
                  <p className="text-[11px] text-slate-500 mb-2 truncate">SKU: {p.sku || "—"}</p>
                  <div className="mt-auto">
                    <p className="text-base font-bold text-violet-700 tabular-nums">{formatPrecio(p.precio)}</p>
                    <p className="text-[11px] text-slate-500 pt-1.5 mt-1 border-t border-slate-100">
                      Stock: <strong className="text-slate-700">{stockWooLabel(p)}</strong>
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <WooProductoSlidePanel
        token={token}
        wooId={selectedWooId}
        open={panelOpen}
        onClose={closePanel}
        onSaved={fetchProductos}
      />
    </div>
  );
}
