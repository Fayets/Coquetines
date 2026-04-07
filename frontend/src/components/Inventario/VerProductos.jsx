import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import EditProduct from "./EditProduct";
import { appendSucursalParam, getUser, getToken } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";

const VerProductos = () => {
  const { codigo } = useParams(); // Obtiene el código del producto desde la URL
  const token = getToken(); // Token de autenticación, si es necesario
  const navigate = useNavigate(); // Hook para navegar
  const [product, setProduct] = useState(null); // Estado para el producto
  const [VerEditar, SetVerEditar] = useState(false); // Estado para mostrar/ocultar el componente de editar
  const user = getUser();
  const esOwner = user.role === "OWNER";
  const esEmpleado = user.role === "EMPLEADO";

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const url = appendSucursalParam(`${API_URL}/products/get/${codigo}`);
        const response = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setProduct(response.data);
      } catch (error) {
        console.error("Error al obtener el producto:", error);
      }
    };

    fetchProduct();
  }, [codigo, token]);

  if (!product) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="w-72 h-72 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  const handleNavigate = () => {
    navigate(`/stock/adjust/${product.codigo}`);
  };
  return (
    <div className="p-8">
        <div className="flex items-center mb-6">
          <h1 className="text-2xl font-bold">Detalle del Producto</h1>
        </div>

        {/* Grid of Product Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2>Detalles del Producto</h2>
            <p className="mb-2 mt-2">
              <strong>Nombre:</strong> {product.nombre}
            </p>
            <p className="mb-2 mt-2">
              <strong>Marca:</strong> {product.marca || "Generico"}
            </p>
            <p className="mb-2 mt-2">
              <strong>Categoría:</strong>{" "}
              {product.categoria?.name || "Sin categoría"}
            </p>
            <p className="mb-2 mt-2">
              <strong>Talle:</strong> {product.talle}
            </p>
            <p className="mb-2 mt-2">
              <strong>Stock:</strong> {product.stock}
            </p>
            <p className="mb-2 mt-2">
              <strong>Stock Minimo:</strong> {product.stock_minimo}
            </p>
            <p className="mb-2 mt-2">
              <strong>Precio Venta:</strong> ${product.precio_venta}
            </p>
            {!esEmpleado && (
              <p className="mb-2 mt-2">
                <strong>Precio Costo:</strong> ${product.precio_costo}
              </p>
            )}
            <p className="mb-2 mt-2">
              <strong>Precio E/T</strong> ${product.precio_et}
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">Acciones</h2>
            <button
              className="bg-blue-600 text-white px-4 py-2 rounded-md mr-2 w-full md:w-auto cursor-pointer"
              onClick={() => SetVerEditar(true)}
            >
              Editar Producto
            </button>
          </div>
        </div>

        {VerEditar && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <EditProduct product={product} />
          </div>
        )}
    </div>
  );
};

export default VerProductos;