/**
 * Helper para sucursal: lectura del usuario y sucursal (para filtros).
 * - OWNER: no se filtra por sucursal en el sidebar (se eliminó el selector); ve todas las sucursales en listados.
 * - ADMIN/EMPLEADO: usan siempre user.sucursal_id.
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

export function isOwner() {
  return getUser().role === "OWNER";
}
