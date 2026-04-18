import React, { useEffect, useState } from "react";
import axios from "axios";
import { AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getUser, getToken } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";

export default function StockControl() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const token = getToken();

  const navigate = useNavigate();

  useEffect(() => {
    const role = getUser().role;
    if (role === "OWNER" || role === "EMPLEADO") {
      navigate("/stock", { replace: true });
      return;
    }
  }, [navigate]);

  // Cargar productos desde el backend
  useEffect(() => {
    const fetchStock = async () => {
      try {
        const response = await axios.get(
          `${API_URL}/products/low_stock`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );      
        setProducts(response.data); // Asignar los datos a 'products'
      } catch (error) {
        console.error("Error fetching stock:", error);
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchStock();
    } else {
      console.error("Token not found");
    }
  }, [token]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="w-72 h-72 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  const handleNavigate = (product) => {
    console.log("Product to view:", product); 
    if (product && product.codigo) {
      navigate(`/stock/details/${product.codigo}`);
    } else {
      console.error("Invalid product ID");
    }
  };
  
  return (
    <div className="p-8">
        <h1 className="text-2xl font-bold mb-6">Control de Stock</h1>
        {products.length > 0 && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
            <div className="flex">
              <AlertTriangle className="h-6 w-6 mr-2" />
              <div>
                <p className="font-bold">Alerta de Stock Bajo</p>
                <p>Los siguientes productos tienen un stock por debajo del mínimo establecido.</p>
              </div>
            </div>
          </div>
        )}
        <table className="w-full bg-white shadow-md rounded-lg overflow-hidden">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Actual</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Mínimo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {products.map((product) => (
              <tr key={product.codigo}>
                <td className="px-6 py-4 whitespace-nowrap">{product.codigo}</td>
                <td className="px-6 py-4 whitespace-nowrap">{product.nombre}</td>
                <td className="px-6 py-4 whitespace-nowrap text-red-600 font-medium">{product.stock}</td>
                <td className="px-6 py-4 whitespace-nowrap">{product.stock_minimo}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    className="bg-blue-600 text-white px-3 py-1 rounded-md text-sm cursor-pointer"
                    onClick={() => handleNavigate(product)}

                  >
                    Ajustar Stock
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
    </div>
  );
}