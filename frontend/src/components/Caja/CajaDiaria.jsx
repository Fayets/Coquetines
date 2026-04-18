import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  Wallet,
  Plus,
  MinusCircle,
  Lock,
  Calendar,
  RefreshCw,
  ArrowDownCircle,
  ArrowUpCircle,
  MessageCircle,
} from "lucide-react";
import Swal from "sweetalert2";
import useAuth from "../Hooks/useAuth";
import { getSucursalId, getUser, getToken } from "../../utils/sucursal";

import { API_URL } from "../../utils/api";

/** Fecha local YYYY-MM-DD para el input type="date" (sin correr a UTC). */
function hoyLocalISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatFechaHora(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function origenLabel(origen) {
  const map = {
    VENTA: "Venta",
    PAGO_CREDITO: "Pago crédito",
    MANUAL: "Egreso manual",
    CAMBIO_VENTA: "Cambio de producto",
  };
  return map[origen] || origen;
}

/** Quita el tramo legacy "— Medios: …" de la descripción guardada en BD. */
function descripcionCajaSinMedios(text) {
  if (!text) return "—";
  const limpio = text.replace(/\s*—\s*Medios:\s*[\s\S]*$/u, "").trim();
  return limpio || "—";
}

function movimientoExpandibleMixto(m) {
  return (
    m.origen === "VENTA" &&
    m.pago_mixto &&
    Array.isArray(m.medios_pago) &&
    m.medios_pago.length > 0
  );
}

export default function CajaDiaria() {
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fecha, setFecha] = useState(() => hoyLocalISO());
  /** Valores ASCII en API (MANANA/TARDE); el backend mapea a MAÑANA en BD. */
  const [turno, setTurno] = useState("MANANA");
  const [modalAbrir, setModalAbrir] = useState(false);
  const [modalEgreso, setModalEgreso] = useState(false);
  const [saldoInicial, setSaldoInicial] = useState("");
  const [egresoMonto, setEgresoMonto] = useState("");
  const [egresoDescripcion, setEgresoDescripcion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [movimientoExpandidoId, setMovimientoExpandidoId] = useState(null);
  const token = getToken();
  const isAuthenticated = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (getUser().role === "OWNER") {
      navigate("/dashboard", { replace: true });
      return;
    }
  }, [navigate]);

  const fetchResumen = async () => {
    if (!token || getUser().role === "OWNER") return;
    setLoading(true);
    setError(null);
    try {
      const sid = getSucursalId();
      const res = await axios.get(`${API_URL}/caja/resumen`, {
        params: sid != null ? { fecha, sucursal_id: sid, turno } : { fecha, turno },
        headers: { Authorization: `Bearer ${token}` },
      });
      setResumen(res.data);
    } catch (err) {
      if (err.response?.status === 404) {
        const detail = err.response?.data?.detail || "";
        const esCajaInexistente =
          typeof detail === "string" &&
          (detail.toLowerCase().includes("no existe caja") ||
            detail.toLowerCase().includes("no hay caja"));
        if (esCajaInexistente) {
          setResumen(null);
          setError(null);
        } else {
          setResumen(null);
          setError(
            "No se encontró el servicio de caja. Si estás en local: en el frontend poné en .env VITE_API_URL (p. ej. http://localhost:8000) y reiniciá el backend (uvicorn main:app --reload desde la carpeta backend)."
          );
        }
      } else if (!err.response) {
        setError("No se pudo conectar con el servidor. Revisá VITE_API_URL en .env y que el backend esté en marcha.");
      } else {
        setError(err.response?.data?.detail || "Error al cargar la caja.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (getUser().role === "OWNER") return;
    fetchResumen();
  }, [fecha, turno, token]);

  const handleAbrirCaja = async (e) => {
    e.preventDefault();
    const saldo = saldoInicial.trim() === "" ? 0 : parseFloat(saldoInicial);
    if (isNaN(saldo) || saldo < 0) {
      Swal.fire("Error", "Ingresá un saldo inicial válido (número ≥ 0). Dejá 0 si arrancás sin efectivo.", "error");
      return;
    }
    setEnviando(true);
    try {
      const sid = getSucursalId();
      const res = await axios.post(
        `${API_URL}/caja/abrir`,
        {
          sucursal_id: sid ?? undefined,
          saldo_inicial: saldo,
          fecha: fecha || undefined,
          turno,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.success) {
        Swal.fire("Listo", "Caja abierta correctamente.", "success");
        setModalAbrir(false);
        setSaldoInicial("");
        fetchResumen();
      } else {
        Swal.fire("Error", res.data?.message || "No se pudo abrir la caja.", "error");
      }
    } catch (err) {
      Swal.fire(
        "Error",
        err.response?.data?.message || err.response?.data?.detail || "Error al abrir la caja.",
        "error"
      );
    } finally {
      setEnviando(false);
    }
  };

  const handleCerrarCaja = async () => {
    const result = await Swal.fire({
      title: "¿Cerrar caja?",
      text: "No se podrán registrar más movimientos para este día.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#0d9488",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Sí, cerrar caja",
      cancelButtonText: "Cancelar",
    });
    if (!result.isConfirmed) return;

    setEnviando(true);
    try {
      const sid = getSucursalId();
      const res = await axios.post(
        `${API_URL}/caja/cerrar`,
        {},
        {
          params: sid != null ? { fecha, sucursal_id: sid, turno } : { fecha, turno },
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob",
        }
      );
      const blob = res.data;
      const disposition = res.headers["content-disposition"];
      let filename = `cierre_caja_${fecha}_${turno}.pdf`;
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
      Swal.fire(
        "Caja cerrada",
        "Se descargó el PDF del cierre. Podés enviarlo por WhatsApp al número configurado en Configuración.",
        "success"
      );
      fetchResumen();
    } catch (err) {
      const msg =
        err.response?.data instanceof Blob
          ? "No se pudo cerrar la caja."
          : err.response?.data?.detail || err.response?.data?.message || "Error al cerrar la caja.";
      Swal.fire("Error", msg, "error");
    } finally {
      setEnviando(false);
    }
  };

  const handleEgresoManual = async (e) => {
    e.preventDefault();
    const monto = parseFloat(egresoMonto);
    if (isNaN(monto) || monto <= 0) {
      Swal.fire("Error", "Ingresá un monto mayor a 0.", "error");
      return;
    }
    if (!egresoDescripcion.trim()) {
      Swal.fire("Error", "Ingresá una descripción.", "error");
      return;
    }
    setEnviando(true);
    try {
      const sid = getSucursalId();
      const res = await axios.post(
        `${API_URL}/caja/egreso-manual`,
        { monto, descripcion: egresoDescripcion.trim(), fecha: fecha || undefined },
        {
          params: sid != null ? { sucursal_id: sid, turno } : { turno },
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.data?.success) {
        Swal.fire("Listo", "Egreso registrado correctamente.", "success");
        setModalEgreso(false);
        setEgresoMonto("");
        setEgresoDescripcion("");
        fetchResumen();
      } else {
        Swal.fire("Error", res.data?.message || "No se pudo registrar el egreso.", "error");
      }
    } catch (err) {
      Swal.fire(
        "Error",
        err.response?.data?.message || err.response?.data?.detail || "Error al registrar el egreso.",
        "error"
      );
    } finally {
      setEnviando(false);
    }
  };

  const handleEnviarWhatsapp = async () => {
    const sid = getSucursalId();
    setEnviando(true);
    try {
      const res = await axios.post(
        `${API_URL}/caja/enviar-cierre`,
        {},
        {
          params:
            sid != null
              ? { fecha, turno, sucursal_id: sid }
              : { fecha, turno },
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.data?.success) {
        Swal.fire("Listo", res.data.message || "PDF enviado por WhatsApp.", "success");
      } else {
        Swal.fire("No enviado", res.data?.message || "No se pudo enviar el PDF.", "warning");
      }
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        "Error al intentar enviar el PDF.";
      Swal.fire("Error", typeof msg === "string" ? msg : "Error al intentar enviar el PDF.", "error");
    } finally {
      setEnviando(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="p-8">
        <p className="text-slate-600">No tenés acceso. Iniciá sesión.</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Caja diaria</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Ingresos y egresos — turno {turno === "MANANA" ? "mañana" : "tarde"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-500" />
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTurno("MANANA")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                turno === "MANANA"
                  ? "bg-amber-500 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Mañana
            </button>
            <button
              type="button"
              onClick={() => setTurno("TARDE")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                turno === "TARDE"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Tarde
            </button>
          </div>
          <button
            type="button"
            onClick={fetchResumen}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg disabled:opacity-50"
            title="Actualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center min-h-[300px]">
          <div className="w-10 h-10 border-2 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
        </div>
      ) : !resumen ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
          <Wallet className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 mb-2">No hay caja para esta fecha y turno.</p>
          <p className="text-slate-500 text-sm mb-6">Abrí la caja del turno seleccionado para registrar movimientos.</p>
          <button
            type="button"
            onClick={() => setModalAbrir(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" />
            Abrir caja
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Estado</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Turno:{" "}
                <span className="font-semibold text-slate-800">
                  {resumen.turno === "TARDE" ? "Tarde" : "Mañana"}
                </span>
              </p>
              <div className="flex items-center gap-2 mt-1">
                {resumen.estado === "ABIERTA" ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Abierta
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                    <Lock className="h-3.5 w-3.5" />
                    Cerrada
                  </span>
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Saldo inicial</p>
              <p className="text-lg font-semibold text-slate-900 mt-1">${Number(resumen.saldo_inicial).toLocaleString("es-AR")}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total ingresos</p>
              <p className="text-lg font-semibold text-emerald-600 mt-1 flex items-center gap-1">
                <ArrowDownCircle className="h-4 w-4" />
                ${Number(resumen.total_ingresos).toLocaleString("es-AR")}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total egresos</p>
              <p className="text-lg font-semibold text-rose-600 mt-1 flex items-center gap-1">
                <ArrowUpCircle className="h-4 w-4" />
                ${Number(resumen.total_egresos).toLocaleString("es-AR")}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Saldo final</p>
            <p className="text-2xl font-bold text-teal-600 mt-1">
              ${Number(resumen.saldo_final).toLocaleString("es-AR")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            {resumen.estado === "ABIERTA" && (
              <>
                <button
                  type="button"
                  onClick={handleCerrarCaja}
                  disabled={enviando}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  <Lock className="h-4 w-4" />
                  Cerrar caja
                </button>
                <button
                  type="button"
                  onClick={() => setModalEgreso(true)}
                  disabled={enviando}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 text-white text-sm font-medium rounded-lg hover:bg-rose-700 disabled:opacity-50"
                >
                  <MinusCircle className="h-4 w-4" />
                  Registrar egreso
                </button>
              </>
            )}
            {resumen.estado === "CERRADA" && (
              <button
                type="button"
                onClick={handleEnviarWhatsapp}
                disabled={enviando}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                <MessageCircle className="h-4 w-4" />
                {enviando ? "Enviando…" : "Enviar PDF por WhatsApp"}
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">Movimientos</h2>
              <p className="text-sm text-slate-500 mt-0.5">Historial del día</p>
            </div>
            <table className="table-professional">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Tipo</th>
                  <th>Origen</th>
                  <th className="whitespace-nowrap">Varios medios</th>
                  <th>Descripción</th>
                  <th className="text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {resumen.movimientos?.length > 0 ? (
                  resumen.movimientos.map((m) => {
                    const expandible = movimientoExpandibleMixto(m);
                    const abierto = expandible && movimientoExpandidoId === m.id;
                    return (
                      <React.Fragment key={m.id}>
                        <tr
                          className={
                            expandible
                              ? "cursor-pointer hover:bg-slate-50/80 transition-colors"
                              : undefined
                          }
                          onClick={() => {
                            if (!expandible) return;
                            setMovimientoExpandidoId((id) => (id === m.id ? null : m.id));
                          }}
                          title={expandible ? "Clic para ver medios de cobro" : undefined}
                        >
                          <td className="text-slate-600">{formatFechaHora(m.fecha_hora)}</td>
                          <td>
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                m.tipo === "INGRESO" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                              }`}
                            >
                              {m.tipo}
                            </span>
                          </td>
                          <td>{origenLabel(m.origen)}</td>
                          <td className="text-slate-600 text-sm">
                            {m.origen === "VENTA"
                              ? m.pago_mixto
                                ? "Sí"
                                : "No"
                              : "—"}
                          </td>
                          <td className="text-slate-600">
                            {descripcionCajaSinMedios(m.descripcion)}
                          </td>
                          <td className={`text-right font-medium ${m.tipo === "INGRESO" ? "text-emerald-600" : "text-rose-600"}`}>
                            {m.tipo === "INGRESO" ? "+" : "-"} ${Number(m.monto).toLocaleString("es-AR")}
                          </td>
                        </tr>
                        {abierto ? (
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <td colSpan={6} className="py-3 px-4 pl-10 text-sm text-slate-700">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                                Medios de cobro
                              </p>
                              <ul className="space-y-1.5">
                                {m.medios_pago.map((p, idx) => (
                                  <li key={idx} className="flex flex-wrap gap-x-2">
                                    <span className="font-medium text-slate-800">{p.metodo_pago}</span>
                                    <span className="text-slate-600">
                                      ${Number(p.monto).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6" className="text-center py-12 text-slate-500">
                      No hay movimientos registrados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal Abrir caja */}
      {modalAbrir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Abrir caja</h3>
            <p className="text-sm text-slate-500 mb-1">
              Turno: <span className="font-semibold text-slate-800">{turno === "MANANA" ? "Mañana" : "Tarde"}</span> — día {fecha}
            </p>
            <p className="text-sm text-slate-500 mb-1">Saldo inicial en caja</p>
            <p className="text-xs text-slate-400 mb-4">Podés usar 0 si no quedó efectivo de la noche anterior.</p>
            <form onSubmit={handleAbrirCaja}>
              <label className="block text-sm font-medium text-slate-700 mb-1">Saldo inicial ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={saldoInicial}
                onChange={(e) => setSaldoInicial(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm mb-4"
                placeholder="0 (vacío = 0)"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setModalAbrir(false); setSaldoInicial(""); }}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviando}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
                >
                  {enviando ? "Guardando…" : "Abrir caja"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Egreso manual */}
      {modalEgreso && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Registrar egreso</h3>
            <form onSubmit={handleEgresoManual}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Monto ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={egresoMonto}
                  onChange={(e) => setEgresoMonto(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm"
                  placeholder="0.00"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                <textarea
                  value={egresoDescripcion}
                  onChange={(e) => setEgresoDescripcion(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm resize-none"
                  rows="3"
                  placeholder="Ej: Pago de servicio, retiro, gasto..."
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setModalEgreso(false); setEgresoMonto(""); setEgresoDescripcion(""); }}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviando}
                  className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 disabled:opacity-50"
                >
                  {enviando ? "Guardando…" : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
