import axios from "axios";
import Swal from "sweetalert2";
import { clearAuth, getToken } from "./authStorage";

let sesionExpiradaEnCurso = false;

function esRutaLoginORegistro(url) {
  if (!url || typeof url !== "string") return false;
  return url.includes("/auth/login") || url.includes("/auth/register");
}

/**
 * Respuestas 401 con Bearer (sesión caducada o token inválido): alerta y vuelta al login.
 * No interfiere con el intento de login (misma URL puede devolver 401 por credenciales).
 */
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const url = error.config?.url ?? "";

    if (status !== 401 || esRutaLoginORegistro(url)) {
      return Promise.reject(error);
    }

    if (sesionExpiradaEnCurso) {
      return Promise.reject(error);
    }

    if (!getToken()) {
      return Promise.reject(error);
    }

    sesionExpiradaEnCurso = true;
    clearAuth();

    try {
      await Swal.fire({
        title: "Sesión expirada",
        text: "Tu sesión caducó o el acceso ya no es válido. Iniciá sesión de nuevo.",
        icon: "info",
        confirmButtonText: "Aceptar",
      });
    } finally {
      sesionExpiradaEnCurso = false;
      window.location.assign("/");
    }

    return Promise.reject(error);
  }
);
