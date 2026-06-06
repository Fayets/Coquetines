import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { Globe, Search, Save } from "lucide-react";
import Swal from "sweetalert2";
import useAuth from "../Hooks/useAuth";
import { getUser, getToken } from "../../utils/sucursal";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../../utils/api";

const PRECIO_TIPOS = [
  { value: "precio_venta", label: "Precio venta" },
  { value: "precio_efectivo", label: "Precio efectivo" },
  { value: "precio_transferencia", label: "Precio transferencia" },
  { value: "precio_et", label: "Precio ET" },
];

const labelPrecioTipo = (tipo) =>
  PRECIO_TIPOS.find((t) => t.value === tipo)?.label || tipo;

function precioBaseDesdeProducto(producto, precioTipo) {
  const tipo = precioTipo || "precio_venta";
  const pv = Number(producto.precio_venta) || 0;
  if (tipo === "precio_venta") return pv;
  if (tipo === "precio_efectivo") {
    const pe = Number(producto.precio_efectivo) || 0;
    return pe > 0 ? pe : pv;
  }
  if (tipo === "precio_transferencia") {
    const pt = Number(producto.precio_transferencia) || 0;
    return pt > 0 ? pt : pv;
  }
  if (tipo === "precio_et") {
    const pet = Number(producto.precio_et) || 0;
    return pet > 0 ? pet : pv;
  }
  return pv;
}

function aplicarMarkup(precioBase, markupPct) {
  const base = Number(precioBase) || 0;
  const markup = Number(markupPct) || 0;
  return Math.round(base * (1 + markup / 100) * 100) / 100;
}

function formatPrecio(n) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

