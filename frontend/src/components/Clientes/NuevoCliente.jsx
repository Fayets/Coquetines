import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import swal from "sweetalert2";
import { getUser, getToken } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";

const NuevoCliente = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (getUser().role === "OWNER") {
      navigate("/Clientes", { replace: true });
    }
  }, [navigate]);

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

  // Manejo del envío del formulario
  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = getToken();
    try {
      const response = await axios.post(
        `${API_URL}/clientes/register`,
        cliente, // Datos del formulario
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`, // Agrega el token
          },
        }
      );

      if (response.status === 201) {
        swal.fire({
          icon: "success",
          title: "Cliente registrado",
          text: "El cliente ha sido registrado exitosamente.",
        });
        navigate("/Clientes"); // Redirige a la página de clientes
      } else {
        swal.fire({
          icon: "error",
          title: "Error",
          text: "No se pudo registrar el cliente.",
        });
      }
    } catch (error) {
      console.error("Error en la solicitud:", error);
      alert("Hubo un error al conectar con el servidor");
    }
  };

  const capitalizeFirstLetter = (str) => {
    return str.replace(/\b\w/g, char => char.toUpperCase());
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    // No aplicar capitalizeFirstLetter al campo de correo electrónico
    if (name === "email") {
      setCliente({ ...cliente, [name]: value });
    } else {
      setCliente({ ...cliente, [name]: capitalizeFirstLetter(value) });
    }
  };

  return (
    <div className="p-8">
        <h1 className="text-2xl font-bold mb-6">Registrar Nuevo Cliente</h1>

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

export default NuevoCliente;