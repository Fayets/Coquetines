import React, { useState, useEffect } from "react";
import axios from "axios";
import { Settings, Save, Building2, MapPin, Plus, Trash2, UserPlus, Users, KeyRound } from "lucide-react";
import Swal from "sweetalert2";
import useAuth from "../Hooks/useAuth";
import { getUser, getToken } from "../../utils/sucursal";
import { useNavigate } from "react-router-dom";

import { API_URL } from "../../utils/api";

export default function Configuracion() {
  const [whatsapp, setWhatsapp] = useState("");
  const [sucursales, setSucursales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingSucursal, setCreatingSucursal] = useState(false);
  const [deletingSucursalId, setDeletingSucursalId] = useState(null);
  const [nuevaSucursalNombre, setNuevaSucursalNombre] = useState("");
  const [nuevaSucursalDireccion, setNuevaSucursalDireccion] = useState("");
  const [error, setError] = useState(null);
  const token = getToken();
  const isAuthenticated = useAuth();
  const user = getUser();
  const esOwner = user.role === "OWNER";
  const navigate = useNavigate();

  useEffect(() => {
    if (user.role === "EMPLEADO") {
      navigate("/dashboard", { replace: true });
    }
  }, [user.role, navigate]);

  const [creatingEmpleado, setCreatingEmpleado] = useState(false);
  const [empleados, setEmpleados] = useState([]);
  const [deletingEmpleadoId, setDeletingEmpleadoId] = useState(null);
  const [changingPasswordId, setChangingPasswordId] = useState(null);
  const [empleadoForm, setEmpleadoForm] = useState({
    sucursal_id: "",
    role: "EMPLEADO",
    username: "",
    email: "",
    firstName: "",
    lastName: "",
    password: "",
  });

  const fetchSucursales = () => {
    if (!token || !esOwner) return;
    axios
      .get(`${API_URL}/sucursales/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setSucursales(list.filter((s) => (s.nombre || "") !== "Sucursal Principal"));
      })
      .catch(() => setSucursales([]));
  };

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    axios
      .get(`${API_URL}/config`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        setWhatsapp(res.data?.whatsapp_numero_caja || "");
      })
      .catch((err) => {
        if (err.response?.status === 403) {
          setError("Solo el administrador puede ver y editar la configuración.");
        } else {
          setError(err.response?.data?.detail || "Error al cargar la configuración.");
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token || !esOwner) return;
    fetchSucursales();
  }, [token, esOwner]);

  const fetchEmpleados = () => {
    if (!token || !esOwner) return;
    axios
      .get(`${API_URL}/users/empleados`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const data = res.data;
        const list = Array.isArray(data) ? data : (data?.empleados ?? data?.data ?? []);
        setEmpleados(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        console.warn("Error al cargar empleados:", err.response?.status, err.response?.data);
        setEmpleados([]);
      });
  };

  useEffect(() => {
    if (!token || !esOwner) return;
    fetchEmpleados();
  }, [token, esOwner]);

  const handleSave = (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    axios
      .put(
        `${API_URL}/config`,
        { whatsapp_numero_caja: whatsapp.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      .then(() => {
        Swal.fire("Guardado", "La configuración se actualizó correctamente.", "success");
      })
      .catch((err) => {
        if (err.response?.status === 403) {
          setError("Solo el administrador puede modificar la configuración.");
        } else {
          Swal.fire("Error", err.response?.data?.detail || "No se pudo guardar.", "error");
        }
      })
      .finally(() => setSaving(false));
  };

  const handleCrearSucursal = (e) => {
    e.preventDefault();
    const nombre = nuevaSucursalNombre.trim();
    if (!nombre) {
      Swal.fire("Faltan datos", "El nombre de la sucursal es obligatorio.", "warning");
      return;
    }
    setCreatingSucursal(true);
    axios
      .post(
        `${API_URL}/sucursales/`,
        { nombre, direccion: nuevaSucursalDireccion.trim() || undefined },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      .then(() => {
        Swal.fire("Listo", "Sucursal creada correctamente.", "success");
        setNuevaSucursalNombre("");
        setNuevaSucursalDireccion("");
        fetchSucursales();
      })
      .catch((err) => {
        const msg = err.response?.data?.detail || err.response?.data?.message || "No se pudo crear la sucursal.";
        Swal.fire("Error", typeof msg === "string" ? msg : "No se pudo crear la sucursal.", "error");
      })
      .finally(() => setCreatingSucursal(false));
  };

  const handleEliminarSucursal = (sucursal) => {
    const esPrincipal = sucursal.nombre === "Sucursal Principal";
    Swal.fire({
      title: "¿Estás segura?",
      html: esPrincipal
        ? "No se puede eliminar la Sucursal Principal."
        : `Se eliminará la sucursal "<strong>${sucursal.nombre}</strong>". Esta acción no se puede deshacer.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#0d9488",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    }).then((result) => {
      if (!result.isConfirmed) return;
      if (esPrincipal) {
        Swal.fire("No permitido", "No se puede eliminar la Sucursal Principal.", "info");
        return;
      }
      setDeletingSucursalId(sucursal.id);
      axios
        .delete(`${API_URL}/sucursales/${sucursal.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then(() => {
          Swal.fire("Listo", "Sucursal eliminada.", "success");
          fetchSucursales();
        })
        .catch((err) => {
          const msg = err.response?.data?.detail || "No se pudo eliminar la sucursal.";
          Swal.fire("Error", typeof msg === "string" ? msg : "No se pudo eliminar.", "error");
        })
        .finally(() => setDeletingSucursalId(null));
    });
  };

  const handleCrearEmpleado = (e) => {
    e.preventDefault();
    const { sucursal_id, role, username, email, firstName, lastName, password } = empleadoForm;
    if (!sucursal_id || !username?.trim() || !email?.trim() || !firstName?.trim() || !lastName?.trim() || !password) {
      Swal.fire("Faltan datos", "Completá sucursal, usuario, email, nombre, apellido y contraseña.", "warning");
      return;
    }
    if (password.length < 4) {
      Swal.fire("Contraseña corta", "La contraseña debe tener al menos 4 caracteres.", "warning");
      return;
    }
    setCreatingEmpleado(true);
    axios
      .post(
        `${API_URL}/users/register`,
        {
          sucursal_id: parseInt(sucursal_id, 10),
          role,
          username: username.trim(),
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          password,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      .then((res) => {
        if (res.data?.success !== false) {
          Swal.fire("Listo", "Empleado creado correctamente.", "success");
          setEmpleadoForm({
            sucursal_id: "",
            role: "EMPLEADO",
            username: "",
            email: "",
            firstName: "",
            lastName: "",
            password: "",
          });
          fetchEmpleados();
        } else {
          Swal.fire("Error", res.data?.message || "No se pudo crear el empleado.", "error");
        }
      })
      .catch((err) => {
        const msg = err.response?.data?.detail || err.response?.data?.message || "No se pudo crear el empleado.";
        Swal.fire("Error", typeof msg === "string" ? msg : "No se pudo crear el empleado.", "error");
      })
      .finally(() => setCreatingEmpleado(false));
  };

  const handleEliminarEmpleado = (emp) => {
    Swal.fire({
      title: "¿Eliminar empleado?",
      html: `Se eliminará a <strong>${emp.firstName} ${emp.lastName}</strong> (${emp.username}). Esta acción no se puede deshacer.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    }).then((result) => {
      if (!result.isConfirmed) return;
      setDeletingEmpleadoId(emp.id);
      axios
        .delete(`${API_URL}/users/${emp.id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(() => {
          Swal.fire("Listo", "Usuario eliminado.", "success");
          fetchEmpleados();
        })
        .catch((err) => {
          const msg = err.response?.data?.detail || "No se pudo eliminar el usuario.";
          Swal.fire("Error", typeof msg === "string" ? msg : "No se pudo eliminar.", "error");
        })
        .finally(() => setDeletingEmpleadoId(null));
    });
  };

  const handleCambiarContraseña = (emp) => {
    Swal.fire({
      title: `Cambiar contraseña de ${emp.firstName} ${emp.lastName}`,
      input: "password",
      inputLabel: "Nueva contraseña (mínimo 4 caracteres)",
      inputPlaceholder: "Nueva contraseña",
      inputAttributes: { minlength: 4, autocomplete: "new-password" },
      showCancelButton: true,
      confirmButtonColor: "#0d9488",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Actualizar",
      cancelButtonText: "Cancelar",
      inputValidator: (value) => {
        if (!value || value.length < 4) return "La contraseña debe tener al menos 4 caracteres.";
        return null;
      },
    }).then((result) => {
      if (!result.isConfirmed || !result.value) return;
      setChangingPasswordId(emp.id);
      axios
        .put(
          `${API_URL}/users/${emp.id}/password`,
          { new_password: result.value },
          { headers: { Authorization: `Bearer ${token}` } }
        )
        .then(() => {
          Swal.fire("Listo", "Contraseña actualizada correctamente.", "success");
        })
        .catch((err) => {
          const msg = err.response?.data?.detail || "No se pudo actualizar la contraseña.";
          Swal.fire("Error", typeof msg === "string" ? msg : "No se pudo actualizar.", "error");
        })
        .finally(() => setChangingPasswordId(null));
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="p-8">
        <p className="text-slate-600">No tenés acceso.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <div className="w-10 h-10 border-2 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Configuración</h1>
        <p className="text-slate-500 text-sm mt-0.5">Opciones del sistema (solo administrador)</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
          {error}
        </div>
      )}

      {esOwner && (
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="h-5 w-5 text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-900">Sucursales</h2>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Creá sucursales y luego transferí stock entre ellas desde el menú.
            </p>

            <form onSubmit={handleCrearSucursal} className="mb-6 p-4 rounded-lg bg-slate-50 border border-slate-200">
              <p className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Nueva sucursal
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nombre *</label>
                  <input
                    type="text"
                    value={nuevaSucursalNombre}
                    onChange={(e) => setNuevaSucursalNombre(e.target.value)}
                    placeholder="Ej. Sucursal Centro"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    disabled={creatingSucursal}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Dirección</label>
                  <input
                    type="text"
                    value={nuevaSucursalDireccion}
                    onChange={(e) => setNuevaSucursalDireccion(e.target.value)}
                    placeholder="Ej. Av. Corrientes 1234"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    disabled={creatingSucursal}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={creatingSucursal || !nuevaSucursalNombre.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {creatingSucursal ? "Creando…" : "Crear sucursal"}
              </button>
            </form>

            {sucursales.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No hay sucursales cargadas.</p>
            ) : (
              <ul className="space-y-3">
                {sucursales.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100"
                  >
                    <Building2 className="h-5 w-5 text-teal-600 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{s.nombre}</p>
                      {s.direccion && (
                        <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          {s.direccion}
                        </p>
                      )}
                      <span
                        className={`inline-block mt-1 text-xs px-2 py-0.5 rounded ${
                          s.activo ? "bg-teal-100 text-teal-700" : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {s.activo ? "Activa" : "Inactiva"}
                      </span>
                    </div>
                    {s.nombre !== "Sucursal Principal" && (
                      <button
                        type="button"
                        onClick={() => handleEliminarSucursal(s)}
                        disabled={deletingSucursalId === s.id}
                        className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                        title="Eliminar sucursal"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {sucursales.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <UserPlus className="h-5 w-5 text-slate-500" />
                <h2 className="text-lg font-semibold text-slate-900">Crear empleado por sucursal</h2>
              </div>
              <p className="text-sm text-slate-500 mb-4">
                Creá usuarios ADMIN o EMPLEADO asignados a una sucursal. Podrán operar solo en esa sucursal.
              </p>

              <form onSubmit={handleCrearEmpleado} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Sucursal *</label>
                    <select
                      value={empleadoForm.sucursal_id}
                      onChange={(e) => setEmpleadoForm((f) => ({ ...f, sucursal_id: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      required
                    >
                      <option value="">Seleccionar sucursal</option>
                      {sucursales.map((s) => (
                        <option key={s.id} value={s.id}>{s.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Rol *</label>
                    <select
                      value={empleadoForm.role}
                      onChange={(e) => setEmpleadoForm((f) => ({ ...f, role: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    >
                      <option value="EMPLEADO">Empleado</option>
                      <option value="ADMIN">Administrador</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Usuario *</label>
                    <input
                      type="text"
                      value={empleadoForm.username}
                      onChange={(e) => setEmpleadoForm((f) => ({ ...f, username: e.target.value }))}
                      placeholder="nombre.usuario"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Email *</label>
                    <input
                      type="email"
                      value={empleadoForm.email}
                      onChange={(e) => setEmpleadoForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="email@ejemplo.com"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Nombre *</label>
                    <input
                      type="text"
                      value={empleadoForm.firstName}
                      onChange={(e) => setEmpleadoForm((f) => ({ ...f, firstName: e.target.value }))}
                      placeholder="Nombre"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Apellido *</label>
                    <input
                      type="text"
                      value={empleadoForm.lastName}
                      onChange={(e) => setEmpleadoForm((f) => ({ ...f, lastName: e.target.value }))}
                      placeholder="Apellido"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Contraseña *</label>
                  <input
                    type="password"
                    value={empleadoForm.password}
                    onChange={(e) => setEmpleadoForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Mínimo 4 caracteres"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm max-w-xs"
                    minLength={4}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={creatingEmpleado}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50"
                >
                  <UserPlus className="h-4 w-4" />
                  {creatingEmpleado ? "Creando…" : "Crear empleado"}
                </button>
              </form>
            </div>
          )}

          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-900">Lista de empleados</h2>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Empleados y administradores asignados a cada sucursal.
            </p>
            {empleados.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No hay empleados cargados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600 font-medium">
                      <th className="py-2 pr-4">Nombre</th>
                      <th className="py-2 pr-4">Usuario</th>
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">Rol</th>
                      <th className="py-2 pr-4">Sucursal</th>
                      <th className="py-2 pr-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empleados.map((emp) => (
                      <tr key={emp.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-3 pr-4 text-slate-900">
                          {emp.firstName} {emp.lastName}
                        </td>
                        <td className="py-3 pr-4 text-slate-700">{emp.username}</td>
                        <td className="py-3 pr-4 text-slate-700">{emp.email}</td>
                        <td className="py-3 pr-4">
                          <span
                            className={`inline-block text-xs px-2 py-0.5 rounded ${
                              emp.role === "ADMIN"
                                ? "bg-teal-100 text-teal-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {emp.role === "ADMIN" ? "Administrador" : "Empleado"}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-slate-600">{emp.sucursal_nombre || "—"}</td>
                        <td className="py-3 pr-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleCambiarContraseña(emp)}
                              disabled={changingPasswordId === emp.id}
                              className="p-2 rounded-lg text-slate-500 hover:bg-teal-50 hover:text-teal-600 transition-colors disabled:opacity-50"
                              title="Cambiar contraseña"
                            >
                              <KeyRound className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEliminarEmpleado(emp)}
                              disabled={deletingEmpleadoId === emp.id}
                              className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                              title="Eliminar usuario"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <span className="font-medium text-slate-700">Versión desplegada (interfaz)</span>
            {import.meta.env.VITE_APP_COMMIT ? (
              <code className="ml-2 rounded bg-white px-2 py-0.5 font-mono text-slate-900 border border-slate-200">
                {import.meta.env.VITE_APP_COMMIT}
              </code>
            ) : (
              <span className="ml-2 text-slate-400">No disponible en este build</span>
            )}
          </div>
        </div>
      )}

      <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-xl">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-900">Cierre de caja y WhatsApp</h2>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Número de WhatsApp al que se enviará el resumen del cierre de caja (ej. +54 9 11 1234-5678). El PDF se descarga al cerrar la caja; podés compartirlo por WhatsApp manualmente a este número.
        </p>
        <form onSubmit={handleSave}>
          <label className="block text-sm font-medium text-slate-700 mb-1">Número de WhatsApp</label>
          <input
            type="text"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="+54 9 11 1234-5678"
            className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm mb-4"
            disabled={!!error}
          />
          <button
            type="submit"
            disabled={saving || !!error}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </form>
      </div>
    </div>
  );
}
