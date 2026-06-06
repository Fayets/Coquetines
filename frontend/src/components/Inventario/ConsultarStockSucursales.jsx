import React, { useState, useRef, useEffect } from "react";
import { Search, Package, MapPin, Loader2, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import axios from "axios";
import { getToken } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";
import PageHeader from "../UI/PageHeader";

const ITEMS_PER_PAGE = 10;

export default function ConsultarStockSucursales() {
  const [busqueda, setBusqueda] = useState("");
  const [talle, setTalle] = useState("");
  const [resultados, setResultados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const searchRef = useRef(null);
  const token = getToken();

  useEffect(() => {
    if (searchRef.current) searchRef.current.focus();
  }, []);

  const buscar = async (e) => {
    e?.preventDefault();
    if (!busqueda.trim() && !talle.trim()) return;
    setLoading(true);
    setBuscado(true);
    setCurrentPage(1);
    try {
      const params = new URLSearchParams();
      if (busqueda.trim()) params.append("busqueda", busqueda.trim());
      if (talle.trim()) params.append("talle", talle.trim());
      const res = await axios.get(
        `${API_URL}/products/stock-otras-sucursales?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setResultados(Array.isArray(res.data) ? res.data : []);
    } catch {
      setResultados([]);
    } finally {
      setLoading(false);
    }
  };

  const agrupados = resultados.reduce((acc, p) => {
    const nombre = p.sucursal_nombre || "Sin sucursal";
    if (!acc[nombre]) acc[nombre] = [];
    acc[nombre].push(p);
    return acc;
  }, {});

  const totalPages = Math.ceil(resultados.length / ITEMS_PER_PAGE);
  const paginados = resultados.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="p-8">
      <PageHeader
        title="Consultar stock en otras sucursales"
        subtitle="Buscá un producto para ver si hay disponibilidad en otra sucursal"
        action={
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>
        }
      />

      <form onSubmit={buscar} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Nombre, código o marca del producto..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <div className="w-full sm:w-36">
            <input
              type="text"
              placeholder="Talle (ej: L)"
              value={talle}
              onChange={(e) => setTalle(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={loading || (!busqueda.trim() && !talle.trim())}
            className="px-6 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 justify-center"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Buscar
          </button>
        </div>
      </form>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        </div>
      )}

      {!loading && buscado && resultados.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
          <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No se encontraron productos con stock en otras sucursales</p>
          <p className="text-sm text-slate-400 mt-1">Probá con otro nombre, código o talle</p>
        </div>
      )}

      {!loading && resultados.length > 0 && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {resultados.length} producto{resultados.length !== 1 ? "s" : ""} encontrado{resultados.length !== 1 ? "s" : ""} en{" "}
              {Object.keys(agrupados).length} sucursal{Object.keys(agrupados).length !== 1 ? "es" : ""}
            </p>
          </div>

          {Object.entries(agrupados).map(([sucursal, productos]) => (
            <div key={sucursal} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="h-4 w-4 text-teal-600" />
                <h3 className="text-sm font-semibold text-slate-700">{sucursal}</h3>
                <span className="text-xs text-slate-400">({productos.length} producto{productos.length !== 1 ? "s" : ""})</span>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Código</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Nombre</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Marca</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Talle</th>
                      <th className="text-center px-4 py-3 font-medium text-slate-500">Stock</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-500">Lista</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-500">Efect.</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-500">Transf.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productos.map((p) => (
                      <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-600 font-mono text-xs">{p.codigo}</td>
                        <td className="px-4 py-3 text-slate-900 font-medium">{p.nombre}</td>
                        <td className="px-4 py-3 text-slate-500">{p.marca || "—"}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-xs font-medium">
                            {p.talle}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              p.stock > 3
                                ? "bg-emerald-50 text-emerald-700"
                                : p.stock > 0
                                ? "bg-amber-50 text-amber-700"
                                : "bg-red-50 text-red-700"
                            }`}
                          >
                            {p.stock}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-900 font-medium tabular-nums">
                          ${Number(p.precio_venta).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                          ${Number(p.precio_efectivo ?? 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                          ${Number(p.precio_transferencia ?? 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
