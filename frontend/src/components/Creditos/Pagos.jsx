import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, Printer, DollarSign } from "lucide-react";
import axios from "axios";
import { MdDelete } from "react-icons/md";
import { AiOutlinePrinter } from "react-icons/ai";
import { getToken } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";

const Pagos = () => {
  const { credito_id } = useParams();
  const [credito, setCredito] = useState(null);
  const [pagos, setPagos] = useState([]);
  const [error, setError] = useState(null);
  useEffect(() => {
    const token = getToken();

    const fetchDatos = async () => {
      try {
        const creditoResponse = await axios.get(
          `${API_URL}/creditos/get/${credito_id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        setCredito(creditoResponse.data);
      } catch (err) {
        setError("Hubo un error al obtener los datos.");
      }
    };

    fetchDatos();
  }, [credito_id]);

  if (error) {
    return <div>{error}</div>;
  }

  if (!credito) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="w-72 h-72 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div className="bg-gray-100 p-6 rounded-lg shadow-md md:col-span-2">
            <h2 className="text-xl font-semibold mb-4">
              Información del Crédito
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p>
                  <strong>ID Crédito:</strong> {credito.id}
                </p>
                <p>
                  <strong>Cliente:</strong> {credito.cliente}
                </p>
                <p>
                  <strong>Fecha de Inicio:</strong> {credito.fecha_credito}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-100 p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">Estado Financiero</h2>
            <p>
              <strong>Saldo Pendiente:</strong> ${credito.saldo_pendiente}
            </p>
            <p>
              <strong>Estado:</strong> {credito.estado}
            </p>
          </div>
        </div>
        <div className="bg-white shadow-md rounded-lg  grid gap-4 p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Detalles Del Pago</h2>
          <input
            type="number"
            // value={entregaInicial} /
            // onChange={(e) => setEntregaInicial(parseFloat(e.target.value))}
            placeholder="Monto a Pagar"
            className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <input
            type="date"
            // value={fechaPago}
            // onChange={(e) => setFechaPago(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
    </div>
  );
};

export default Pagos;