import { useState, useEffect } from "react";
import axios from "axios";
import { Trophy, Loader2 } from "lucide-react";
import { getUser, getToken } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";

const PERIODOS = [
  { value: "todo", label: "Histórico general" },
  { value: "dia", label: "Día (hoy)" },
  { value: "semana", label: "Semana (últimos 7 días)" },
  { value: "mes", label: "Mes (mes en curso)" },
];

/**
 * Ranking de unidades vendidas por producto (todas las sucursales).
 * Solo visible para OWNER; el endpoint también exige rol OWNER.
 */
export default function RankingProductosVendidos() {
  const user = getUser();
  if (user?.role !== "OWNER") return null;

  const [periodo, setPeriodo] = useState("todo");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    axios
      .get(`${API_URL}/reportes/ranking-productos-vendidos`, {
        params: { periodo },
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((r) => {
        if (!cancelled) setRows(Array.isArray(r.data) ? r.data : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setRows([]);
          const d = err.response?.data?.detail;
          setError(typeof d === "string" ? d : "No se pudo cargar el ranking.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [periodo]);

  return (
    <div className="mb-10 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Productos más vendidos</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Unidades vendidas según el período (ventas registradas en el sistema).
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1 sm:items-end">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Período
          </label>
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 bg-white min-w-[220px] focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          >
            {PERIODOS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="flex justify-center items-center py-16 text-slate-500 gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            <span className="text-sm">Cargando ranking…</span>
          </div>
        ) : error ? (
          <p className="text-sm text-rose-600 text-center py-8">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">
            No hay ventas en el período seleccionado.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-100">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <th className="px-4 py-3 font-medium w-14">#</th>
                  <th className="px-4 py-3 font-medium">Código</th>
                  <th className="px-4 py-3 font-medium">Producto</th>
                  <th className="px-4 py-3 font-medium">Marca</th>
                  <th className="px-4 py-3 font-medium">Sucursal</th>
                  <th className="px-4 py-3 font-medium text-right">Unidades vendidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={`${row.producto_id}-${row.posicion}`} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 text-slate-500 tabular-nums">{row.posicion}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.codigo}</td>
                    <td className="px-4 py-3 text-slate-800 max-w-[220px] truncate" title={row.nombre}>
                      {row.nombre}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.marca || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.sucursal_nombre || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-teal-700 tabular-nums">
                      {Number(row.cantidad_vendida).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