export default function GestionProductosWeb() {
  const token = getToken();
  const user = getUser();
  const navigate = useNavigate();
  const isAuthenticated = useAuth();
  const esOwner = user.role === "OWNER";
  const esAdmin = user.role === "ADMIN";

  const [tiendaOnline, setTiendaOnline] = useState(null);
  const [stockSucursalNombre, setStockSucursalNombre] = useState("");
  const [configWeb, setConfigWeb] = useState({ markup_web: 0, precio_tipo_web: "precio_venta" });
  const [configDraft, setConfigDraft] = useState({ markup_web: "0", precio_tipo_web: "precio_venta" });
  const [savingConfig, setSavingConfig] = useState(false);
  const [productosWeb, setProductosWeb] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingProductoId, setTogglingProductoId] = useState(null);
  const [savingProductoId, setSavingProductoId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const productoDraftsRef = useRef({});
  const saveTimersRef = useRef({});

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

  const fetchProductosWeb = useCallback(() => {
    if (!token) return;
    setLoading(true);
    axios
      .get(`${API_URL}/woo/tienda/productos`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const data = res.data || {};
        const cfg = data.config || { markup_web: 0, precio_tipo_web: "precio_venta" };
        setConfigWeb(cfg);
        setConfigDraft({
          markup_web: String(cfg.markup_web ?? 0),
          precio_tipo_web: cfg.precio_tipo_web || "precio_venta",
        });
        const productos = Array.isArray(data.productos) ? data.productos : [];
        setProductosWeb(productos);
        productoDraftsRef.current = {};
      })
      .catch((err) => {
        const msg = err.response?.data?.detail || "No se pudieron cargar los productos.";
        Swal.fire("Error", typeof msg === "string" ? msg : "No se pudieron cargar los productos.", "error");
        setProductosWeb([]);
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (tiendaOnline) fetchProductosWeb();
  }, [tiendaOnline, fetchProductosWeb]);

  useEffect(() => {
    return () => {
      Object.values(saveTimersRef.current).forEach(clearTimeout);
    };
  }, []);

  const previewGlobal = () => {
    const markup = Number(configDraft.markup_web) || 0;
    const tipo = configDraft.precio_tipo_web || "precio_venta";
    const ejemplo = productosWeb.find((p) => p.publicado) || productosWeb[0];
    if (!ejemplo) {
      return { markup, tipo, precio: null };
    }
    const base = precioBaseDesdeProducto(ejemplo, tipo);
    return { markup, tipo, precio: aplicarMarkup(base, markup), base, nombre: ejemplo.nombre };
  };

  const handleSaveConfig = () => {
    if (!token || savingConfig) return;
    const markupNum = Number(configDraft.markup_web);
    if (Number.isNaN(markupNum)) {
      Swal.fire("Error", "El markup global debe ser un número.", "error");
      return;
    }
    setSavingConfig(true);
    axios
      .patch(
        `${API_URL}/woo/tienda/config`,
        {
          markup_web: markupNum,
          precio_tipo_web: configDraft.precio_tipo_web,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      .then((res) => {
        const cfg = {
          markup_web: res.data.markup_web,
          precio_tipo_web: res.data.precio_tipo_web,
        };
        setConfigWeb(cfg);
        setConfigDraft({
          markup_web: String(cfg.markup_web),
          precio_tipo_web: cfg.precio_tipo_web,
        });
        fetchProductosWeb();
      })
      .catch((err) => {
        const msg = err.response?.data?.detail || "No se pudo guardar la configuración.";
        Swal.fire("Error", typeof msg === "string" ? msg : "No se pudo guardar la configuración.", "error");
      })
      .finally(() => setSavingConfig(false));
  };

  const getProductoDraft = (producto) => {
    const key = producto.producto_id;
    if (!productoDraftsRef.current[key]) {
      productoDraftsRef.current[key] = {
        precio_tipo: producto.precio_tipo || configWeb.precio_tipo_web || "precio_venta",
        markup:
          producto.markup != null && producto.markup !== ""
            ? String(producto.markup)
            : "",
      };
    }
    return productoDraftsRef.current[key];
  };

  const effectiveConfig = {
    markup_web: Number(configDraft.markup_web) || 0,
    precio_tipo_web: configDraft.precio_tipo_web || "precio_venta",
  };

  const previewProducto = (producto, draft) => {
    const tipoResuelto = draft.precio_tipo || effectiveConfig.precio_tipo_web;
    const markupUsado =
      draft.markup.trim() === ""
        ? effectiveConfig.markup_web
        : Number(draft.markup) || 0;
    const usaGlobal = draft.markup.trim() === "";
    const base = precioBaseDesdeProducto(producto, tipoResuelto);
    const precio = aplicarMarkup(base, markupUsado);
    return { base, markupUsado, precio, usaGlobal, tipoResuelto };
  };

  const scheduleSaveProducto = (producto, draft) => {
    if (!producto.publicado || !token) return;
    const key = producto.producto_id;
    if (saveTimersRef.current[key]) clearTimeout(saveTimersRef.current[key]);
    saveTimersRef.current[key] = setTimeout(() => {
      saveProductoPricing(producto, draft);
    }, 600);
  };

  const saveProductoPricing = (producto, draft) => {
    if (!token) return;
    const pid = producto.producto_id;
    setSavingProductoId(pid);
    const body = { precio_tipo: draft.precio_tipo || effectiveConfig.precio_tipo_web };
    if (draft.markup.trim() === "") {
      body.markup = null;
    } else {
      const m = Number(draft.markup);
      if (Number.isNaN(m)) {
        setSavingProductoId(null);
        return;
      }
      body.markup = m;
    }
    axios
      .patch(`${API_URL}/woo/tienda/productos/${pid}`, body, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        setProductosWeb((prev) =>
          prev.map((p) =>
            p.producto_id === pid
              ? {
                  ...p,
                  precio_tipo: res.data.precio_tipo,
                  markup: res.data.markup,
                  precio_base: res.data.precio_base,
                  markup_aplicado: res.data.markup_aplicado,
                  precio: res.data.precio,
                  precio_tipo_resuelto: res.data.precio_tipo,
                }
              : p
          )
        );
      })
      .catch((err) => {
        const msg = err.response?.data?.detail || "No se pudo guardar el precio del producto.";
        Swal.fire("Error", typeof msg === "string" ? msg : "No se pudo guardar el precio del producto.", "error");
      })
      .finally(() => setSavingProductoId(null));
  };

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
      .then(() => fetchProductosWeb())
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
  const globalPreview = previewGlobal();

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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6 p-4">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Configuración global de precios</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Markup global (%)</label>
            <input
              type="number"
              step="0.1"
              value={configDraft.markup_web}
              onChange={(e) => setConfigDraft((d) => ({ ...d, markup_web: e.target.value }))}
              className="w-28 px-3 py-2 border border-slate-200 rounded-lg text-sm"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de precio base</label>
            <select
              value={configDraft.precio_tipo_web}
              onChange={(e) => setConfigDraft((d) => ({ ...d, precio_tipo_web: e.target.value }))}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm min-w-[180px]"
            >
              {PRECIO_TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={savingConfig}
            className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {savingConfig ? "Guardando…" : "Guardar global"}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          {globalPreview.precio != null ? (
            <>
              Previsualización con markup global ({globalPreview.markup}% sobre{" "}
              {labelPrecioTipo(globalPreview.tipo)}):{" "}
              <span className="font-medium text-violet-700">{formatPrecio(globalPreview.precio)}</span>
              {globalPreview.nombre ? ` · ej. ${globalPreview.nombre}` : ""}
            </>
          ) : (
            "Configurá el markup global. Los productos sin markup propio usarán este porcentaje."
          )}
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
          <ul className="divide-y divide-slate-100 max-h-[calc(100vh-420px)] overflow-y-auto">
            {filtrados.map((p) => {
              const draft = getProductoDraft(p);
              const preview = previewProducto(p, draft);
              const guardando = savingProductoId === p.producto_id;

              return (
                <li key={p.producto_id} className="px-4 py-3 hover:bg-slate-50/50">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 truncate">{p.nombre}</p>
                      <p className="text-xs text-slate-500">
                        {p.codigo} · Talle {p.talle} · Stock {p.stock}
                      </p>
                    </div>

                    <label className="inline-flex items-center gap-2 shrink-0 cursor-pointer mt-1">
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
                  </div>

                  {p.publicado && (
                    <div className="mt-3 pl-0 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de precio</label>
                        <select
                          value={draft.precio_tipo}
                          onChange={(e) => {
                            draft.precio_tipo = e.target.value;
                            scheduleSaveProducto(p, draft);
                            setProductosWeb((prev) => [...prev]);
                          }}
                          disabled={guardando}
                          className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs min-w-[150px] disabled:opacity-50"
                        >
                          {PRECIO_TIPOS.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Markup propio (%)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={draft.markup}
                          onChange={(e) => {
                            draft.markup = e.target.value;
                            scheduleSaveProducto(p, draft);
                            setProductosWeb((prev) => [...prev]);
                          }}
                          disabled={guardando}
                          placeholder={`Global ${effectiveConfig.markup_web}%`}
                          className="w-28 px-2 py-1.5 border border-slate-200 rounded-lg text-xs disabled:opacity-50"
                        />
                      </div>
                      <div className="text-xs text-slate-600 pb-1">
                        <span className="block text-slate-500">Precio web</span>
                        <span className="font-semibold text-violet-700 text-sm">
                          {formatPrecio(preview.precio)}
                        </span>
                        <span className="block text-slate-400 mt-0.5">
                          Base {formatPrecio(preview.base)} ·{" "}
                          {preview.usaGlobal
                            ? `markup global ${preview.markupUsado}%`
                            : `markup ${preview.markupUsado}%`}
                        </span>
                      </div>
                    </div>
                  )}

                  {!p.publicado && (
                    <p className="text-xs text-slate-400 mt-2">
                      Con markup global ({effectiveConfig.markup_web}%):{" "}
                      {formatPrecio(
                        aplicarMarkup(
                          precioBaseDesdeProducto(p, effectiveConfig.precio_tipo_web),
                          effectiveConfig.markup_web
                        )
                      )}{" "}
                      · {labelPrecioTipo(effectiveConfig.precio_tipo_web)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
