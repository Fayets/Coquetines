/** Usuario de sucursal tienda online (no OWNER). */
export function puedeAccederTiendaWeb(user, tiendasOnline = null) {
  if (!user || user.role === "OWNER") return false;
  if (user.role !== "ADMIN" && user.role !== "EMPLEADO") return false;

  const sid = Number(user.sucursal_id);
  if (!Number.isFinite(sid)) return false;

  if (user.es_tienda_online === true) return true;

  if (Array.isArray(tiendasOnline)) {
    return tiendasOnline.some((s) => Number(s.id) === sid);
  }

  // Sin lista cargada aún: permitir intentar (se valida contra la API al abrir la pantalla).
  return true;
}
