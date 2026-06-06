import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, DollarSign, Trash2, Package, CreditCard, Calendar, User, Hash } from "lucide-react";
import axios from "axios";
import PagoModal from "../Utils/ModalPagos";
import ModalProductos from "../Utils/ModalProductos";
import Swal from "sweetalert2";
import { getToken } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";

const CreditoDetail = () => {
  const { credito_id } = useParams(); // Obtener ID de la URL
  const [credito, setCredito] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);
  const [modalPagoAbierto, setModalPagoAbierto] = useState(false);
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const ITEMS_PER_PAGE = 3;
  const [pagos, setPagos] = useState([]);
  const [isModalProductosOpen, setModalProductosOpen] = useState(false);
  const [productosSeleccionados, setProductosSeleccionados] = useState([]);
  const [productosPage, setProductosPage] = useState(1);
  const [pagosPage, setPagosPage] = useState(1);



  useEffect(() => {
    fetchCredito();
  }, [credito_id]); // solo cuando cambia el id
  
  useEffect(() => {
    if (credito?.id) {
      fetchPagos(credito.id); // solo una vez cuando el crédito se carga
      setProductosSeleccionados(credito.productos); // actualiza productos cuando se carga el crédito
    }
  }, [credito]);
  
  

  const handleAddProductos = async (productosSeleccionadosModal, creditoId) => {
    const productosFormateados = productosSeleccionadosModal.map((p) => ({
      producto_id: p.id,
      cantidad: p.cantidad,
      precio_unitario: p.precio_unitario,
    }));
  
    try {
      const response = await fetch(
        `${API_URL}/creditos/${creditoId}/agregar-productos`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ productos: productosFormateados }),
        }
      );
  
      if (!response.ok) {
        throw new Error("Error al agregar productos al crédito");
      }
  
      // Recargar productos
      await fetchCredito();
      console.log("Productos agregados correctamente");
    } catch (error) {
      console.error("Error al agregar productos:", error);
    }
  };
  
  
  

  const ITEMS_PER_PRODUCTO_PAGE = 4;
  const totalProductosPages = Math.ceil(
    productosSeleccionados.length / ITEMS_PER_PRODUCTO_PAGE
  );
  const startProductoIndex = (productosPage - 1) * ITEMS_PER_PRODUCTO_PAGE;
  const paginatedProductos = productosSeleccionados.slice(
    startProductoIndex,
    startProductoIndex + ITEMS_PER_PRODUCTO_PAGE
  );


  const fetchCredito = async () => {
    try {
      const response = await axios.get(`${API_URL}/creditos/get/${credito_id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
  
      // Verifica si los productos están aquí
      setCredito(response.data);  // Guardamos los datos completos en el estado
      setProducts(response.data.productos);  // Asegúrate de que `productos` esté correctamente seteado.
    } catch (error) {
      console.error("Error al obtener el crédito:", error);
    } finally {
      setLoading(false);
    }
  };
  
  

  const handleGuardarPago = async ({ fecha, monto }) => {
    const token = getToken();
    if (!token) {
      alert("No estás autenticado.");
      return;
    }
  
    // Validación
    if (!fecha || !monto || isNaN(monto)) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Por favor, completa todos los campos correctamente.",
      });
      return;
    }
  
    try {
      await axios.post(
        `${API_URL}/creditos/${credito.id}/registrar-pago`,
        { fecha_pago:fecha, monto },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setModalPagoAbierto(false);
      await fetchCredito();
    } catch (error) {
      console.error("Error al registrar el pago:", error.response?.data || error.message);
    }
    Swal.fire({
      icon: "success",
      title: "Éxito",
      text: "Pago registrado correctamente.",
    });
  };
  

  const [pagoInicialData, setPagoInicialData] = useState({
    fecha: "",
    monto: "",
  });

  const handleAbrirModalPago = () => {
    setPagoInicialData({
      fecha: Date, // fecha de hoy por default
      monto: credito.saldo_pendiente || "", // ejemplo: saldo pendiente como monto sugerido
    });
    setModalPagoAbierto(true);
  };

  const fetchPagos = async (creditoId) => {
    const token = getToken();
    try {
      const response = await axios.get(
        `${API_URL}/creditos/${creditoId}/pagos`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setPagos(response.data);
  
    } catch (error) {
      console.error("Error al obtener los pagos:", error);
    }
  };


  
  const token = getToken();
  if (!token) {
    console.error("Token no encontrado");
    return;
  }
 

  if (error) return <p>Error: {error}</p>;
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="w-72 h-72 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

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

  const totalPagosPages = Math.ceil(pagos.length / ITEMS_PER_PAGE);
  const startPagoIndex = (pagosPage - 1) * ITEMS_PER_PAGE;
  const paginatedPagos = pagos.slice(
    startPagoIndex,
    startPagoIndex + ITEMS_PER_PAGE
  );
  const handleDeleteProducto = async (productoId) => {
    const token = getToken();
  
    if (!token) {
      alert("No estás autenticado.");
      return;
    }
  
    try {
      const confirmDelete = await Swal.fire({
        title: "¿Estás seguro?",
        icon: "question",
        text: "¿Desea eliminar este producto?",
        confirmButtonText: "Eliminar",
        showCancelButton: true,
        cancelButtonText: "Cancelar",
      });
      if (!confirmDelete.isConfirmed) return;
  
      // Eliminar el producto
      const response = await axios.delete(
        `${API_URL}/creditos/producto/${productoId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
  
      if (response.status === 200) {
        Swal.fire({
                  
                  title: "Exito",
                  icon: 'success',
                  text: `El producto fue borrado con exito`,
                });
     
        await fetchCredito(); // Vuelve a obtener los productos actualizados
      }
    } catch (error) {
  

      console.error("Error al eliminar el producto:", error);
      Swal.fire({
                  
        title: "Error",
        icon: 'error',
        text: `El producto no se pudo borrar, reintente nuevamente`,
        confirmButtonText:"Reintentar"
      });
    }
  };

  const handleDeletePago = async (pagoId) => {
    const token = getToken();
  
    if (!token) {
      alert("No estás autenticado.");
      return;
    }
  
    try {
      const confirmDelete = await Swal.fire({
        title: "¿Estás Seguro?",
        icon: 'question',
        text: "¿Desea eliminar este pago?",
        confirmButtonText: "Eliminar",
        showCancelButton: true,
        cancelButtonText: "Cancelar",
      });
  
      if (!confirmDelete.isConfirmed) return;
  
      const response = await axios.delete(
        `${API_URL}/creditos/pago/${pagoId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
  
      if (response.status === 200) {
        Swal.fire({
          title: "Éxito",
          icon: 'success',
          text: "El pago fue borrado con éxito",
        });
  
        await fetchCredito();
        await fetchPagos(credito.id); // actualizar la tabla de pagos
      }
    } catch (error) {
      console.error("Error al eliminar el pago:", error);
      Swal.fire({
        title: "Error",
        icon: 'error',
        text: "El pago no fue borrado, reintente nuevamente",
        confirmButtonText: "Reintentar",
      });
    }
  };
  
  

  
  const estadoColor = credito.estado === "Activo"
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-emerald-50 text-emerald-700 border-emerald-200";

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          to="/Creditos"
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Detalle de Crédito</h1>
          <p className="text-slate-500 text-sm mt-0.5">Crédito #{credito.id}</p>
        </div>
      </div>

      {/* Info + Estado */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-medium text-slate-900 mb-4">Información del Crédito</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-slate-100 rounded-lg">
                <Hash className="h-4 w-4 text-slate-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500">ID Crédito</p>
                <p className="text-sm font-medium text-slate-900">{credito.id}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 bg-slate-100 rounded-lg">
                <User className="h-4 w-4 text-slate-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Cliente</p>
                <p className="text-sm font-medium text-slate-900">{credito.cliente}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 bg-slate-100 rounded-lg">
                <Calendar className="h-4 w-4 text-slate-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Fecha de Inicio</p>
                <p className="text-sm font-medium text-slate-900">{credito.fecha_credito}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-medium text-slate-900 mb-4">Estado Financiero</h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-500">Saldo Pendiente</p>
              <p className="text-2xl font-semibold text-slate-900">${credito.saldo_pendiente}</p>
            </div>
            <div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${estadoColor}`}>
                {credito.estado}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Productos adquiridos */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-indigo-500" />
            <h2 className="text-lg font-medium text-slate-900">Productos adquiridos</h2>
          </div>
          <button
            onClick={() => setModalProductosOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Agregar
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="table-professional">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Precio Unitario</th>
                <th>Subtotal</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {paginatedProductos.length > 0 ? (
                paginatedProductos.map((producto, i) => (
                  <tr key={i}>
                    <td className="font-medium text-slate-900">{producto.nombre}</td>
                    <td>{producto.cantidad}</td>
                    <td>${producto.precio_unitario}</td>
                    <td className="font-medium">${producto.subtotal}</td>
                    <td>
                      <button
                        onClick={() => handleDeleteProducto(producto.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="text-center py-8 text-slate-400">
                    No hay productos agregados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalProductosPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100">
            <p className="text-sm text-slate-500">Página {productosPage} de {totalProductosPages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setProductosPage(productosPage - 1)}
                disabled={productosPage === 1}
                className="px-3 py-1.5 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                onClick={() => setProductosPage(productosPage + 1)}
                disabled={productosPage === totalProductosPages}
                className="px-3 py-1.5 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Entrega Inicial */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="flex items-center gap-2 p-6 border-b border-slate-100">
          <CreditCard className="h-5 w-5 text-emerald-500" />
          <h2 className="text-lg font-medium text-slate-900">Entrega Inicial</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="table-professional">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{credito.fecha_credito}</td>
                <td className="font-medium text-slate-900">${credito.entrega_inicial}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Historial de Pagos */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-500" />
            <h2 className="text-lg font-medium text-slate-900">Historial de Pagos</h2>
          </div>
          <button
            onClick={() => setModalPagoAbierto(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <DollarSign className="h-4 w-4" />
            Registrar pago
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="table-professional">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Monto</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {paginatedPagos.length > 0 ? (
                paginatedPagos.map((pago) => (
                  <tr key={pago.id}>
                    <td>{new Date(pago.fecha_pago).toLocaleDateString()}</td>
                    <td className="font-medium text-slate-900">${pago.monto}</td>
                    <td>
                      <button
                        onClick={() => handleDeletePago(pago.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Eliminar pago"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="text-center py-8 text-slate-400">
                    No hay pagos registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPagosPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100">
            <p className="text-sm text-slate-500">Página {pagosPage} de {totalPagosPages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPagosPage(pagosPage - 1)}
                disabled={pagosPage === 1}
                className="px-3 py-1.5 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                onClick={() => setPagosPage(pagosPage + 1)}
                disabled={pagosPage === totalPagosPages}
                className="px-3 py-1.5 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      <PagoModal
        isOpen={modalPagoAbierto}
        onClose={() => setModalPagoAbierto(false)}
        onSave={handleGuardarPago}
        pagoInicial={pagoInicialData}
      />
      <ModalProductos
        isOpen={isModalProductosOpen}
        onClose={() => setModalProductosOpen(false)}
        onAgregar={handleAddProductos}
        onSuccess={fetchCredito}
        token={getToken()}
        creditoId={credito?.id}
      />
    </div>
  );
};

export default CreditoDetail;