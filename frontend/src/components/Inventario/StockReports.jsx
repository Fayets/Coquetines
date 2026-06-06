import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Printer, Loader, Building2 } from "lucide-react";
import { getUser, getToken } from "../../utils/sucursal";

import { API_URL } from "../../utils/api";

export default function StockReports() {
  const [loading, setLoading] = useState(true);
  const [totalProducts, setTotalProducts] = useState(null);
  const [inventoryValue, setInventoryValue] = useState(null);
  const [lowStockCount, setLowStockCount] = useState(null);
  const [statsPorSucursal, setStatsPorSucursal] = useState([]);

  const token = getToken();
  const user = getUser();
  const esOwner = user.role === "OWNER";
  const navigate = useNavigate();

  useEffect(() => {
    if (user.role === "EMPLEADO") {
      navigate("/stock", { replace: true });
    }
  }, [user.role, navigate]);

  const fetchStockData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      if (esOwner) {
        const [totalRes, valueRes, lowRes, sucursalRes] = await Promise.all([
          axios.get(`${API_URL}/products/total_products`, { headers }),
          axios.get(`${API_URL}/products/inventory_value`, { headers }),
          axios.get(`${API_URL}/products/low_stock_count`, { headers }),
          axios.get(`${API_URL}/products/stats_por_sucursal`, { headers }),
        ]);
        setTotalProducts(totalRes.data?.total_products ?? 0);
        setInventoryValue(valueRes.data?.inventory_value ?? 0);
        setLowStockCount(lowRes.data?.low_stock_count ?? 0);
        setStatsPorSucursal(Array.isArray(sucursalRes.data) ? sucursalRes.data : []);
      } else {
        const [totalRes, valueRes, lowRes] = await Promise.all([
          axios.get(`${API_URL}/products/total_products`, { headers }),
          axios.get(`${API_URL}/products/inventory_value`, { headers }),
          axios.get(`${API_URL}/products/low_stock_count`, { headers }),
        ]);
        setTotalProducts(totalRes.data?.total_products ?? 0);
        setInventoryValue(valueRes.data?.inventory_value ?? 0);
        setLowStockCount(lowRes.data?.low_stock_count ?? 0);
      }
    } catch (error) {
      console.error("Error al obtener datos de stock:", error);
      if (error?.response?.status === 500) {
        console.error(
          "Detalle del servidor (stock/reportes):",
          error.response.data?.detail || error.response.data
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user.role === "EMPLEADO" || !token) return;
    fetchStockData();
  }, [token, user.role]);

  const generateInventoryPDF = async () => {
    try {
      const response = await axios.get(
        `${API_URL}/reportes/generate_inventory_pdf`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob", // Para recibir el archivo PDF como un blob
        }
      );

      // Crear un enlace para descargar el archivo PDF
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "inventario.pdf"); // Nombre del archivo PDF
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link); // Eliminar el enlace después de la descarga
    } catch (error) {
      console.error("Error al generar el PDF:", error);
    }
  };

  return (
    <div className="p-8">
        <h1 className="text-2xl font-bold mb-6 text-center">Reportes de Stock</h1>

        {/* Aquí hemos cambiado el grid a 4 columnas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Cuadro Total de Productos */}
          <div className="bg-white p-6 rounded-lg shadow-md flex flex-col items-center">
            <h2 className="text-lg font-semibold mb-2">Total de Productos</h2>
            {loading ? (
              <div className="flex justify-center items-center">
                <Loader className="animate-spin h-6 w-6 text-gray-600" />
              </div>
            ) : (
              <p className="text-3xl font-bold">{totalProducts}</p>
            )}
          </div>

          {/* Cuadro Valor del Inventario */}
          <div className="bg-white p-6 rounded-lg shadow-md flex flex-col items-center">
            <h2 className="text-lg font-semibold mb-2">Valor del Inventario</h2>
            {loading ? (
              <div className="flex justify-center items-center">
                <Loader className="animate-spin h-6 w-6 text-gray-600" />
              </div>
            ) : (
              <p className="text-3xl font-bold">${Number(inventoryValue ?? 0).toLocaleString()}</p>
            )}
          </div>

          {/* Cuadro Productos con Stock Bajo */}
          <div className="bg-white p-6 rounded-lg shadow-md flex flex-col items-center">
            <h2 className="text-lg font-semibold mb-2">Productos con Stock Bajo</h2>
            {loading ? (
              <div className="flex justify-center items-center">
                <Loader className="animate-spin h-6 w-6 text-gray-600" />
              </div>
            ) : (
              <p className="text-3xl font-bold text-red-600">{lowStockCount}</p>
            )}
          </div>

          {/* Cuadro Generar Reportes */}
          <div className="bg-white p-6 rounded-lg shadow-md flex flex-col items-center">
            <h2 className="text-lg font-semibold mb-2">Generar Reportes</h2>
            <div className="flex flex-col items-center gap-4">
              <select className="border rounded-md px-3 py-2 mb-4">
                <option>Seleccionar tipo de reporte</option>
                <option>Inventario Actual</option>
              </select>
              <button
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md"
                onClick={generateInventoryPDF}
              >
                <Printer className="h-5 w-5" />
                Generar Reporte
              </button>
            </div>
          </div>
        </div>

        {esOwner && statsPorSucursal.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Building2 className="h-6 w-6 text-teal-600" />
              Inventario por sucursal
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {statsPorSucursal.map((s) => (
                <div
                  key={s.sucursal_id}
                  className="bg-white p-5 rounded-lg shadow-md border border-slate-100"
                >
                  <h3 className="font-semibold text-slate-800 mb-3 truncate" title={s.sucursal_nombre}>
                    {s.sucursal_nombre}
                  </h3>
                  <div className="space-y-2 text-sm">
                    <p className="flex justify-between">
                      <span className="text-slate-500">Cantidad de productos</span>
                      <span className="font-semibold">{s.total_products ?? 0}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-slate-500">Valor del inventario</span>
                      <span className="font-semibold">
                        ${Number(s.inventory_value ?? 0).toLocaleString()}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}