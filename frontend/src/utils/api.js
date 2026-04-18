/**
 * URL base del backend. Única fuente de verdad para axios/fetch.
 * En build (Docker, CI, hosting) definí VITE_API_URL en el entorno de build.
 */
const raw = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/$/, "");

export const API_URL = raw || "http://localhost:8000";

export function getApiUrl() {
  return API_URL;
}

/** Ruta absoluta al API (sin barra final en la base). */
export function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${p}`;
}
