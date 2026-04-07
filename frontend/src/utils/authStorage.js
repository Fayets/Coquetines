/**
 * Almacenamiento de autenticación por pestaña (sessionStorage).
 * Así cada pestaña puede tener un usuario distinto y varios empleados
 * pueden usar el sistema a la vez (cada uno en su pestaña o dispositivo).
 */
const TOKEN_KEY = "token";
const USER_KEY = "user";

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token != null) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function getUser() {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setUser(user) {
  if (user != null) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  else sessionStorage.removeItem(USER_KEY);
}

export function setAuth(token, user) {
  setToken(token);
  setUser(user);
}

export function clearAuth() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}
