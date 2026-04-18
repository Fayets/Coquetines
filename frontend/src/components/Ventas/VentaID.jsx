import { ArrowLeft } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import axios from "axios";
import { getToken } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";
export default function VentaDetail() {
  const { id } = useParams(); // Obtener el id desde la URL
  const navigate = useNavigate();

  const [venta, setVenta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [printing, setPrinting] = useState(false); // Estado para mostrar que se está imprimiendo

  useEffect(() => {
    const fetchVenta = async () => {
      try {
        const response = await axios.get(`${API_URL}/ventas/get/${id}`, {
          headers: {
            Authorization: `Bearer ${getToken()}`,
          },
        });
        setVenta(response.data);
      } catch {
        setError("Error al obtener los detalles de la venta");
      } finally {
        setLoading(false);
      }
    };

    fetchVenta();
  }, [id]);

  const handleBack = () => {
    navigate("/ventas");
  };

  const handlePrintRecibo = async () => {
    setPrinting(true);
    try {
      const response = await axios.get(`${API_URL}/reportes/generate_invoice/${id}`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
        responseType: "blob", // Para manejar archivos PDF
      });

      // Crear un enlace para descargar el PDF
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Recibo_Venta_${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Error al imprimir el recibo", err);
      alert("Error al generar el recibo.");
    } finally {
      setPrinting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="w-72 h-72 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return <div>{error}</div>;
  }

  return (
    <div className="p-8">
        <div className="flex items-center mb-6">
          <button className="mr-4" onClick={handleBack}>
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="text-2xl font-bold">Detalle de Venta</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">Información de la Venta</h2>
            <p className="mb-2"><strong>ID Venta:</strong> {venta.id}</p>
            <p className="mb-2"><strong>Fecha:</strong> {venta.fecha}</p>
            <p className="mb-2"><strong>Cliente:</strong> {venta.cliente}</p>
            <p className="mb-2"><strong>Total:</strong> ${venta.total}</p>
            {venta.pagos && venta.pagos.length > 0 && (
              <div className="mb-2 mt-3">
                <strong className="block mb-1">Pagos</strong>
                <ul className="text-sm text-slate-600 list-disc pl-5 space-y-0.5">
                  {venta.pagos.map((p, i) => (
                    <li key={i}>
                      {p.metodo_pago}: ${Number(p.monto).toFixed(2)}
                    </li>
                  ))}
                </ul>
                {venta.metodo_pago && (
                  <p className="text-xs text-slate-500 mt-1">Resumen: {venta.metodo_pago}</p>
                )}
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">Acciones</h2>
            <button
              onClick={handlePrintRecibo}
              disabled={printing}
              className="bg-green-600 text-white px-4 py-2 rounded-md mr-2"
            >
              {printing ? "Generando..." : "Imprimir recibo"}
            </button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Productos Vendidos</h2>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Producto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Código
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cantidad
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Precio Unitario
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {venta.productos.map((producto, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 whitespace-nowrap">{producto.nombre}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{producto.codigo}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{producto.cantidad}</td>
                  <td className="px-6 py-4 whitespace-nowrap">${producto.precio_unitario}</td>
                  <td className="px-6 py-4 whitespace-nowrap">${producto.subtotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </div>
  );
}