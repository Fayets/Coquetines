import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import { Building2, CalendarRange, Check, RefreshCw, Search } from "lucide-react";
import { getUser, getToken, getSucursalId } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";

function precioUnitarioVenta(product, metodoPago) {
  if (metodoPago === "Efectivo" || metodoPago === "Transferencia") {
    return Number(product.precio_et ?? product.precio_venta ?? 0);
  }
  return Number(product.precio_venta ?? product.precio_et ?? 0);
}

function clampCantDevolver(raw, max) {
  const m = Math.max(1, parseInt(max, 10) || 1);
  const n = parseInt(String(raw).replace(/\D/g, ""), 10);
  if (Number.isNaN(n)) return 1;
  return Math.min(m, Math.max(1, n));
}

function clampCantEntregar(raw, stockMax) {
  const m = Math.max(0, parseInt(stockMax, 10) || 0);
  if (m < 1) return 1;
  const n = parseInt(String(raw).replace(/\D/g, ""), 10);
  if (Number.isNaN(n)) return 1;
  return Math.min(m, Math.max(1, n));
}

/** Fecha local YYYY-MM-DD */
function localYMD(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymdDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localYMD(d);
}

/** Suma días a una fecha YYYY-MM-DD (calendario local). */
function ymdAddDays(ymdStr, delta) {
  if (!ymdStr || ymdStr.length < 10) return localYMD();
  const [y, m, d] = ymdStr.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return localYMD(dt);
}

