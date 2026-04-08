import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { Building2, FileDown, Search } from "lucide-react";
import { FaEye } from "react-icons/fa";
import useAuth from "../Hooks/useAuth";
import { getUser, getToken, getSucursalId } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";

function fmtMoney(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return "$0,00";
  return x.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
}

export default function HistorialCambiosVenta() {
  const token = getToken();
  const user = getUser();
  const esOwner = user.role === "OWNER";
  const navigate = useNavigate();
  const isAuthenticated = useAuth();

  const [sucursales, setSucursales] = useState([]);
  const [sucursalFiltro, setSucursalFiltro] = useState(esOwner ? "" : String(getSucursalId() ?? ""));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 10;

  const sidEfectivo = esOwner ? (sucursalFiltro ? Number(sucursalFiltro) : null) : getSucursalId();

  useEffect(() => {
    if (!esOwner || !token) return;
    axios
      .get(`${API_URL}/sucursales/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : [];
        setSucursales(list.filter((s) => (s.nombre || "") !== "Sucursal Principal"));
      })
      .catch(() => setSucursales([]));
  }, [esOwner, token]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    if (esOwner && !sucursalFiltro) {
      setRows([]);
      setError(null);
      setLoading(false);
      return;
    }
    if (sidEfectivo == null) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    axios
      .get(`${API_URL}/ventas/cambios/listado?sucursal_id=${sidEfectivo}&limit=500`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((r) => setRows(Array.isArray(r.data) ? r.data : []))
      .catch((err) => {
        const d = err.response?.data?.detail;
        setError(typeof d === "string" ? d : err.message || "Error al cargar el historial.");
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [token, esOwner, sucursalFiltro, sidEfectivo]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((g) => {
      const lineas = Array.isArray(g.lineas) ? g.lineas : [];
      const blob = [
        ...(g.cambio_ids || []),
        g.venta_id,
        g.cliente_venta,
        g.fecha,
        g.nota_credito_id,
        ...lineas.flatMap((ln) => [
          ln.id,
          ln.producto_devuelto_codigo,
          ln.producto_devuelto_nombre,
          ln.producto_nuevo_codigo,
          ln.producto_nuevo_nombre,
        ]),
      ]
        .filter((x) => x !== undefined && x !== null && x !== "")
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [rows, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const slice = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, sucursalFiltro, sidEfectivo]);

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(filtered.length / perPage));
    setPage((p) => Math.min(Math.max(1, p), tp));
  }, [filtered.length, perPage]);

  const descargarNota = (notaId) => {
    const url = `${API_URL}/reportes/nota-credito-pdf/${notaId}`;
    axios
      .get(url, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob",
      })
      .then((res) => {
        const blob = new Blob([res.data], { type: "application/pdf" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `nota_credito_${notaId}.pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => Swal.fire("Error", "No se pudo descargar el PDF", "error"));
  };

  const etiquetaDiferencia = (diff) => {
    const d = Number(diff);
    if (d < -0.005) return { text: "Nota de crédito", className: "text-emerald-700 bg-emerald-50" };
    if (d > 0.005) return { text: "Cobró suplemento", className: "text-amber-800 bg-amber-50" };
    return { text: "Mismo valor", className: "text-slate-600 bg-slate-100" };
  };

  if (!isAuthenticated) {
    return <div className="p-8">No tenés acceso; iniciá sesión.</div>;
  }

  return (
    <div className="p-8">
      <div className="mb-6 text-left">
        <h1 className="text-2xl font-semibold text-slate-900">Historial de cambios de producto</h1>
        <p className="text-slate-500 text-sm mt-0.5 max-w-3xl">
          Cambios registrados desde una venta: qué se devolvió, qué se entregó y diferencia de dinero.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por venta, cliente, código, producto, fecha…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm"
              disabled={esOwner && !sucursalFiltro}
            />
          </div>
          {esOwner && sucursales.length > 0 && (
            <div className="flex items-center gap-2 min-w-[220px]">
              <Building2 className="h-4 w-4 text-slate-500 shrink-0" />
              <select
                value={sucursalFiltro}
                onChange={(e) => setSucursalFiltro(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                <option value="">Elegí sucursal…</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 border-2 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
          </div>
        ) : esOwner && !sucursalFiltro ? (
          <p className="text-center py-14 text-slate-500 text-sm">Seleccioná una sucursal para ver el historial.</p>
        ) : slice.length === 0 ? (
          <p className="text-center py-14 text-slate-500 text-sm">No hay cambios registrados en esta sucursal.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-professional min-w-[960px]">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Operación</th>
                    <th>Venta</th>
                    <th>Cliente</th>
                    <th>Devuelve</th>
                    <th>Entrega</th>
                    <th>Valores</th>
                    <th>Diferencia</th>
                    <th>Detalle</th>
                    <th className="w-28">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {slice.map((g) => {
                    const lineas = Array.isArray(g.lineas) ? g.lineas : [];
                    const lineasEntrega = lineas.filter((ln) => Number(ln.cantidad_nueva) > 0);
                    const tag = etiquetaDiferencia(g.diferencia_monto);
                    const rowKey = (g.cambio_ids && g.cambio_ids.length ? g.cambio_ids : [g.venta_id]).join("-");
                    const idsTitulo =
                      g.cambio_ids && g.cambio_ids.length
                        ? `Registros internos: ${g.cambio_ids.map((id) => `#${id}`).join(", ")}`
                        : "";
                    const operacionLabel =
                      g.cambio_ids && g.cambio_ids.length > 1
                        ? "1 operación"
                        : g.cambio_ids && g.cambio_ids.length === 1
                          ? `#${g.cambio_ids[0]}`
                          : "—";
                    return (
                      <tr key={rowKey}>
                        <td className="whitespace-nowrap text-slate-700">
                          {g.fecha ? new Date(g.fecha + "T12:00:00").toLocaleDateString("es-AR") : "—"}
                        </td>
                        <td className="font-medium text-slate-900 text-xs max-w-[120px]" title={idsTitulo || undefined}>
                          {operacionLabel}
                        </td>
                        <td>
                          <span className="text-slate-800">#{g.venta_id}</span>
                          {g.venta_metodo_pago ? (
                            <span className="block text-xs text-slate-500">{g.venta_metodo_pago}</span>
                          ) : null}
                        </td>
                        <td className="max-w-[140px]">
                          <span className="line-clamp-2" title={g.cliente_venta}>
                            {g.cliente_venta || "—"}
                          </span>
                        </td>
                        <td className="max-w-[200px] align-top">
                          <div className="space-y-2">
                            {lineas.map((ln) => (
                              <div key={ln.id} className="pb-2 border-b border-slate-100 last:border-0 last:pb-0">
                                <span className="font-mono text-xs text-slate-700">{ln.producto_devuelto_codigo}</span>
                                <span className="text-slate-500"> ×{ln.cantidad_devuelta}</span>
                                <span
                                  className="block text-xs text-slate-500 line-clamp-2"
                                  title={ln.producto_devuelto_nombre}
                                >
                                  {ln.producto_devuelto_nombre}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="max-w-[200px] align-top">
                          <div className="space-y-2">
                            {lineasEntrega.length === 0 ? (
                              <span className="text-slate-400 text-xs">—</span>
                            ) : (
                              lineasEntrega.map((ln) => (
                                <div key={ln.id} className="pb-2 border-b border-slate-100 last:border-0 last:pb-0">
                                  <span className="font-mono text-xs text-slate-700">{ln.producto_nuevo_codigo}</span>
                                  <span className="text-slate-500"> ×{ln.cantidad_nueva}</span>
                                  <span
                                    className="block text-xs text-slate-500 line-clamp-2"
                                    title={ln.producto_nuevo_nombre}
                                  >
                                    {ln.producto_nuevo_nombre}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="text-xs text-slate-600 align-top whitespace-nowrap">
                          {lineas.length > 1 ? (
                            <>
                              <div className="font-medium text-slate-700">Totales</div>
                              <div>Dev: {fmtMoney(g.valor_devuelto_total)}</div>
                              <div>Nuevo: {fmtMoney(g.valor_nuevo_total)}</div>
                            </>
                          ) : lineas.length === 1 ? (
                            <>
                              <div>Dev: {fmtMoney(lineas[0].valor_devuelto)}</div>
                              <div>Nuevo: {fmtMoney(lineas[0].valor_nuevo)}</div>
                            </>
                          ) : (
                            <span>—</span>
                          )}
                        </td>
                        <td>
                          <div className="font-medium text-slate-900">{fmtMoney(g.diferencia_monto)}</div>
                          <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded ${tag.className}`}>
                            {tag.text}
                          </span>
                        </td>
                        <td className="text-xs text-slate-600 max-w-[160px]">
                          {g.nota_credito_id ? (
                            <span>Nota #{g.nota_credito_id}</span>
                          ) : g.metodo_pago_suplemento ? (
                            <span>Suplemento: {g.metodo_pago_suplemento}</span>
                          ) : (
                            <span>—</span>
                          )}
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg"
                              title="Ver venta"
                              onClick={() => navigate(`/ventas/details/${g.venta_id}`)}
                            >
                              <FaEye className="h-4 w-4" />
                            </button>
                            {g.nota_credito_id ? (
                              <button
                                type="button"
                                className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg"
                                title="Descargar nota de crédito"
                                onClick={() => descargarNota(g.nota_credito_id)}
                              >
                                <FileDown className="h-4 w-4" />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
              <p className="text-sm text-slate-500">
                Página {currentPage} de {totalPages} · {filtered.length} registro{filtered.length !== 1 ? "s" : ""}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={currentPage >= totalPages}
                  className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
