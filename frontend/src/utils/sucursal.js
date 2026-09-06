/**
 * Helper para sucursal: lectura del usuario y sucursal (para filtros).
 * - OWNER: no se filtra por sucursal en el sidebar (se eliminó el selector); ve todas las sucursales en listados.
 * - ADMIN/EMPLEADO: usan siempre user.sucursal_id.
 * - Tienda online: inventario/stock usa sucursal_stock_id (sucursal física vinculada).
 * Usuario y token se guardan en sessionStorage (por pestaña) para que varios usuarios puedan usar el sistema a la vez.
 */
import { getUser, getToken } from "./authStorage";

export { getUser, getToken };

export function getSucursalId() {
  const user = getUser();
  if (user.role === "OWNER") {
    return null;
  }
  if (user.sucursal_id == null || user.sucursal_id === "") {
    return null;
  }
  const n = Number(user.sucursal_id);
  return Number.isFinite(n) ? n : null;
}

/** Sucursal cuyo stock ve/consulta el usuario (tienda online → sucursal física de stock). */
export function getSucursalStockId() {
  const user = getUser();
  if (user.role === "OWNER") {
    return null;
  }
  if (user.es_tienda_online && user.sucursal_stock_id != null && user.sucursal_stock_id !== "") {
    const stockId = Number(user.sucursal_stock_id);
    if (Number.isFinite(stockId)) return stockId;
  }
  return getSucursalId();
}

/** Parámetro query para APIs: ?sucursal_id=X (o '' si no hay que enviar). */
export function sucursalQueryParam() {
  const sid = getSucursalId();
  return sid != null ? `?sucursal_id=${sid}` : "";
}

/** Para requests con query string existente (ej. ?foo=1), append &sucursal_id=X. */
export function appendSucursalParam(url) {
  const sid = getSucursalId();
  if (sid == null) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}sucursal_id=${sid}`;
}

/** Igual que appendSucursalParam pero resuelve la sucursal de stock para tienda online. */
export function appendSucursalStockParam(url) {
  const sid = getSucursalStockId();
  if (sid == null) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}sucursal_id=${sid}`;
}

export function isOwner() {
  return getUser().role === "OWNER";
}