/** Normaliza fecha de venta del API a YYYY-MM-DD */
function fechaVentaYMD(v) {
  if (!v) return "";
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function nuevoBloqueCambio() {
  const uid =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `b-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return { uid, lineaId: "", cantDev: 1, prodNuevo: null, cantNueva: 1 };
}

/** Cantidad máxima devolvible en un bloque, restando lo asignado a otros bloques en la misma línea. */
function maxDevolverBloque(b, todos, ventaSel) {
  if (!ventaSel || !b.lineaId) return 0;
  const line = ventaSel.productos.find((x) => String(x.id) === String(b.lineaId));
  if (!line) return 0;
  const base = Number(line.cantidad) || 0;
  let usadoOtros = 0;
  for (const o of todos) {
    if (o.uid === b.uid) continue;
    if (String(o.lineaId) !== String(b.lineaId)) continue;
    usadoOtros += clampCantDevolver(o.cantDev === "" ? 1 : o.cantDev, base);
  }
  return Math.max(0, base - usadoOtros);
}

function valorUnitarioLineaVenta(ln) {
  if (!ln?.cantidad) return 0;
  return Number(ln.subtotal) / Number(ln.cantidad);
}

/** Valor monetario de lo que el cliente devuelve en este bloque (aunque falte el reemplazo). */
function calcValorDevueltoBloque(b, ventaSel, bloquesCambio) {
  if (!ventaSel?.productos) return 0;
  const ln = ventaSel.productos.find((x) => String(x.id) === String(b.lineaId));
  if (!ln) return 0;
  const maxD = maxDevolverBloque(b, bloquesCambio, ventaSel);
  if (maxD < 1) return 0;
  const cde = clampCantDevolver(b.cantDev === "" ? 1 : b.cantDev, maxD);
  const u = valorUnitarioLineaVenta(ln);
  return Math.round(u * cde * 100) / 100;
}

function pruneBloquesVacios(arr) {
  return arr.filter((b) => (b.lineaId && String(b.lineaId) !== "") || b.prodNuevo != null);
}

/** Stock disponible para entregar en este bloque, descontando bloques anteriores con el mismo producto. */
function stockVirtualBloque(bloque, bloquesCambio, productos) {
  if (!bloque?.prodNuevo) return 0;
  const pid = bloque.prodNuevo.id;
  const stockMap = {};
  productos.forEach((p) => {
    stockMap[p.id] = Number(p.stock) || 0;
  });
  const idx = bloquesCambio.findIndex((b) => b.uid === bloque.uid);
  if (idx < 0) return 0;
  for (let j = 0; j < idx; j++) {
    const o = bloquesCambio[j];
    if (!o.prodNuevo || o.prodNuevo.id !== pid) continue;
    const maxS = stockMap[pid] ?? 0;
    const cne = clampCantEntregar(o.cantNueva === "" ? 1 : o.cantNueva, Math.max(1, maxS));
    stockMap[pid] = Math.max(0, (stockMap[pid] ?? 0) - cne);
  }
  return (stockMap[pid] ?? Number(bloque.prodNuevo.stock)) || 0;
}

/**
 * Arma ítems para POST /cambios/registrar-lote y filas de resumen.
 * Soporta varias devoluciones + un solo producto de reemplazo (reparto contable, un solo descuento de stock).
 */
function computeRegistroLote(bloquesCambio, ventaSel, productos) {
  const vacio = {
    items: null,
    filas: [],
    todoCompleto: false,
    requiereMetodo: false,
    totalDev: 0,
    totalNuevo: 0,
    diff: 0,
    esMultiplesUnaEntrega: false,
  };
  if (!ventaSel?.productos) return vacio;

  const conLinea = bloquesCambio.filter((b) => b.lineaId);
  if (!conLinea.length) return vacio;

  const soloLinea = conLinea.filter((b) => !b.prodNuevo);
  const conProd = conLinea.filter((b) => b.prodNuevo);
  const pids = [...new Set(conProd.map((b) => b.prodNuevo.id))];

  if (soloLinea.length > 0 && pids.length === 1 && conProd.length >= 1) {
    const pid = pids[0];
    const prodRef = conProd.find((b) => b.prodNuevo.id === pid).prodNuevo;

    const stockMap0 = {};
    productos.forEach((p) => {
      stockMap0[p.id] = Number(p.stock) || 0;
    });
    let totalCantOut = 0;
    let falloEnt = false;
    for (const b of conProd) {
      if (b.prodNuevo.id !== pid) {
        falloEnt = true;
        break;
      }
      const st = stockMap0[pid] ?? 0;
      if (st < 1) {
        falloEnt = true;
        break;
      }
      const cne = clampCantEntregar(b.cantNueva === "" ? 1 : b.cantNueva, Math.max(1, st));
      if (cne < 1 || cne > st) {
        falloEnt = true;
        break;
      }
      stockMap0[pid] = st - cne;
      totalCantOut += cne;
    }
    if (falloEnt || totalCantOut < 1) return vacio;

    const unitN = precioUnitarioVenta(prodRef, ventaSel.metodo_pago);
    const valEntregaTotal = Math.round(unitN * totalCantOut * 100) / 100;

    const ordenados = bloquesCambio.filter((b) => b.lineaId);
    const filasData = [];
    let yaDescontóStock = false;
    let incomplete = false;

    for (const b of ordenados) {
      const ln = ventaSel.productos.find((x) => String(x.id) === String(b.lineaId));
      if (!ln) {
        incomplete = true;
        break;
      }
      const maxD = maxDevolverBloque(b, bloquesCambio, ventaSel);
      const cde = clampCantDevolver(b.cantDev === "" ? 1 : b.cantDev, maxD);
      if (cde < 1 || maxD < 1) {
        incomplete = true;
        break;
      }
      const unitDev = ln.cantidad ? Number(ln.subtotal) / Number(ln.cantidad) : 0;
      const valDev = Math.round(unitDev * cde * 100) / 100;

      const tieneProd = b.prodNuevo?.id === pid;
      let cantNueva = 0;
      if (tieneProd && !yaDescontóStock) {
        const stVirt = stockVirtualBloque(b, bloquesCambio, productos);
        const cne = clampCantEntregar(b.cantNueva === "" ? 1 : b.cantNueva, Math.max(1, stVirt));
        if (cne >= 1 && cne <= stVirt) {
          cantNueva = cne;
          yaDescontóStock = true;
        } else {
          incomplete = true;
          break;
        }
      }

      filasData.push({ b, ln, cde, valDev, cantNueva });
    }

    if (incomplete || !yaDescontóStock || filasData.length !== ordenados.length) return vacio;

    const totalDev = Math.round(filasData.reduce((s, x) => s + x.valDev, 0) * 100) / 100;
    const ratio = totalDev > 0.005 ? valEntregaTotal / totalDev : 1;
    let sumAsignado = 0;
    const filas = [];
    const items = [];

    filasData.forEach((x, i) => {
      const isLast = i === filasData.length - 1;
      const valN = isLast
        ? Math.round((valEntregaTotal - sumAsignado) * 100) / 100
        : Math.round(x.valDev * ratio * 100) / 100;
      if (!isLast) sumAsignado += valN;
      const diffF = Math.round((valN - x.valDev) * 100) / 100;
      items.push({
        venta_producto_id: Number(x.ln.id),
        cantidad_devuelta: x.cde,
        producto_nuevo_id: pid,
        cantidad_nueva: x.cantNueva,
        valor_nuevo: valN,
      });
      filas.push({
        uid: x.b.uid,
        ln: x.ln,
        prod: prodRef,
        cde: x.cde,
        cne: x.cantNueva,
        valDev: x.valDev,
        valN,
        diff: diffF,
      });
    });

    const totalNuevo = valEntregaTotal;
    const diff = Math.round((totalNuevo - totalDev) * 100) / 100;
    const requiereMetodo = filas.some((f) => f.diff > 0.005);

    return {
      items,
      filas,
      todoCompleto: true,
      requiereMetodo,
      totalDev,
      totalNuevo,
      diff,
      esMultiplesUnaEntrega: true,
    };
  }

  const stockMap = {};
  productos.forEach((p) => {
    stockMap[p.id] = Number(p.stock) || 0;
  });
  const filas = [];
  let incomplete = false;
  for (const b of bloquesCambio) {
    if (!b.lineaId) {
      if (b.prodNuevo) incomplete = true;
      continue;
    }
    const ln = ventaSel.productos.find((x) => String(x.id) === String(b.lineaId));
    if (!ln || !b.prodNuevo) {
      incomplete = true;
      continue;
    }
    const maxD = maxDevolverBloque(b, bloquesCambio, ventaSel);
    const cde = clampCantDevolver(b.cantDev === "" ? 1 : b.cantDev, maxD);
    const pid = b.prodNuevo.id;
    const st = stockMap[pid] ?? 0;
    if (cde < 1 || maxD < 1) {
      incomplete = true;
      continue;
    }
    const cne = clampCantEntregar(b.cantNueva === "" ? 1 : b.cantNueva, Math.max(1, st));
    if (cne < 1 || cne > st) {
      incomplete = true;
      continue;
    }
    stockMap[pid] = st - cne;
    const unitDev = ln.cantidad ? Number(ln.subtotal) / Number(ln.cantidad) : 0;
    const valDev = Math.round(unitDev * cde * 100) / 100;
    const unitNv = precioUnitarioVenta(b.prodNuevo, ventaSel.metodo_pago);
    const valN = Math.round(unitNv * cne * 100) / 100;
    const diffF = Math.round((valN - valDev) * 100) / 100;
    filas.push({ uid: b.uid, ln, prod: b.prodNuevo, cde, cne, valDev, valN, diff: diffF });
  }

  const conLineaIds = bloquesCambio.filter((b) => b.lineaId);
  const todoCompleto =
    !incomplete && filas.length === conLineaIds.length && conLineaIds.length > 0;
  const totalDev = Math.round(filas.reduce((s, f) => s + f.valDev, 0) * 100) / 100;
  const totalNuevo = Math.round(filas.reduce((s, f) => s + f.valN, 0) * 100) / 100;
  const diff = Math.round((totalNuevo - totalDev) * 100) / 100;
  const requiereMetodo = filas.some((f) => f.diff > 0.005);

  const items = todoCompleto
    ? filas.map((f) => ({
        venta_producto_id: Number(f.ln.id),
        cantidad_devuelta: f.cde,
        producto_nuevo_id: f.prod.id,
        cantidad_nueva: f.cne,
      }))
    : null;

  return {
    items,
    filas,
    todoCompleto,
    requiereMetodo,
    totalDev,
    totalNuevo,
    diff,
    esMultiplesUnaEntrega: false,
  };
}

function fmtMoney(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return "$0";
  return `$${x.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Pesos con miles en punto (locale es-AR); evita toLocaleString() sin locale que en muchos navegadores usa coma tipo US. */
function fmtPeso(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return "$0";
  return `$${x.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function CambioProducto() {
  const token = getToken();
  const user = getUser();
  const esOwner = user.role === "OWNER";

  const [sucursales, setSucursales] = useState([]);
  const [sucursalFiltro, setSucursalFiltro] = useState(esOwner ? "" : String(getSucursalId() ?? ""));
  const [ventas, setVentas] = useState([]);
  const [ventaSel, setVentaSel] = useState(null);
  const [bloquesCambio, setBloquesCambio] = useState(() => []);
  const [productos, setProductos] = useState([]);
  const [buscarProd, setBuscarProd] = useState("");
  const [buscarLinea, setBuscarLinea] = useState("");
  const [metodoSup, setMetodoSup] = useState("Efectivo");
  const [loading, setLoading] = useState(false);
  const [loadingVentas, setLoadingVentas] = useState(false);
  /** 'dia' = solo ventas de fechaDiaExacta; 'rango' = entre fechaDesde y fechaHasta */
  const [modoFechaVenta, setModoFechaVenta] = useState("dia");
  const [fechaDiaExacta, setFechaDiaExacta] = useState(() => localYMD());
  const [fechaDesde, setFechaDesde] = useState(() => ymdDaysAgo(30));
  const [fechaHasta, setFechaHasta] = useState(() => localYMD());
  const [buscarVenta, setBuscarVenta] = useState("");
  const [pageVentas, setPageVentas] = useState(1);
  const ventasPorPagina = 5;

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
    if (!token) return;
    if (esOwner && !sucursalFiltro) {
      setVentas([]);
      setVentaSel(null);
      setBloquesCambio([]);
      return;
    }
    setLoadingVentas(true);
    const q = sidEfectivo != null ? `?sucursal_id=${sidEfectivo}` : "";
    axios
      .get(`${API_URL}/ventas/all${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        const data = Array.isArray(r.data) ? r.data : [];
        setVentas([...data].reverse());
      })
      .catch(() => setVentas([]))
      .finally(() => setLoadingVentas(false));
  }, [token, esOwner, sucursalFiltro, sidEfectivo]);

  useEffect(() => {
    if (!token || sidEfectivo == null) {
      setProductos([]);
      return;
    }
    const url = `${API_URL}/products/all?sucursal_id=${sidEfectivo}`;
    axios
      .get(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setProductos(Array.isArray(r.data) ? r.data : []))
      .catch(() => setProductos([]));
  }, [token, sidEfectivo]);

  const registroLote = useMemo(
    () => computeRegistroLote(bloquesCambio, ventaSel, productos),
    [bloquesCambio, ventaSel, productos]
  );

  /** Totales en vivo: se actualizan al elegir líneas y/o reemplazos (no hace falta tener el par completo). */
  const totalesEnVivo = useMemo(() => {
    if (!ventaSel) {
      return {
        totalDevuelto: 0,
        totalEntrega: 0,
        saldo: 0,
        pendienteCompensar: 0,
      };
    }
    let totalDevuelto = 0;
    for (const b of bloquesCambio) {
      totalDevuelto += calcValorDevueltoBloque(b, ventaSel, bloquesCambio);
    }
    totalDevuelto = Math.round(totalDevuelto * 100) / 100;

    const stockMap = {};
    productos.forEach((p) => {
      stockMap[p.id] = Number(p.stock) || 0;
    });
    let totalEntrega = 0;
    for (const b of bloquesCambio) {
      if (!b.prodNuevo) continue;
      const pid = b.prodNuevo.id;
      const st = stockMap[pid] ?? 0;
      if (st < 1) continue;
      const cne = clampCantEntregar(b.cantNueva === "" ? 1 : b.cantNueva, Math.max(1, st));
      if (cne < 1 || cne > st) continue;
      const unitN = precioUnitarioVenta(b.prodNuevo, ventaSel.metodo_pago);
      totalEntrega += Math.round(unitN * cne * 100) / 100;
      stockMap[pid] = st - cne;
    }
    totalEntrega = Math.round(totalEntrega * 100) / 100;
    const saldo = Math.round((totalEntrega - totalDevuelto) * 100) / 100;
    const pendienteCompensar = Math.round((totalDevuelto - totalEntrega) * 100) / 100;
    return { totalDevuelto, totalEntrega, saldo, pendienteCompensar };
  }, [bloquesCambio, ventaSel, productos]);

  const ventasFiltradas = useMemo(() => {
    const q = buscarVenta.trim().toLowerCase();
    const dia = (fechaDiaExacta || "").trim().slice(0, 10);
    const desde = (fechaDesde || "").trim();
    const hasta = (fechaHasta || "").trim();

    return ventas.filter((v) => {
      const fv = fechaVentaYMD(v.fecha);
      if (modoFechaVenta === "dia") {
        if (dia && fv && fv !== dia) return false;
        if (dia && !fv) return false;
      } else {
        if (desde && fv && fv < desde) return false;
        if (hasta && fv && fv > hasta) return false;
      }
      if (!q) return true;
      const blob = [
        v.id,
        v.cliente,
        v.fecha,
        v.metodo_pago,
        v.total != null ? String(v.total) : "",
        v.sucursal_nombre,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [ventas, modoFechaVenta, fechaDiaExacta, fechaDesde, fechaHasta, buscarVenta]);

  const totalPaginasVentas = Math.max(1, Math.ceil(ventasFiltradas.length / ventasPorPagina));
  const paginaVentasSegura = Math.min(Math.max(1, pageVentas), totalPaginasVentas);
  const ventasPagina = ventasFiltradas.slice(
    (paginaVentasSegura - 1) * ventasPorPagina,
    paginaVentasSegura * ventasPorPagina
  );

  useEffect(() => {
    setPageVentas((p) => Math.min(Math.max(1, p), totalPaginasVentas));
  }, [totalPaginasVentas]);

  useEffect(() => {
    setPageVentas(1);
  }, [modoFechaVenta, fechaDiaExacta, fechaDesde, fechaHasta, buscarVenta, sucursalFiltro, sidEfectivo]);

  useEffect(() => {
    if (!ventaSel) return;
    const ok = ventasFiltradas.some((v) => String(v.id) === String(ventaSel.id));
    if (!ok) {
      setVentaSel(null);
      setBloquesCambio([]);
      setBuscarLinea("");
    }
  }, [ventasFiltradas, ventaSel]);

  const lineasFiltradas = useMemo(() => {
    const list = ventaSel?.productos || [];
    const t = buscarLinea.trim().toLowerCase();
    if (!t) return list;
    return list.filter(
      (p) =>
        String(p.codigo || "")
          .toLowerCase()
          .includes(t) ||
        String(p.nombre || "")
          .toLowerCase()
          .includes(t)
    );
  }, [ventaSel, buscarLinea]);

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

  const submit = async (e) => {
    e.preventDefault();
    if (esOwner && !sucursalFiltro) {
      Swal.fire("Sucursal", "Seleccioná la sucursal del cambio.", "warning");
      return;
    }
    if (!ventaSel) {
      Swal.fire("Venta", "Seleccioná una venta.", "warning");
      return;
    }
    if (!registroLote.todoCompleto) {
      Swal.fire(
        "Cambio",
        "Marcá al menos una devolución y un reemplazo, y completá las cantidades en cada fila del resumen intermedio.",
        "warning"
      );
      return;
    }
    if (registroLote.requiereMetodo && !metodoSup) {
      Swal.fire("Cobro", "Indicá cómo se cobra el suplemento (Efectivo / Transferencia).", "warning");
      return;
    }

    const body = {
      venta_id: ventaSel.id,
      items: registroLote.items,
      metodo_pago_suplemento: registroLote.requiereMetodo ? metodoSup : null,
    };
    if (esOwner) body.sucursal_id = Number(sucursalFiltro);

    setLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/ventas/cambios/registrar-lote`, body, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const notasIds = [
        ...new Set((data.items || []).map((i) => i.nota_credito_id).filter(Boolean)),
      ];
      if (notasIds.length > 0) {
        const montosPorNota = new Map();
        for (const it of data.items || []) {
          const nid = it.nota_credito_id;
          if (nid == null) continue;
          const d = Number(it.diferencia_monto);
          if (!Number.isFinite(d) || d >= -0.005) continue;
          const acum = (montosPorNota.get(nid) || 0) + Math.abs(d);
          montosPorNota.set(nid, Math.round(acum * 100) / 100);
        }
        const bloquesNotas = notasIds
          .map((nid) => {
            const m = montosPorNota.get(nid);
            const montoTxt = m != null && m > 0 ? fmtMoney(m) : "";
            const linea = montoTxt ? `NOTA #${nid} ${montoTxt}` : `NOTA #${nid}`;
            return `<div style="margin:0.35rem 0">${linea}</div>`;
          })
          .join("");
        await Swal.fire({
          title: "Cambios registrados",
          html: `<div style="text-transform:uppercase;font-weight:700;font-size:1.05rem;letter-spacing:0.04em;color:#0f172a;line-height:1.35;margin:0.5rem 0 1rem">${bloquesNotas}</div><p style="margin:0;font-size:0.95rem;color:#64748b">¿Descargar ${notasIds.length === 1 ? "la nota de crédito" : "las notas de crédito"}?</p>`,
          icon: "success",
          showCancelButton: true,
          confirmButtonText: "Descargar PDF",
          cancelButtonText: "Cerrar",
        }).then((r) => {
          if (r.isConfirmed) notasIds.forEach((id) => descargarNota(id));
        });
      } else {
        Swal.fire({ title: "Cambios registrados", text: data.message, icon: "success" });
      }
      setVentaSel(null);
      setBloquesCambio([]);
      setBuscarLinea("");
      setBuscarVenta("");
      const q = sidEfectivo != null ? `?sucursal_id=${sidEfectivo}` : "";
      const vr = await axios.get(`${API_URL}/ventas/all${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVentas(Array.isArray(vr.data) ? [...vr.data].reverse() : []);
      const pr = await axios.get(`${API_URL}/products/all?sucursal_id=${sidEfectivo}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProductos(Array.isArray(pr.data) ? pr.data : []);
    } catch (err) {
      const d = err.response?.data?.detail;
      const msg = typeof d === "string" ? d : err.response?.data?.message || "No se pudo registrar el cambio.";
      Swal.fire("Error", msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const productosFiltrados = useMemo(() => {
    const t = buscarProd.trim().toLowerCase();
    if (!t) return productos.slice(0, 150);
    return productos
      .filter(
        (p) =>
          (p.nombre || "").toLowerCase().includes(t) ||
          String(p.codigo || "")
            .toLowerCase()
            .includes(t) ||
          String(p.talle || "")
            .toLowerCase()
            .includes(t)
      )
      .slice(0, 150);
  }, [productos, buscarProd]);

  const patchBloque = (uid, patch) => {
    setBloquesCambio((prev) => prev.map((b) => (b.uid === uid ? { ...b, ...patch } : b)));
  };

  const seleccionarVentaPorId = (id) => {
    const v = ventas.find((x) => String(x.id) === String(id)) || null;
    setVentaSel(v);
    setBloquesCambio([]);
    setBuscarLinea("");
  };

  const pasarABusquedaPorRango = () => {
    const ref = (fechaDiaExacta || "").trim().slice(0, 10) || localYMD();
    setFechaHasta(ref);
    setFechaDesde(ymdAddDays(ref, -30));
    setModoFechaVenta("rango");
    setPageVentas(1);
  };

  const volverABusquedaPorDia = () => {
    const ref = (fechaHasta || "").trim().slice(0, 10) || localYMD();
    setFechaDiaExacta(ref);
    setModoFechaVenta("dia");
    setPageVentas(1);
  };

  /** Segundo toque en la misma línea saca la última fila que la usaba (par completo o incompleto). */
  const toggleLinea = (p) => {
    const id = String(p.id);
    setBloquesCambio((prev) => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (String(prev[i].lineaId || "") === id) {
          idx = i;
          break;
        }
      }
      if (idx >= 0) {
        return pruneBloquesVacios(prev.filter((_, i) => i !== idx));
      }
      const hole = prev.findIndex((b) => !b.lineaId || String(b.lineaId) === "");
      if (hole >= 0) {
        return prev.map((b, i) => (i === hole ? { ...b, lineaId: id, cantDev: 1 } : b));
      }
      return [...prev, { ...nuevoBloqueCambio(), lineaId: id, cantDev: 1 }];
    });
  };

  /** Segundo toque en el mismo producto quita ese reemplazo (última fila que lo tenía). */
  const toggleProducto = (prod) => {
    if (sidEfectivo == null) return;
    setBloquesCambio((prev) => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].prodNuevo?.id === prod.id) {
          idx = i;
          break;
        }
      }
      if (idx >= 0) {
        const next = prev.map((b, i) => (i === idx ? { ...b, prodNuevo: null, cantNueva: 1 } : b));
        return pruneBloquesVacios(next);
      }
      const hole = prev.findIndex((b) => !b.prodNuevo);
      if (hole >= 0) {
        return prev.map((b, i) => (i === hole ? { ...b, prodNuevo: prod, cantNueva: 1 } : b));
      }
      return [...prev, { ...nuevoBloqueCambio(), prodNuevo: prod, cantNueva: 1 }];
    });
  };

  const bloquesConLineaVenta = (lineaId) => {
    if (lineaId == null || lineaId === "") return [];
    return bloquesCambio
      .map((b, idx) => ({ b, idx }))
      .filter(({ b }) => String(b.lineaId) === String(lineaId));
  };

  const bloquesConProductoReemplazo = (productoId) => {
    if (productoId == null) return [];
    return bloquesCambio
      .map((b, idx) => ({ b, idx }))
      .filter(({ b }) => b.prodNuevo && b.prodNuevo.id === productoId);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2 mb-1">
        <RefreshCw className="h-7 w-7 text-violet-600 shrink-0" />
        Cambio de producto
      </h1>
      <p className="text-slate-500 text-sm mb-6">
        Elegí la venta y tocá las filas para <strong>marcar o desmarcar</strong> devoluciones y reemplazos. En el
        resumen de abajo ves los ítems y una línea chica con devolución, entrega y diferencia.
      </p>

      <form onSubmit={submit}>
        {esOwner && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                <Building2 className="h-4 w-4" />
                Sucursal del cambio
              </label>
              <select
                required
                value={sucursalFiltro}
                onChange={(e) => {
                  setSucursalFiltro(e.target.value);
                  setVentaSel(null);
                  setBloquesCambio([]);
                  setBuscarLinea("");
                  setBuscarVenta("");
                }}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white"
              >
                <option value="">Elegí sucursal…</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-start gap-2">
            <CalendarRange className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Buscar venta</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Primero elegí un día exacto. Si no aparece la venta, pasá a buscar entre dos fechas. Listado de 5 por
                página.
              </p>
            </div>
          </div>
          <div className="p-4 space-y-4">
            {loadingVentas ? (
              <p className="text-sm text-slate-500">Cargando ventas…</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {modoFechaVenta === "dia" ? (
                    <button
                      type="button"
                      onClick={pasarABusquedaPorRango}
                      className="text-xs text-violet-700 hover:text-violet-900 font-medium"
                    >
                      Buscar por rango de fechas
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={volverABusquedaPorDia}
                      className="text-xs text-violet-700 hover:text-violet-900 font-medium"
                    >
                      Volver a un día exacto
                    </button>
                  )}
                </div>

                {modoFechaVenta === "dia" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Día de la venta</label>
                      <input
                        type="date"
                        value={fechaDiaExacta}
                        onChange={(e) => setFechaDiaExacta(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white"
                        disabled={esOwner && !sucursalFiltro}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Buscar en resultados</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          value={buscarVenta}
                          onChange={(e) => setBuscarVenta(e.target.value)}
                          placeholder="Nº venta, cliente, método de pago, total…"
                          className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
                          disabled={esOwner && !sucursalFiltro}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Fecha desde</label>
                      <input
                        type="date"
                        value={fechaDesde}
                        onChange={(e) => setFechaDesde(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white"
                        disabled={esOwner && !sucursalFiltro}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Fecha hasta</label>
                      <input
                        type="date"
                        value={fechaHasta}
                        onChange={(e) => setFechaHasta(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white"
                        disabled={esOwner && !sucursalFiltro}
                      />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Buscar en resultados</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          value={buscarVenta}
                          onChange={(e) => setBuscarVenta(e.target.value)}
                          placeholder="Nº venta, cliente, método de pago, total…"
                          className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
                          disabled={esOwner && !sucursalFiltro}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  {esOwner && !sucursalFiltro ? (
                    <p className="p-4 text-sm text-slate-500">Elegí sucursal para listar ventas.</p>
                  ) : ventasFiltradas.length === 0 ? (
                    <div className="p-4 text-sm text-slate-500 space-y-3">
                      <p>
                        {modoFechaVenta === "dia"
                          ? `No hay ventas el ${new Date((fechaDiaExacta || localYMD()) + "T12:00:00").toLocaleDateString("es-AR")}`
                          : "No hay ventas en el rango de fechas"}
                        {buscarVenta.trim() ? " que coincidan con la búsqueda" : ""}.
                      </p>
                      {modoFechaVenta === "dia" && !buscarVenta.trim() ? (
                        <button
                          type="button"
                          onClick={pasarABusquedaPorRango}
                          className="text-sm font-medium text-violet-700 hover:text-violet-900 underline"
                        >
                          Buscar entre dos fechas (30 días hasta el día elegido)
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left py-2 px-3 font-medium text-slate-600">Nº</th>
                          <th className="text-left py-2 px-3 font-medium text-slate-600">Fecha</th>
                          <th className="text-left py-2 px-3 font-medium text-slate-600">Cliente</th>
                          <th className="text-right py-2 px-3 font-medium text-slate-600">Total</th>
                          <th className="text-left py-2 px-3 font-medium text-slate-600">Pago</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ventasPagina.map((v) => {
                          const sel = ventaSel && String(ventaSel.id) === String(v.id);
                          return (
                            <tr
                              key={v.id}
                              onClick={() => seleccionarVentaPorId(v.id)}
                              className={`border-b border-slate-100 cursor-pointer transition-colors ${
                                sel ? "bg-violet-50 hover:bg-violet-50" : "hover:bg-slate-50"
                              }`}
                            >
                              <td className="py-2 px-3 font-mono font-medium text-slate-900">#{v.id}</td>
                              <td className="py-2 px-3 text-slate-700 whitespace-nowrap">
                                {v.fecha
                                  ? new Date(fechaVentaYMD(v.fecha) + "T12:00:00").toLocaleDateString("es-AR")
                                  : "—"}
                              </td>
                              <td className="py-2 px-3 text-slate-800 max-w-[200px] truncate" title={v.cliente}>
                                {v.cliente}
                              </td>
                              <td className="py-2 px-3 text-right font-medium">{fmtPeso(v.total)}</td>
                              <td className="py-2 px-3 text-slate-600">{v.metodo_pago}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {ventasFiltradas.length > 0 ? (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="text-xs text-slate-500">
                      {ventasFiltradas.length} venta{ventasFiltradas.length !== 1 ? "s" : ""}{" "}
                      {modoFechaVenta === "dia" ? "ese día" : "en el rango"}
                      {buscarVenta.trim() ? " (texto)" : ""}
                      {ventaSel ? ` · seleccionada: #${ventaSel.id}` : ""}
                      {" · "}
                      página {paginaVentasSegura} de {totalPaginasVentas}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={paginaVentasSegura <= 1}
                        onClick={() => setPageVentas((p) => Math.max(1, p - 1))}
                        className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        disabled={paginaVentasSegura >= totalPaginasVentas}
                        onClick={() => setPageVentas((p) => Math.min(totalPaginasVentas, p + 1))}
                        className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Panel devolución — estilo similar a transferencia (tabla + búsqueda) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[320px]">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
              <span className="text-sm font-medium text-slate-800">1. Líneas de la venta — qué se devuelve</span>
              <p className="text-xs text-slate-500 mt-0.5">
                <strong>Tocá para marcar</strong> lo que devuelve el cliente; <strong>tocá de nuevo</strong> para sacar la
                última fila que usaba esa línea. Podés combinar varias devoluciones con <strong>un solo</strong> producto
                nuevo si el total coincide (ej. dos remeras por una).
              </p>
            </div>
            {!ventaSel ? (
              <p className="p-4 text-slate-500 text-sm">Primero elegí una venta arriba.</p>
            ) : (
              <>
                <div className="p-3 border-b border-slate-100 flex items-center gap-2">
                  <Search className="h-4 w-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Buscar por código o nombre en esta venta"
                    className="flex-1 border-0 bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:ring-0"
                    value={buscarLinea}
                    onChange={(e) => setBuscarLinea(e.target.value)}
                  />
                </div>
                <div className="overflow-auto max-h-[380px] flex-1">
                  {lineasFiltradas.length === 0 ? (
                    <p className="p-4 text-slate-500 text-sm">Ninguna línea coincide con la búsqueda.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="w-11 py-2 pl-2 pr-0 font-medium text-slate-600 text-center" title="En el cambio">
                            ✓
                          </th>
                          <th className="text-left py-2 px-2 font-medium text-slate-600">Código</th>
                          <th className="text-left py-2 px-2 font-medium text-slate-600">Producto</th>
                          <th className="text-right py-2 px-2 font-medium text-slate-600">Cant.</th>
                          <th className="text-right py-2 px-2 font-medium text-slate-600">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineasFiltradas.map((p) => {
                          const enCambio = bloquesConLineaVenta(p.id);
                          return (
                            <tr
                              key={p.id}
                              onClick={() => toggleLinea(p)}
                              className={`border-b border-slate-100 cursor-pointer transition-all select-none ${
                                enCambio.length > 0
                                  ? "border-l-[3px] border-l-violet-500 bg-violet-50/90"
                                  : "border-l-[3px] border-l-transparent hover:bg-slate-50"
                              }`}
                            >
                              <td className="py-2 pl-2 pr-0 align-middle">
                                <div className="flex flex-col items-center gap-1">
                                  {enCambio.length > 0 ? (
                                    <span
                                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-sm"
                                      aria-hidden
                                    >
                                      <Check className="h-4 w-4 stroke-[3]" />
                                    </span>
                                  ) : (
                                    <span
                                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-white"
                                      aria-hidden
                                    />
                                  )}
                                  {enCambio.length > 1 ? (
                                    <span className="text-[10px] leading-tight text-violet-800 font-semibold tabular-nums">
                                      ×{enCambio.length}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="py-2 px-2 font-mono text-slate-800">{p.codigo}</td>
                              <td className="py-2 px-2 text-slate-800">{p.nombre}</td>
                              <td className="py-2 px-2 text-right font-medium">{p.cantidad}</td>
                              <td className="py-2 px-2 text-right text-slate-600">
                                {fmtPeso(p.subtotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Panel reemplazo */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[320px]">
            <div className="px-3 py-2 bg-teal-50 border-b border-teal-100">
              <span className="text-sm font-medium text-teal-900">2. Producto de reemplazo — qué se entrega</span>
              <p className="text-xs text-teal-700 mt-0.5">
                <strong>Tocá para marcar</strong> el reemplazo; <strong>tocá de nuevo</strong> para quitarlo. Se asigna
                al primer lugar libre (o podés elegir primero acá y después la línea de la venta). El stock se descuenta
                en el orden de las filas de abajo.
              </p>
            </div>
            <div className="p-3 border-b border-slate-100 flex items-center gap-2">
              <Search className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={buscarProd}
                onChange={(e) => setBuscarProd(e.target.value)}
                placeholder="Código, nombre o talle…"
                className="flex-1 border-0 bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:ring-0"
                disabled={sidEfectivo == null}
              />
            </div>
            <div className="overflow-auto max-h-[380px] flex-1">
              {sidEfectivo == null ? (
                <p className="p-4 text-slate-500 text-sm">Elegí sucursal (dueña) o esperá la carga.</p>
              ) : productosFiltrados.length === 0 ? (
                <p className="p-4 text-slate-500 text-sm">No hay productos o no coinciden con la búsqueda.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="w-11 py-2 pl-2 pr-0 font-medium text-slate-600 text-center" title="Elegido">
                        ✓
                      </th>
                      <th className="text-left py-2 px-2 font-medium text-slate-600">Código</th>
                      <th className="text-left py-2 px-2 font-medium text-slate-600">Nombre</th>
                      <th className="text-left py-2 px-2 font-medium text-slate-600">Talle</th>
                      <th className="text-right py-2 px-2 font-medium text-slate-600">Stock</th>
                      <th className="text-right py-2 px-2 font-medium text-slate-600">Precio u.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosFiltrados.map((p) => {
                      const enCambio = bloquesConProductoReemplazo(p.id);
                      const pu = precioUnitarioVenta(p, ventaSel?.metodo_pago || "Efectivo");
                      const sinStock = p.stock < 1;
                      return (
                        <tr
                          key={p.id}
                          onClick={() => toggleProducto(p)}
                          className={`border-b border-slate-100 cursor-pointer transition-all select-none ${
                            enCambio.length > 0
                              ? "border-l-[3px] border-l-teal-500 bg-teal-50/90"
                              : "border-l-[3px] border-l-transparent hover:bg-slate-50"
                          } ${sinStock && enCambio.length === 0 ? "opacity-50" : ""}`}
                        >
                          <td className="py-2 pl-2 pr-0 align-middle">
                            <div className="flex flex-col items-center gap-1">
                              {enCambio.length > 0 ? (
                                <span
                                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white shadow-sm"
                                  aria-hidden
                                >
                                  <Check className="h-4 w-4 stroke-[3]" />
                                </span>
                              ) : (
                                <span
                                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-white"
                                  aria-hidden
                                />
                              )}
                              {enCambio.length > 1 ? (
                                <span className="text-[10px] leading-tight text-teal-900 font-semibold tabular-nums">
                                  ×{enCambio.length}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-2 px-2 font-mono text-slate-800">{p.codigo}</td>
                          <td className="py-2 px-2 text-slate-800">{p.nombre}</td>
                          <td className="py-2 px-2 text-slate-600">{p.talle}</td>
                          <td className="py-2 px-2 text-right font-medium">{p.stock}</td>
                          <td className="py-2 px-2 text-right">{fmtPeso(pu)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Resumen final — similar a cierre de transferencia */}
        <div className="mt-6 rounded-xl border-2 border-slate-200 bg-slate-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-white">
            <h3 className="text-sm font-semibold text-slate-900">Resumen del cambio</h3>
            <p className="text-xs text-slate-500 mt-0.5">Verificá devolución, entrega y dinero antes de confirmar.</p>
          </div>
          <div className="p-4 space-y-4">
            {ventaSel ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-700">
                  <span className="text-slate-500">Venta:</span> #{ventaSel.id} · {ventaSel.cliente}
                </p>
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-md border border-slate-200/90 bg-slate-50/90 px-2.5 py-1.5 text-[11px] leading-tight text-slate-600">
                  <span className="font-semibold text-slate-500 uppercase tracking-wide">Montos</span>
                  <span className="hidden sm:inline text-slate-300" aria-hidden>
                    |
                  </span>
                  <span>
                    Devuelve{" "}
                    <strong className="text-slate-800 tabular-nums">{fmtMoney(totalesEnVivo.totalDevuelto)}</strong>
                  </span>
                  <span className="text-slate-300">·</span>
                  <span>
                    Entrega{" "}
                    <strong className="text-slate-800 tabular-nums">{fmtMoney(totalesEnVivo.totalEntrega)}</strong>
                  </span>
                  <span className="text-slate-300">·</span>
                  <span>
                    Dif.{" "}
                    <strong
                      className={`tabular-nums ${
                        totalesEnVivo.saldo > 0.5
                          ? "text-amber-700"
                          : totalesEnVivo.saldo < -0.5
                            ? "text-emerald-700"
                            : "text-slate-800"
                      }`}
                    >
                      {fmtMoney(totalesEnVivo.saldo)}
                    </strong>
                  </span>
                </div>
              </div>
            ) : null}
            {registroLote.filas.length > 0 ? (
              registroLote.esMultiplesUnaEntrega ? (
                <div className="text-sm border border-slate-200 rounded-lg bg-white overflow-hidden divide-y divide-slate-100">
                  <div className="p-3">
                    <p className="text-xs font-semibold text-violet-800 uppercase tracking-wide mb-2">
                      Cliente devuelve
                    </p>
                    <ul className="space-y-2">
                      {registroLote.filas.map((f) => (
                        <li key={f.uid} className="flex justify-between gap-3 text-slate-800">
                          <span>
                            {f.ln.codigo} — {f.ln.nombre} ×{f.cde}
                          </span>
                          <span className="text-slate-600 tabular-nums shrink-0">{fmtPeso(f.valDev)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-3 bg-teal-50/50">
                    <p className="text-xs font-semibold text-teal-900 uppercase tracking-wide mb-2">
                      Vos entregás
                    </p>
                    {(() => {
                      const uFisicas = registroLote.filas.reduce((s, x) => s + x.cne, 0);
                      const filaConStock = registroLote.filas.find((x) => x.cne > 0) || registroLote.filas[0];
                      const pr = filaConStock.prod;
                      return (
                        <>
                          <p className="text-slate-800 font-medium">
                            {pr.codigo} — {pr.nombre}
                            <span className="text-teal-900"> ×{uFisicas}</span>
                          </p>
                          <p className="text-slate-600 mt-1 tabular-nums">{fmtPeso(registroLote.totalNuevo)}</p>
                          <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                            Una sola salida de depósito; el registro contable puede partirse en el sistema, pero acá ves
                            el cambio real.
                          </p>
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <ul className="space-y-3 text-sm border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                  {registroLote.filas.map((f, i) => (
                    <li key={f.uid} className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <span className="text-xs font-semibold text-slate-500">Devuelve #{i + 1}</span>
                        <p className="text-slate-800">
                          {f.ln.codigo} — {f.ln.nombre} ×{f.cde}
                        </p>
                        <p className="text-slate-600">{fmtPeso(f.valDev)}</p>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-slate-500">Entrega #{i + 1}</span>
                        <p className="text-slate-800">
                          {f.prod.codigo} — {f.prod.nombre}
                          {f.cne > 0 ? ` ×${f.cne}` : ""}
                        </p>
                        {f.cne < 1 ? (
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Misma unidad que en otra fila del lote (solo registro contable, sin otro movimiento de
                            stock).
                          </p>
                        ) : null}
                        <p className="text-slate-600">{fmtPeso(f.valN)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <p className="text-sm text-slate-400">
                Marcá líneas y productos con un toque; los montos del resumen se van actualizando.
              </p>
            )}
          </div>
          {registroLote.todoCompleto && registroLote.requiereMetodo ? (
            <div className="px-4 pb-4 border-t border-slate-200 pt-3 bg-white/80">
              <div className="max-w-xs">
                <label className="text-sm font-medium text-slate-700">Cobro del suplemento</label>
                <select
                  value={metodoSup}
                  onChange={(e) => setMetodoSup(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                </select>
              </div>
            </div>
          ) : null}
          <div className="px-4 py-4 border-t border-slate-200 bg-white flex justify-end">
            <button
              type="submit"
              disabled={loading || sidEfectivo == null}
              className="px-8 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? "Procesando…"
                : registroLote.esMultiplesUnaEntrega
                  ? "Registrar cambio"
                  : registroLote.items && registroLote.items.length > 1
                    ? `Registrar ${registroLote.items.length} cambios`
                    : "Registrar cambio"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
