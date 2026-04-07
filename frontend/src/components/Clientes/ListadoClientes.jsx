import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import axios from "axios";
import { getUser, getToken } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";

const ListadoClientes = () => {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [clientesPerPage] = useState(3);
  const [searchTerm, setSearchTerm] = useState(""); // Estado para la búsqueda
  const token = getToken();
  const navigate = useNavigate();
  const user = getUser();
  const esOwner = user.role === "OWNER";

  useEffect(() => {
    const fetchClientes = async () => {
      try {
        const response = await axios.get(`${API_URL}/clientes/all`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setClientes(response.data);
      } catch (error) {
        console.error("❌ Error al obtener clientes:", error);
      } finally {
        setLoading(false);
      }
    };

    if (token) fetchClientes();
  }, [token]);

  const NuevoCliente = () => {
    navigate("/NuevoCliente");
  };

  // Filtrar los clientes según el término de búsqueda
  const filteredClientes = clientes.filter(
    (cliente) =>
      cliente.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.apellido.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calcular el total de páginas
  const totalPages = Math.ceil(filteredClientes.length / clientesPerPage);

  // Obtener los clientes de la página actual
  const indexOfLastCliente = currentPage * clientesPerPage;
  const indexOfFirstCliente = indexOfLastCliente - clientesPerPage;
  const currentClientes = filteredClientes.slice(indexOfFirstCliente, indexOfLastCliente);

  // Cambiar página
  const paginate = (pageNumber) => setCurrentPage(pageNumber);

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
          <h1 className="text-2xl font-semibold text-slate-900">Clientes</h1>
          <p className="text-slate-500 text-sm mt-0.5">Base de datos de clientes</p>
        </div>
        {!esOwner && (
        <button
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700"
          onClick={NuevoCliente}
        >
          Nuevo cliente
        </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre o apellido"
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
        </div>

        <table className="table-professional">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Apellido</th>
              <th>Documento</th>
              <th>Teléfono</th>
              <th>Provincia</th>
              {esOwner && <th>Sucursal</th>}
            </tr>
          </thead>
          <tbody>
            {currentClientes.map((cliente) => (
              <tr key={cliente.id}>
                <td className="font-medium text-slate-900">{cliente.nombre}</td>
                <td>{cliente.apellido}</td>
                <td>{cliente.dni}</td>
                <td>{cliente.celular}</td>
                <td>{cliente.provincia}</td>
                {esOwner && (
                  <td>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                      {cliente.sucursal_nombre ?? "—"}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <p className="text-sm text-slate-500">Página {currentPage} de {totalPages || 1}</p>
        <div className="flex gap-2">
          <button
            onClick={() => paginate(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            onClick={() => paginate(currentPage + 1)}
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

export default ListadoClientes;
