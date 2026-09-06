/** Administración del catálogo web (panel de la dueña). */
import axios from "axios";
import { API_URL } from "./api";
import { getToken, getUser } from "./authStorage";

function cabeceras() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function listarCatalogo({ busqueda, soloPublicados, sucursalId, pagina = 1, limite = 60 } = {}) {
  return axios
    .get(`${API_URL}/catalogo-admin`, {
      headers: cabeceras(),
      params: {
        ...(busqueda ? { busqueda } : {}),
        ...(soloPublicados ? { solo_publicados: true } : {}),
        ...(sucursalId ? { sucursal_id: sucursalId } : {}),
        pagina,
        limite,
      },
    })
    .then((r) => r.data);
}

export function actualizarProducto(id, cambios) {
  return axios
    .patch(`${API_URL}/catalogo-admin/${id}`, cambios, { headers: cabeceras() })
    .then((r) => r.data);
}

export function publicarVarios(ids, publicado) {
  return axios
    .post(`${API_URL}/catalogo-admin/publicar`, { ids, publicado }, { headers: cabeceras() })
    .then((r) => r.data);
}

export function subirImagen(id, archivo) {
  const form = new FormData();
  form.append("archivo", archivo);
  return axios
    .post(`${API_URL}/catalogo-admin/${id}/imagen`, form, { headers: cabeceras() })
    .then((r) => r.data);
}

export function borrarImagen(id) {
  return axios
    .delete(`${API_URL}/catalogo-admin/${id}/imagen`, { headers: cabeceras() })
    .then((r) => r.data);
}

/** La dueña y los administradores manejan el catálogo. */
export function puedeManejarCatalogo(user = getUser()) {
  return user?.role === "OWNER" || user?.role === "ADMIN";
}
