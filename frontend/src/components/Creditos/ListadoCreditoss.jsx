import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaEye } from "react-icons/fa";
import { MdDelete } from "react-icons/md";
import Swal from "sweetalert2";
import { appendSucursalParam, getToken } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";

const ListadoCreditoss = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [error, setError] = useState(null);

  const [token, setToken] = useState(() => getToken());

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    if (!token) return;

    setLoading(true);
    fetch(appendSucursalParam(`${API_URL}/creditos/all`), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    })
      .catch((error) => {
        setError("Hubo un problema al obtener los datos.");
        console.error("Error al obtener clientes:", error);
      })

      .then((response) => {
        if (!response.ok) throw new Error("No autorizado o error en la API");
        return response.json();
      })
      .then((data) => {
        setClientes(Array.isArray(data) ? data : []);
      })

      .catch((error) => console.error("Error al obtener clientes:", error))
      .finally(() => setLoading(false));
  }, [token]);

  const handleviewcredit = (id) => {
    navigate(`/creditos/detalle/${id}`);
  };


  const handleNuevoCredito = () => {
    navigate("/NuevoCredito");
  };


  // Filtrar créditos por nombre de cliente
  const filteredCreditos = clientes.filter((credito) =>
    credito.cliente?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredCreditos.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedCreditos = filteredCreditos.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleDeleteCredito = async (credito_id) => {
    const result = await Swal.fire({
      title: "¿Estás seguro?",
      text: "Esta acción eliminará el crédito permanentemente.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });
  
    if (!result.isConfirmed) return;
  
    try {
      const response = await fetch(`${API_URL}/creditos/${credito_id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
  
      if (!response.ok) throw new Error("Error al eliminar el crédito");
  
      setClientes((prevClientes) =>
        prevClientes.filter((credito) => credito.id !== credito_id)
      );
  
      Swal.fire({
        icon: "success",
        title: "Crédito eliminado",
        text: "El crédito fue eliminado exitosamente.",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error("Error al eliminar el crédito:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Ocurrió un error al intentar eliminar el crédito.",
      });
    }
  };
  
  

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="w-10 h-10 border-2 border-slate-200 border-t-teal-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Créditos</h1>
          <p className="text-slate-500 text-sm mt-0.5">Créditos personales activos</p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700"
          onClick={handleNuevoCredito}
        >
          Nuevo crédito
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-100">
          <input
            type="text"
            placeholder="Buscar por cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-xs px-4 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>

        <table className="table-professional">
          <thead>
            <tr>
              <th>ID</th>
              <th>Cliente</th>
              <th>Fecha inicio</th>
              <th>Saldo pendiente</th>
              <th>Estado</th>
              <th className="w-24">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(clientes) && clientes.length > 0 ? (
              paginatedCreditos.map((credito) => (
                <tr key={credito.id}>
                  <td className="font-medium text-slate-900">{credito.id}</td>
                  <td>{credito.cliente}</td>
                  <td>{credito.fecha_inicio}</td>
                  <td className="font-medium">${credito.saldo_pendiente}</td>
                  <td>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      credito.estado?.toLowerCase() === 'pagado' ? 'bg-emerald-100 text-emerald-700' :
                      credito.estado?.toLowerCase() === 'pendiente' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {credito.estado}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button
                        className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg"
                        onClick={() => handleviewcredit(credito.id)}
                        title="Ver"
                      >
                        <FaEye className="h-4 w-4" />
                      </button>
                      <button
                        className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                        onClick={() => handleDeleteCredito(credito.id)}
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
                <td colSpan="6" className="text-center py-12 text-slate-500">
                  No hay créditos registrados
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
};

export default ListadoCreditoss;