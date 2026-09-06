import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  Inbox,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  Receipt,
  RefreshCw,
  StickyNote,
  Trash2,
} from "lucide-react";
import Swal from "sweetalert2";
import useAuth from "../Hooks/useAuth";
import {
  COLOR_ESTADO,
  ESTADOS,
  ETIQUETA_ESTADO,
  cambiarEstadoPedido,
  eliminarPedido,
  formatearFecha,
  listarPedidos,
  pedidoParaVenta,
  whatsappCliente,
} from "../../utils/pedidosWeb";
import { formatPrecio } from "../../utils/tiendaWebPrecios";

const FILTROS = ["NUEVO", "CONTACTADO", "CONFIRMADO", "CANCELADO", "TODOS"];

/** Paso intermedio opcional: dejar registrado que ya se habló con la clienta. */
const MARCAR_CONTACTADA = { estado: "CONTACTADO", texto: "Marcar contactada" };

function Etiqueta({ estado }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        COLOR_ESTADO[estado] || COLOR_ESTADO.CANCELADO
      }`}
    >
      {ETIQUETA_ESTADO[estado] || estado}
    </span>
  );
}

function Pedido({ pedido, abierto, onAlternar, onEstado, onGenerarVenta, onEliminar, guardando }) {
  const wa = whatsappCliente(pedido);
  const esNuevo = pedido.estado === "NUEVO";
  const yaVendido = Boolean(pedido.venta_id);

  return (
    <div
      className={`rounded-xl border bg-white transition-shadow ${
        esNuevo ? "border-amber-300 shadow-sm" : "border-slate-200"
      }`}
    >
      <button
        type="button"
        onClick={onAlternar}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        {abierto ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{pedido.numero}</span>
            <Etiqueta estado={pedido.estado} />
            <span className="text-xs text-slate-400">{formatearFecha(pedido.fecha_hora)}</span>
          </div>
          <p className="mt-0.5 truncate text-sm text-slate-600">
            {pedido.cliente_nombre} · {pedido.cliente_telefono}
            {pedido.cliente_localidad ? ` · ${pedido.cliente_localidad}` : ""}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-semibold text-slate-900">{formatPrecio(pedido.total)}</p>
          <p className="text-xs text-slate-400">
            {pedido.cantidad_items} {pedido.cantidad_items === 1 ? "prenda" : "prendas"}
          </p>
        </div>
      </button>

      {abierto && (
        <div className="border-t border-slate-100 px-4 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-slate-400">
                <th className="pb-2 text-left font-semibold">Producto</th>
                <th className="pb-2 text-center font-semibold">Cant.</th>
                <th className="pb-2 text-right font-semibold">Unitario</th>
                <th className="pb-2 text-right font-semibold">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {pedido.items.map((i) => (
                <tr key={i.codigo + i.talle} className="border-t border-slate-100">
                  <td className="py-2">
                    <p className="text-slate-800">{i.nombre}</p>
                    <p className="text-xs text-slate-400">
                      {i.codigo}
                      {i.talle ? ` · Talle ${i.talle}` : ""}
                      {i.color ? ` · ${i.color}` : ""}
                    </p>
                  </td>
                  <td className="py-2 text-center text-slate-700">{i.cantidad}</td>
                  <td className="py-2 text-right text-slate-500">{formatPrecio(i.precio_unitario)}</td>
                  <td className="py-2 text-right font-medium text-slate-800">
                    {formatPrecio(i.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <Phone className="h-4 w-4 text-slate-400" />
              {pedido.cliente_telefono}
            </span>
            {pedido.cliente_localidad && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-slate-400" />
                {pedido.cliente_localidad}
              </span>
            )}
            {pedido.nota && (
              <span className="inline-flex items-start gap-1.5">
                <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span className="italic">{pedido.nota}</span>
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white no-underline hover:bg-emerald-700"
              >
                <MessageCircle className="h-4 w-4" />
                Escribirle por WhatsApp
              </a>
            )}

            {yaVendido ? (
              <a
                href={`/ventas/details/${pedido.venta_id}`}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 no-underline hover:bg-emerald-100"
              >
                <Receipt className="h-4 w-4" />
                Ver venta #{pedido.venta_id}
              </a>
            ) : (
              <button
                type="button"
                disabled={guardando}
                onClick={() => onGenerarVenta(pedido)}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {guardando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Receipt className="h-4 w-4" />
                )}
                Generar venta
              </button>
            )}

            {esNuevo && !yaVendido && (
              <button
                type="button"
                disabled={guardando}
                onClick={() => onEstado(pedido.id, MARCAR_CONTACTADA.estado)}
                className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {MARCAR_CONTACTADA.texto}
              </button>
            )}

            <select
              value={pedido.estado}
              disabled={guardando}
              onChange={(e) => onEstado(pedido.id, e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-50"
            >
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {ETIQUETA_ESTADO[e]}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={guardando}
              onClick={() => onEliminar(pedido)}
              className="ml-auto inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              title="Eliminar este pedido"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PedidosWeb() {
  const isAuthenticated = useAuth();
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState([]);
  const [conteos, setConteos] = useState({});
  const [filtro, setFiltro] = useState("NUEVO");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [expandido, setExpandido] = useState(null);
  const [guardando, setGuardando] = useState(null);

  const cargar = useCallback(
    (silencioso = false) => {
      if (!silencioso) setCargando(true);
      setError("");
      listarPedidos({ estado: filtro })
        .then((d) => {
          setPedidos(Array.isArray(d.pedidos) ? d.pedidos : []);
          setConteos(d.conteos || {});
        })
        .catch((err) => {
          const msg = err.response?.data?.detail;
          setError(typeof msg === "string" ? msg : "No se pudieron cargar los pedidos.");
          setPedidos([]);
        })
        .finally(() => setCargando(false));
    },
    [filtro]
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    cargar();
  }, [isAuthenticated, cargar]);

  // Refresco de fondo: si entra un pedido mientras la pantalla está abierta,
  // aparece solo. Se pausa con la pestaña oculta.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") cargar(true);
    }, 60000);
    return () => clearInterval(id);
  }, [isAuthenticated, cargar]);

  const cambiar = async (id, estado) => {
    setGuardando(id);
    try {
      const actualizado = await cambiarEstadoPedido(id, estado);
      setPedidos((previos) =>
        filtro === "TODOS" || actualizado.estado === filtro
          ? previos.map((p) => (p.id === id ? actualizado : p))
          : previos.filter((p) => p.id !== id)
      );
      setConteos((c) => {
        const anterior = pedidos.find((p) => p.id === id)?.estado;
        if (!anterior || anterior === estado) return c;
        return { ...c, [anterior]: (c[anterior] || 1) - 1, [estado]: (c[estado] || 0) + 1 };
      });
    } catch (err) {
      const msg = err.response?.data?.detail;
      Swal.fire("Error", typeof msg === "string" ? msg : "No se pudo actualizar el pedido.", "error");
    } finally {
      setGuardando(null);
    }
  };

  /**
   * Lleva el pedido a la pantalla de venta con las prendas ya cargadas.
   * Antes revisa el stock actual: entre que la clienta pidió y que se cierra
   * la venta, la última unidad se puede haber vendido en el local.
   */
  const generarVenta = async (pedido) => {
    setGuardando(pedido.id);
    try {
      const datos = await pedidoParaVenta(pedido.id);

      if (!datos.todo_disponible) {
        const faltan = datos.items
          .filter((i) => !i.disponible)
          .map((i) => `• ${i.nombre} (T${i.talle}) — pidió ${i.cantidad}, hay ${i.stock_actual}`)
          .join("<br>");
        const { isConfirmed } = await Swal.fire({
          icon: "warning",
          title: "Cambió el stock",
          html: `Desde que se hizo el pedido cambió la disponibilidad:<br><br>${faltan}<br><br>Podés seguir y ajustar las cantidades en la venta.`,
          showCancelButton: true,
          confirmButtonText: "Seguir igual",
          cancelButtonText: "Cancelar",
          confirmButtonColor: "#0d9488",
        });
        if (!isConfirmed) return;
      }

      navigate("/ventas/nueva", { state: { pedidoWeb: datos } });
    } catch (err) {
      const msg = err.response?.data?.detail;
      Swal.fire("Error", typeof msg === "string" ? msg : "No se pudo preparar la venta.", "error");
    } finally {
      setGuardando(null);
    }
  };

  const eliminar = async (pedido) => {
    const tieneVenta = Boolean(pedido.venta_id);
    const { isConfirmed } = await Swal.fire({
      icon: "warning",
      title: `¿Eliminar el pedido ${pedido.numero}?`,
      html: tieneVenta
        ? `Este pedido ya se cerró con la <strong>venta #${pedido.venta_id}</strong>.<br><br>` +
          `Si seguís se borra también esa venta: <strong>el stock vuelve</strong> y se ` +
          `revierte el ingreso de caja (si la caja del día sigue abierta).`
        : "El pedido se borra y no queda registro. No afecta el stock, porque un pedido sin venta nunca lo movió.",
      showCancelButton: true,
      confirmButtonText: tieneVenta ? "Eliminar pedido y venta" : "Eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626",
    });
    if (!isConfirmed) return;

    setGuardando(pedido.id);
    try {
      const r = await eliminarPedido(pedido.id, tieneVenta);
      setPedidos((previos) => previos.filter((p) => p.id !== pedido.id));
      setConteos((c) => ({ ...c, [pedido.estado]: Math.max(0, (c[pedido.estado] || 1) - 1) }));
      Swal.fire({ icon: "success", title: "Listo", text: r.message });
    } catch (err) {
      const msg = err.response?.data?.detail;
      Swal.fire("Error", typeof msg === "string" ? msg : "No se pudo eliminar el pedido.", "error");
    } finally {
      setGuardando(null);
    }
  };

  const totalMostrado = useMemo(
    () => pedidos.reduce((acc, p) => acc + (p.total || 0), 0),
    [pedidos]
  );

  if (!isAuthenticated) return null;

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Pedidos web</h1>
          <p className="mt-1 text-sm text-slate-500">
            Lo que llega del catálogo público. No mueve stock ni caja: cuando
            confirmás con la clienta, cargá la venta como siempre.
          </p>
        </div>
        <button
          type="button"
          onClick={() => cargar()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const activo = filtro === f;
          const cantidad = f === "TODOS"
            ? Object.values(conteos).reduce((a, b) => a + b, 0)
            : conteos[f] ?? 0;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                activo
                  ? "border-teal-600 bg-teal-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f === "TODOS" ? "Todos" : ETIQUETA_ESTADO[f]}
              <span className={activo ? "ml-1.5 opacity-80" : "ml-1.5 text-slate-400"}>
                {cantidad}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center gap-2 py-20 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando pedidos…
        </div>
      ) : pedidos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-20 text-center">
          <Inbox className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            {filtro === "NUEVO"
              ? "No hay pedidos nuevos por atender."
              : "No hay pedidos con este estado."}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            {pedidos.map((p) => (
              <Pedido
                key={p.id}
                pedido={p}
                abierto={expandido === p.id}
                onAlternar={() => setExpandido(expandido === p.id ? null : p.id)}
                onEstado={cambiar}
                onGenerarVenta={generarVenta}
                onEliminar={eliminar}
                guardando={guardando === p.id}
              />
            ))}
          </div>
          <p className="mt-4 text-right text-sm text-slate-500">
            {pedidos.length} {pedidos.length === 1 ? "pedido" : "pedidos"} ·{" "}
            <span className="font-medium text-slate-700">{formatPrecio(totalMostrado)}</span>
          </p>
        </>
      )}
    </div>
  );
}
