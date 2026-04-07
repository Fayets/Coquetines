import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Building2 } from "lucide-react";
import { FaEye } from "react-icons/fa";
import { MdDelete } from "react-icons/md";
import Swal from "sweetalert2";
import useAuth from "../Hooks/useAuth";
import { getSucursalId, getUser, getToken } from "../../utils/sucursal";

import { API_URL } from "../../utils/api";

export default function VentasList() {
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorVentas, setErrorVentas] = useState(null);
  const [sucursales, setSucursales] = useState([]);
  const [filterSucursalId, setFilterSucursalId] = useState(null); // null = Todas (solo para OWNER)
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const ventasPerPage = 6;
  const token = getToken();
  const [searchTerm, setSearchTerm] = useState("");
  const isAuthenticated = useAuth();
  const user = getUser();
  const esOwner = user.role === "OWNER";

  // Para OWNER: filtro local (Todas por defecto). Para el resto: sucursal del usuario.
  const sucursalIdParaRequest = esOwner ? filterSucursalId : getSucursalId();

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }
    if (esOwner) {
      axios
        .get(`${API_URL}/sucursales/`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => {
          const list = Array.isArray(r.data) ? r.data : [];
          setSucursales(list.filter((s) => (s.nombre || "") !== "Sucursal Principal"));
        })
        .catch(() => setSucursales([]));
    }
  }, [token, esOwner, navigate]);

  useEffect(() => {
    if (!token) return;

    const fetchVentas = async () => {
      setLoading(true);
      setErrorVentas(null);
      try {
        const url = `${API_URL}/ventas/all` + (sucursalIdParaRequest != null ? `?sucursal_id=${sucursalIdParaRequest}` : "");
        const response = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = Array.isArray(response.data) ? response.data : [];
        setVentas([...data].reverse());
      } catch (error) {
        console.error("Error al obtener ventas:", error);
        const msg = error.response?.data?.detail || error.message || "Error al cargar las ventas.";
        setErrorVentas(typeof msg === "string" ? msg : JSON.stringify(msg));
        setVentas([]);
      } finally {
        setLoading(false);
      }
    };

    fetchVentas();
  }, [token, sucursalIdParaRequest]);

  // Verificar autenticación
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="w-10 h-10 border-2 border-slate-200 border-t-teal-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Filtrar ventas por cliente, ID o fecha
  const filteredVentas = ventas.filter(
    (venta) =>
      venta.cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
      venta.id.toString().includes(searchTerm) ||
      venta.fecha.includes(searchTerm) // Filtrar por fecha
  );

  // Calcular el índice de las ventas a mostrar en la página actual
  const indexOfLastVenta = currentPage * ventasPerPage;
  const indexOfFirstVenta = indexOfLastVenta - ventasPerPage;
  const currentVentas = filteredVentas.slice(
    indexOfFirstVenta,
    indexOfLastVenta
  );

  // Funciones de paginación
  const totalPages = Math.ceil(filteredVentas.length / ventasPerPage);
  const nextPage = () =>
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  const prevPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1));

  const vistaVenta = async (id) => {
    try {
      const response = await axios.get(`${API_URL}/ventas/get/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      navigate(`/ventas/details/${id}`);
    } catch (error) {
      console.error("Error al obtener el producto:", error);
    }
  };

  const eliminarVenta = async (venta_id) => {
    const confirmDelete = await Swal.fire({
      title: "¿Estás seguro?",
      text: "No podrás revertir esto",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });

    if (!confirmDelete.isConfirmed) return;

    try {
      await axios.delete(`${API_URL}/ventas/${venta_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setVentas((prevVentas) => prevVentas.filter((venta) => venta.id !== venta_id));

      Swal.fire("Eliminado", "Venta eliminada correctamente", "success");
    } catch (error) {
      console.error("Error al eliminar la venta:", error);
      Swal.fire("Error", "Ocurrió un error al eliminar la venta.", "error");
    }
  };

  if (!isAuthenticated) {
    return <div>No tienes acceso, por favor inicia sesión.</div>;
  }

  return (
    <div className="p-8">
      {errorVentas && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
          {errorVentas}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Ventas</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {esOwner ? "Historial de ventas de todas las sucursales" : "Historial de ventas"}
          </p>
        </div>
        {!esOwner && (
          <button
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700"
            onClick={() => navigate("/ventas/nueva")}
          >
            <Plus className="h-4 w-4" />
            Nueva venta
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por cliente, ID o fecha..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          {esOwner && sucursales.length > 0 && (
            <div className="flex items-center gap-2 min-w-[200px]">
              <Building2 className="h-4 w-4 text-slate-500 shrink-0" />
              <select
                value={filterSucursalId ?? ""}
                onChange={(e) => setFilterSucursalId(e.target.value ? parseInt(e.target.value, 10) : null)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                <option value="">Todas las sucursales</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <table className="table-professional">
          <thead>
            <tr>
              <th>ID</th>
              {esOwner && <th>Sucursal</th>}
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Total</th>
              <th>Método de pago</th>
              <th className="w-24">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {currentVentas.length > 0 ? (
              currentVentas.map((venta) => (
                <tr key={venta.id}>
                  <td className="font-medium text-slate-900">{venta.id}</td>
                  {esOwner && (
                    <td>
                      <span className="inline-flex items-center gap-1 text-sm text-slate-600">
                        <Building2 className="h-3.5 w-3.5" />
                        {venta.sucursal_nombre || "—"}
                      </span>
                    </td>
                  )}
                  <td>{new Date(venta.fecha).toLocaleDateString("es-ES")}</td>
                  <td>{venta.cliente}</td>
                  <td className="font-medium">${venta.total}</td>
                  <td>{venta.metodo_pago}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button
                        className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg"
                        onClick={() => vistaVenta(venta.id)}
                        title="Ver"
                      >
                        <FaEye className="h-4 w-4" />
                      </button>
                      <button
                        className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                        onClick={() => eliminarVenta(venta.id)}
                        title="Eliminar"
                      >
                        <MdDelete className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={esOwner ? 7 : 6} className="text-center py-12 text-slate-500">
                  No hay ventas registradas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <p className="text-sm text-slate-500">Página {currentPage} de {totalPages || 1}</p>
        <div className="flex gap-2">
          <button
            onClick={prevPage}
            disabled={currentPage === 1}
            className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            onClick={nextPage}
            disabled={currentPage === totalPages}
            className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}