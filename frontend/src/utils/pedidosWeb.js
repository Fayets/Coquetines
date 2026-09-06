/**
 * Pedidos que llegan del catálogo público.
 * Un solo lugar para las llamadas y para el sondeo del aviso del sidebar.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_URL } from "./api";
import { getToken, getUser } from "./authStorage";

export const ESTADOS = ["NUEVO", "CONTACTADO", "CONFIRMADO", "CANCELADO"];

export const ETIQUETA_ESTADO = {
  NUEVO: "Nuevo",
  CONTACTADO: "Contactado",
  CONFIRMADO: "Confirmado",
  CANCELADO: "Cancelado",
};

/** Clases de color por estado, en la paleta del panel. */
export const COLOR_ESTADO = {
  NUEVO: "bg-amber-100 text-amber-800 border-amber-200",
  CONTACTADO: "bg-sky-100 text-sky-800 border-sky-200",
  CONFIRMADO: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CANCELADO: "bg-slate-100 text-slate-500 border-slate-200",
};

function cabeceras() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function listarPedidos({ estado, limite = 100 } = {}) {
  return axios
    .get(`${API_URL}/pedidos-web`, {
      headers: cabeceras(),
      params: { ...(estado && estado !== "TODOS" ? { estado } : {}), limite },
    })
    .then((r) => r.data);
}

export function cambiarEstadoPedido(id, estado, ventaId = null) {
  return axios
    .patch(
      `${API_URL}/pedidos-web/${id}`,
      { estado, ...(ventaId ? { venta_id: ventaId } : {}) },
      { headers: cabeceras() }
    )
    .then((r) => r.data);
}

/**
 * Borra un pedido. Si ya generó una venta hay que pasar eliminarVenta: recién
 * ahí se borra también esa venta, vuelve el stock y se revierte la caja.
 */
export function eliminarPedido(id, eliminarVenta = false) {
  return axios
    .delete(`${API_URL}/pedidos-web/${id}`, {
      headers: cabeceras(),
      params: eliminarVenta ? { eliminar_venta: true } : {},
    })
    .then((r) => r.data);
}

/** Datos del pedido resueltos contra el stock actual, para precargar la venta. */
export function pedidoParaVenta(id) {
  return axios
    .get(`${API_URL}/pedidos-web/${id}/para-venta`, { headers: cabeceras() })
    .then((r) => r.data);
}

export function contarPedidosNuevos() {
  return axios
    .get(`${API_URL}/pedidos-web/nuevos`, { headers: cabeceras() })
    .then((r) => Number(r.data?.nuevos) || 0);
}

/** Link de WhatsApp al teléfono que dejó la clienta. */
export function whatsappCliente(pedido) {
  const numero = (pedido.cliente_telefono || "").replace(/\D/g, "");
  if (!numero) return null;
  // Los teléfonos se cargan como los escribe la clienta (380 466 1203).
  // Si no trae el país, asumimos Argentina y el 9 de celular.
  const internacional = numero.startsWith("54") ? numero : `549${numero}`;
  const saludo =
    `¡Hola ${pedido.cliente_nombre.split(" ")[0]}! Te escribimos de Coquetines ` +
    `por tu pedido ${pedido.numero} 🤎`;
  return `https://wa.me/${internacional}?text=${encodeURIComponent(saludo)}`;
}

export function formatearFecha(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Sondeo del contador de pedidos nuevos para el aviso del sidebar.
 *
 * Es un GET que devuelve un solo número, así que se puede consultar seguido
 * sin costo. Se pausa cuando la pestaña está oculta para no golpear la API de
 * fondo, y se refresca al volver.
 */
export function usePedidosNuevos({ intervaloMs = 60000, habilitado = true } = {}) {
  const [nuevos, setNuevos] = useState(0);
  const montado = useRef(true);

  const refrescar = useCallback(() => {
    if (!habilitado || !getToken()) return;
    contarPedidosNuevos()
      .then((n) => montado.current && setNuevos(n))
      .catch(() => {
        /* silencioso: es un aviso, no puede romper la navegación */
      });
  }, [habilitado]);

  useEffect(() => {
    montado.current = true;
    if (!habilitado) return undefined;

    refrescar();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refrescar();
    }, intervaloMs);
    const alVolver = () => document.visibilityState === "visible" && refrescar();
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      montado.current = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [refrescar, intervaloMs, habilitado]);

  return { nuevos, refrescar };
}

/** La dueña y los usuarios de la tienda online pueden ver los pedidos. */
export function puedeVerPedidos(user = getUser()) {
  return user?.role === "OWNER" || user?.es_tienda_online === true;
}
