import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import Swal from "sweetalert2"; // Importamos SweetAlert
import { useNavigate } from "react-router-dom";
import { getUser, getToken } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";

const AdjustStock = () => {
  const { codigo } = useParams();
  const token = getToken();
  const navigate = useNavigate();
  const [cantidad, setCantidad] = useState(0);
  const [stockActual, setStockActual] = useState(null); // Para almacenar el stock actual
  const [isLoading, setIsLoading] = useState(false); // Para manejar el estado de carga

  useEffect(() => {
    if (getUser().role === "OWNER") {
      navigate("/stock", { replace: true });
    }
  }, [navigate]);

  const handleStockChange = (e) => {
    setCantidad(Number(e.target.value)); // Establecer cantidad de manera segura
  };

  const handleSubmit = async () => {
    if (cantidad === 0) {
      Swal.fire({
        title: "Error",
        text: "La cantidad no puede ser 0.",
        icon: "error",
        confirmButtonText: "Aceptar",
      });
      return;
    }

    setIsLoading(true); // Activar carga mientras se realiza la solicitud

    try {
      const response = await axios.put(
        `${API_URL}/products/adjust_stock/${codigo}?cantidad=${cantidad}`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
    

      // Si la solicitud es exitosa
      Swal.fire({
        title: "Éxito",
        text: "Stock actualizado correctamente",
        icon: "success",
        confirmButtonText: "Aceptar",
      });

      // Actualizamos el stock actual desde la respuesta (si está disponible)
      setStockActual(response.data.stock_actual || null);

    } catch (error) {
      // Manejo de error
      Swal.fire({
        title: "Error",
        text: "Hubo un error al ajustar el stock.",
        icon: "error",
        confirmButtonText: "Aceptar",
      });
    } finally {
      setIsLoading(false); // Desactivar carga después de la solicitud
    }
  };

  const handleNavigate = () => {
    navigate("/stock");
  };

  return (
    <div className="flex flex-col p-6 bg-white shadow-md rounded-lg">
      <h1 className="text-2xl font-bold mb-4">Ajustar Stock</h1>

      <input
        type="number"
        value={cantidad}
        onChange={handleStockChange}
        placeholder="Cantidad a ajustar"
        className="p-3 border border-gray-300 rounded-md shadow-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <button
        onClick={handleSubmit}
        disabled={cantidad === 0 || isLoading}  // Deshabilitar el botón si la cantidad es 0 o si está cargando
        className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400"
      >
        {isLoading ? "Ajustando..." : "Ajustar Stock"}
      </button>

      {/* Mostrar el stock actualizado si está disponible */}
      {stockActual !== null && (
        <>
        
        <p className="text-lg font-semibold text-gray-700 mt-4">Stock actualizado: {stockActual}</p>
        <button className="bg-slate-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400" onClick={handleNavigate}>
          Mostrar Listado
        </button>
        </>
      )}
    </div>
  );
};

export default AdjustStock;
