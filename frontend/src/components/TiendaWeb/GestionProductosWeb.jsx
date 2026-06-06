import React, { useState, useEffect } from "react";
import axios from "axios";
import { Globe, Search } from "lucide-react";
import Swal from "sweetalert2";
import useAuth from "../Hooks/useAuth";
import { getUser, getToken } from "../../utils/sucursal";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../../utils/api";

export default function GestionProductosWeb() {
  const token = getToken();
  const user = getUser();
  const navigate = useNavigate();
  const isAuthenticated = useAuth();
  const esOwner = user.role === "OWNER";
  const esAdmin = user.role === "ADMIN";

  const [tiendaOnline, setTiendaOnline] = useState(null);
  const [stockSucursalNombre, setStockSucursalNombre] = useState("");
  const [productosWeb, setProductosWeb] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingProductoId, setTogglingProductoId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (user.role === "EMPLEADO") {
      navigate("/dashboard", { replace: true });
    }
  }, [user.role, navigate]);

  useEffect(() => {
    if (!token || (!esOwner && !esAdmin)) return;

    const loadContext = async () => {
      try {
        const res = await axios.get(`${API_URL}/sucursales/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const list = Array.isArray(res.data) ? res.data : [];
        const tiendas = list.filter((s) => s.es_tienda_online && s.activo);

        let tienda = null;
        if (esOwner) {
          tienda = tiendas.sort((a, b) => a.id - b.id)[0] || null;
        } else if (esAdmin && user.sucursal_id != null) {
          tienda = tiendas.find((s) => s.id === user.sucursal_id) || null;
        }

        if (!tienda) {
          navigate("/dashboard", { replace: true });
          return;
        }

        setTiendaOnline(tienda);
        const stock = list.find((s) => s.id === tienda.sucursal_stock_id);
        setStockSucursalNombre(stock?.nombre || "");
      } catch {
        navigate("/dashboard", { replace: true });
      }
    };

    loadContext();
  }, [token, esOwner, esAdmin, user.sucursal_id, navigate]);

  const fetchProductosWeb = () => {
    if (!token) return;
    setLoading(true);
    axios
      .get(`${API_URL}/woo/tienda/productos`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        setProductosWeb(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => {
        const msg = err.response?.data?.detail || "No se pudieron cargar los productos.";
        Swal.fire("Error", typeof msg === "string" ? msg : "No se pudieron cargar los productos.", "error");
        setProductosWeb([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (tiendaOnline) fetchProductosWeb();
  }, [tiendaOnline]);

  const handleToggleProductoWeb = (producto) => {
    if (!token || togglingProductoId) return;
    setTogglingProductoId(producto.producto_id);
    const publicar = !producto.publicado;
    const req = publicar
      ? axios.post(`${API_URL}/woo/tienda/productos/${producto.producto_id}`, null, {
          headers: { Authorization: `Bearer ${token}` },
        })
      : axios.delete(`${API_URL}/woo/tienda/productos/${producto.producto_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
    req
      .then(() => {
        setProductosWeb((prev) =>
          prev.map((p) =>
            p.producto_id === producto.producto_id ? { ...p, publicado: publicar } : p
          )
        );
      })
      .catch((err) => {
        const msg = err.response?.data?.detail || "No se pudo actualizar el producto.";
        Swal.fire("Error", typeof msg === "string" ? msg : "No se pudo actualizar el producto.", "error");
      })
      .finally(() => setTogglingProductoId(null));
  };

  const filtrados = productosWeb.filter((p) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      (p.nombre || "").toLowerCase().includes(q) ||
      (p.codigo || "").toLowerCase().includes(q) ||
      (p.talle || "").toLowerCase().includes(q)
    );
  });

  const publicados = productosWeb.filter((p) => p.publicado).length;

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
        <div className="w-10 h-10 border-2 border-slate-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-violet-600 mb-1">
          <Globe className="h-5 w-5" />
          <span className="text-sm font-medium">Tienda online</span>
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">Productos web</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {tiendaOnline.nombre}
          {stockSucursalNombre ? ` · Stock desde ${stockSucursalNombre}` : ""}
        </p>
        <p className="text-slate-500 text-sm mt-1">
          {publicados} publicado{publicados !== 1 ? "s" : ""} de {productosWeb.length} productos
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
              placeholder="Buscar por nombre, código o talle…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-violet-600 rounded-full animate-spin" />
          </div>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-slate-500 italic text-center py-12">
            {searchTerm.trim() ? "No hay productos que coincidan con la búsqueda." : "No hay productos en la sucursal de stock."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 max-h-[calc(100vh-280px)] overflow-y-auto">
            {filtrados.map((p) => (
              <li key={p.producto_id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/50">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900 truncate">{p.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {p.codigo} · Talle {p.talle} · Stock {p.stock}
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 shrink-0 cursor-pointer">
                  <span className={`text-xs font-medium ${p.publicado ? "text-violet-700" : "text-slate-500"}`}>
                    {p.publicado ? "Publicado" : "No publicado"}
                  </span>
                  <input
                    type="checkbox"
                    checked={!!p.publicado}
                    disabled={togglingProductoId === p.producto_id}
                    onChange={() => handleToggleProductoWeb(p)}
                    className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 disabled:opacity-50"
                  />
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
