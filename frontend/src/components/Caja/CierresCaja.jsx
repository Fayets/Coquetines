import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { FileDown, Loader2 } from "lucide-react";
import useAuth from "../Hooks/useAuth";
import { getToken, getUser } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";

export default function CierresCaja() {
  const [cierres, setCierres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const token = getToken();
  const navigate = useNavigate();
  const isAuthenticated = useAuth();

  useEffect(() => {
    if (getUser().role !== "OWNER") {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!token || getUser().role !== "OWNER") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`${API_URL}/caja/cierres`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) setCierres(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.detail ||
              err.response?.data?.message ||
              "No se pudieron cargar los cierres."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const descargarPdf = async (c) => {
    if (!token) return;
    setDownloadingId(c.id);
    try {
      const res = await axios.get(`${API_URL}/caja/cierres/${c.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob",
      });
      const blob = res.data;
      const ct = (res.headers["content-type"] || "").toLowerCase();
      if (ct.includes("application/json")) {
        const text = await blob.text();
        let msg = "No se pudo generar el PDF.";
        try {
          const j = JSON.parse(text);
          if (j.detail) msg = Array.isArray(j.detail) ? j.detail.map((d) => d.msg).join(" ") : j.detail;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const disposition = res.headers["content-disposition"];
      let filename = `cierre_caja_${c.fecha}_${c.turno}.pdf`;
      if (disposition) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match) filename = match[1];
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      let msg = "No se pudo descargar el PDF.";
      if (err.response?.data instanceof Blob) {
        try {
          const t = await err.response.data.text();
          const j = JSON.parse(t);
          if (j.detail) {
            msg = Array.isArray(j.detail) ? j.detail.map((d) => d.msg || d).join(" ") : String(j.detail);
          }
        } catch {
          /* ignore */
        }
      } else if (typeof err.message === "string" && err.message) {
        msg = err.message;
      } else if (err.response?.data?.detail) {
        const d = err.response.data.detail;
        msg = Array.isArray(d) ? d.map((x) => x.msg || x).join(" ") : String(d);
      } else if (err.response?.data?.message) {
        msg = String(err.response.data.message);
      }
      setError(msg);
    } finally {
      setDownloadingId(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="p-8">
        <p className="text-slate-600">No tenés acceso. Iniciá sesión.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-8 text-slate-500">Cargando cierres…</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-slate-900 mb-2">Cierres de caja</h1>
      <p className="text-slate-500 text-sm mb-6">Todos los turnos cerrados, por sucursal.</p>
      {error && (
        <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">{error}</div>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Turno</th>
              <th className="px-4 py-3 font-medium">Sucursal</th>
              <th className="px-4 py-3 font-medium text-right">Saldo inicial</th>
              <th className="px-4 py-3 font-medium text-right">Ingresos</th>
              <th className="px-4 py-3 font-medium text-right">Egresos</th>
              <th className="px-4 py-3 font-medium text-right">Saldo final</th>
              <th className="px-4 py-3 font-medium text-right w-px whitespace-nowrap">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cierres.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/80">
                <td className="px-4 py-3 text-slate-800">{c.fecha}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      c.turno === "MAÑANA" || c.turno === "MANANA"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-indigo-100 text-indigo-800"
                    }`}
                  >
                    {c.turno}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-700">{c.sucursal_nombre}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  ${Number(c.saldo_inicial).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right text-emerald-700 tabular-nums">
                  ${Number(c.total_ingresos).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right text-rose-600 tabular-nums">
                  ${Number(c.total_egresos).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">
                  ${Number(c.saldo_final).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => descargarPdf(c)}
                    disabled={downloadingId === c.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                    title="Descargar PDF del cierre"
                  >
                    {downloadingId === c.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <FileDown className="h-3.5 w-3.5" aria-hidden />
                    )}
                    PDF
                  </button>
                </td>
              </tr>
            ))}
            {cierres.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  Sin cierres registrados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
