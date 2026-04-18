import React, { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import Swal from "sweetalert2";
import { getToken } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";

const EditarCliente = () => {
  const navigate = useNavigate();
  const { dni } = useParams();
  const [searchParams] = useSearchParams();
  const sucursalIdQuery = searchParams.get("sucursal_id");

  // Estado para capturar los datos del formulario
  const [cliente, setCliente] = useState({
    nombre: "",
    apellido: "",
    dni: "",
    celular: "",
    email: "",
    direccion: "",
    ciudad: "",
    provincia: "",
  });

  // Obtener los datos del cliente desde el backend al montar el componente
  useEffect(() => {
    const fetchClienteData = async () => {
      const token = getToken();
      try {
        const q =
          sucursalIdQuery != null && sucursalIdQuery !== ""
            ? `?sucursal_id=${encodeURIComponent(sucursalIdQuery)}`
            : "";
        const response = await axios.get(`${API_URL}/clientes/get_by_dni/${encodeURIComponent(dni)}${q}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        
        setCliente(response.data); // Asume que la respuesta tiene la estructura adecuada
      } catch (error) {
        
         Swal.fire({
                 title: 'Error',
                 text: 'Error al traer los datos del cliente',
                 icon: 'error',
                 confirmButtonText: 'Reintentar'
               });
      }
    };

    fetchClienteData();
  }, [dni, sucursalIdQuery]);

  // Manejo del envío del formulario
  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = getToken();

    if (cliente.id === null) {
      alert("El cliente no tiene ID disponible.");
      return;
    }

    const sid =
      sucursalIdQuery != null && sucursalIdQuery !== ""
        ? Number(sucursalIdQuery)
        : undefined;
    const payload = {
      ...cliente,
      ...(sid != null && !Number.isNaN(sid) && { sucursal_id: sid }),
    };

    try {
      const response = await axios.put(
        `${API_URL}/clientes/update/${cliente.id}`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 200) {
        Swal.fire({
          title: 'Exito',
          text: 'Cliente editado con exito',
          icon: 'success',

        });
        navigate("/Clientes"); // Redirige al listado de clientes
      }
    } catch (error) {
      console.error("Error en la solicitud:", error);
      Swal.fire({
        title: 'Error',
        text: 'Error al ceditar cliente',
        icon: 'error',

      });
    }
  };

  const capitalizeFirstLetter = (str) => {
    return str.replace(/\b\w/g, char => char.toUpperCase());
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setCliente({ ...cliente, [name]: capitalizeFirstLetter(value) });
  };
  return (
    <div className="p-8">
        <h1 className="text-2xl font-bold mb-6">Editar Cliente</h1>

        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
          {/* Información Personal */}
          <div className="bg-white shadow-md p-6 rounded-lg">
            <h2 className="text-lg font-semibold mb-4">Información Personal</h2>
            <div className="grid grid-cols-2 gap-4">
              <input
                name="nombre"
                onChange={handleChange}
                value={cliente.nombre}
                className="w-full px-3 py-2 border rounded-md"
                type="text"
                placeholder="Nombre"
              />
              <input
                name="apellido"
                onChange={handleChange}
                value={cliente.apellido}
                className="w-full px-3 py-2 border rounded-md"
                type="text"
                placeholder="Apellido"
              />
              <input
                name="dni"
                onChange={handleChange}
                value={cliente.dni}
                className="w-full px-3 py-2 border rounded-md"
                type="text"
                placeholder="Número de Documento"
              />
            </div>
          </div>

          {/* Información de Contacto */}
          <div className="bg-white shadow-md p-6 rounded-lg">
            <h2 className="text-lg font-semibold mb-4">Información de Contacto</h2>
            <div className="grid grid-cols-2 gap-4">
              <input
                name="celular"
                onChange={handleChange}
                value={cliente.celular}
                className="w-full px-3 py-2 border rounded-md"
                type="text"
                placeholder="Teléfono"
              />
              <input
                name="email"
                onChange={handleChange}
                value={cliente.email}
                className="w-full px-3 py-2 border rounded-md"
                type="email"
                placeholder="Correo Electrónico"
              />
            </div>
          </div>

          {/* Dirección */}
          <div className="bg-white shadow-md p-6 rounded-lg">
            <h2 className="text-lg font-semibold mb-4">Dirección</h2>
            <div className="grid grid-cols-2 gap-4">
              <input
                name="direccion"
                onChange={handleChange}
                value={cliente.direccion}
                className="w-full px-3 py-2 border rounded-md"
                type="text"
                placeholder="Calle y Número"
              />
              <input
                name="ciudad"
                onChange={handleChange}
                value={cliente.ciudad}
                className="w-full px-3 py-2 border rounded-md"
                type="text"
                placeholder="Ciudad"
              />
              <input
                name="provincia"
                onChange={handleChange}
                value={cliente.provincia}
                className="w-full px-3 py-2 border rounded-md"
                type="text"
                placeholder="Provincia/Estado"
              />
            </div>
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-4">
            <button type="button" className="btn-secondary">
              Cancelar
            </button>
            <button
              type="submit"
              className="ml-2 px-4 py-2 bg-fuchsia-800 text-white rounded-md cursor-pointer"
            >
              Guardar Cliente
            </button>
          </div>
        </form>
    </div>
  );
};

export default EditarCliente;