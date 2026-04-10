import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Trash2, CreditCard, UserPlus } from "lucide-react";
import Swal from "sweetalert2";
import { getSucursalId, getUser, getToken } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";
import { precioUnitarioPorMetodoPago } from "../../utils/precioProducto";

export default function NuevaVenta() {
  const [productos, setProductos] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [paymentType, setPaymentType] = useState("Efectivo");
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const searchInputRef = useRef(null);
  const scanTimerRef = useRef(null);
  const navigate = useNavigate();

  const token = getToken();

  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // OWNER no puede cargar ventas; solo ver estadísticas y operaciones de gestión.
  useEffect(() => {
    if (getUser().role === "OWNER") {
      navigate("/ventas", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (getUser().role === "OWNER") return;
    const fetchProductos = async () => {
      try {
        const url = `${API_URL}/products/all` + (getSucursalId() != null ? `?sucursal_id=${getSucursalId()}` : "");
        const response = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setProductos(response.data);
      } catch (err) {
        console.error("Error al obtener los productos:", err);
        setError("Hubo un problema al cargar los productos.");
      }
    };
    fetchProductos();
  }, [token]);

  const productosFiltrados = productos.filter((producto) =>
    producto.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
    producto.codigo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (producto.talles &&
      producto.talles.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Debounce: espera 300ms tras el último caracter para detectar coincidencia exacta.
  // Evita que códigos parciales de la lectora disparen auto-selección prematura.
  useEffect(() => {
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    if (!searchQuery) return;
    scanTimerRef.current = setTimeout(() => {
      const coincidenciasCodigo = productos.filter(
        (p) => p.codigo && p.codigo.toLowerCase() === searchQuery.toLowerCase()
      );
      if (coincidenciasCodigo.length === 1) {
        const prod = coincidenciasCodigo[0];
        setSelectedProduct(prod.id);
        setTimeout(() => agregarAlCarrito(), 0);
      }
    }, 300);
    return () => clearTimeout(scanTimerRef.current);
  }, [searchQuery]);

  const agregarAlCarrito = () => {
    let productoId = selectedProduct;

    // Si no hay producto seleccionado pero hay búsqueda y resultados,
    // tomamos el primer resultado (ideal para lectora de código de barras).
    if (!productoId && searchQuery && productosFiltrados.length > 0) {
      productoId = productosFiltrados[0].id;
    }

    if (!productoId) return;

    const producto = productos.find((p) => p.id === parseInt(productoId));
    if (producto) {
      if (producto.stock <= 0) {
        Swal.fire({
          icon: "warning",
          title: "Sin Stock",
          text: `El producto "${producto.nombre}" no tiene stock disponible.`,
        });
        return;
      }

      const existingProduct = carrito.find((item) => item.id === producto.id);
      if (existingProduct) {
        actualizarCantidad(
          carrito.indexOf(existingProduct),
          existingProduct.cantidad + 1
        );
      } else {
        setCarrito([
          ...carrito,
          { ...producto, cantidad: 1, subtotal: obtenerPrecio(producto) },
        ]);
      }

      // Limpiar búsqueda y selección, y mantener el foco en el buscador
      setSearchQuery("");
      setSelectedProduct("");
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }
  };

  const eliminarDelCarrito = (index) => {
    const newCarrito = [...carrito];
    newCarrito.splice(index, 1);
    setCarrito(newCarrito);
  };

  const actualizarCantidad = (index, cantidad) => {
    if (cantidad < 1) return;
    const newCarrito = [...carrito];
    newCarrito[index].cantidad = cantidad;
    newCarrito[index].subtotal = obtenerPrecio(newCarrito[index]) * cantidad;
    setCarrito(newCarrito);
  };

  // Recalcular el total de la venta cuando cambie el carrito
  useEffect(() => {
    setTotal(
      carrito.reduce((acc, item) => acc + item.subtotal, 0)
    );
  }, [carrito]);

  // Recalcular el subtotal cuando cambie el tipo de pago
  useEffect(() => {
    const newCarrito = carrito.map((item) => ({
      ...item,
      subtotal: obtenerPrecio(item) * item.cantidad, // Recalcular el subtotal con la cantidad multiplicada
    }));
    setCarrito(newCarrito);
  }, [paymentType]); // Dependencia: cambia cuando se cambia el tipo de pago

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const productosVenta = carrito.map((item) => ({
      codigo: item.codigo,
      producto_id: item.id,
      cantidad: item.cantidad,
      precio_unitario: obtenerPrecio(item),
    }));
    const sid = getSucursalId();
    const body = {
      ...(sid != null && { sucursal_id: sid }),
      cliente: "Consumidor Final",
      metodo_pago: paymentType,
      productos: productosVenta,
      total: total,
      fecha: new Date().toISOString(),
    };
    try {
      const response = await axios.post(
        `${API_URL}/ventas/register`,
        body,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.status === 201 && response.data?.success !== false) {
        Swal.fire({ icon: "success", title: "Venta registrada correctamente." });
        navigate("/ventas");
      } else {
        setError(response.data?.message || "No se pudo registrar la venta.");
      }
    } catch (err) {
      console.error(
        "Error al crear la venta:",
        err.response?.data || err.message
      );
      const msg = err.response?.data?.detail ?? err.response?.data?.message ?? "Hubo un problema al registrar la venta.";
      setError(Array.isArray(msg) ? msg.join(", ") : msg);
    } finally {
      setLoading(false);
    }
  };

  const obtenerPrecio = (producto) =>
    precioUnitarioPorMetodoPago(producto, paymentType);

  const credito = () => {
    navigate("/NuevoCredito");
  }

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Nueva venta</h1>
          <p className="text-slate-500 text-sm mt-0.5">Registrar venta al contado</p>
        </div>
        <button
          onClick={credito}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
        >
          <UserPlus className="h-4 w-4" />
          Crear crédito personal
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-amber-100 border border-amber-400 text-amber-800 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-medium text-slate-900">Cliente</h2>
          <span className="bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-medium">
            Consumidor Final
          </span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="text-lg font-medium text-slate-900 mb-4">Productos</h2>
        <div className="mb-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              ref={searchInputRef}
              placeholder="Buscar producto..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
                  const query = searchQuery.trim().toLowerCase();
                  if (!query) return;
                  const exacta = productos.find(
                    (p) => p.codigo && p.codigo.toLowerCase() === query
                  );
                  if (exacta) {
                    setSelectedProduct(exacta.id);
                    setTimeout(() => agregarAlCarrito(), 0);
                  } else {
                    agregarAlCarrito();
                  }
                }
              }}
            />
          </div>
        </div>
        <div className="space-y-2 mb-4">
          {searchQuery && productosFiltrados.length > 0
            ? productosFiltrados.map((producto) => (
                <div
                  key={producto.id}
                  className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50/50 transition-colors"
                >
                  <span className="text-sm">
                    {producto.nombre}
                    {producto.talle && (
                      <span className="text-slate-500 ml-1">({producto.talle})</span>
                    )}
                    <span className="text-slate-500 ml-1">– {producto.codigo}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(producto.id)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      selectedProduct === producto.id
                        ? "bg-teal-600 text-white"
                        : "bg-teal-50 text-teal-700 hover:bg-teal-100"
                    }`}
                  >
                    {selectedProduct === producto.id ? "Seleccionado" : "Seleccionar"}
                  </button>
                </div>
              ))
            : searchQuery && (
                <div className="text-center text-slate-500 py-4">No se encontraron productos.</div>
              )}
        </div>
        <button
          type="button"
          onClick={agregarAlCarrito}
          disabled={!selectedProduct && (!searchQuery || productosFiltrados.length === 0)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
          Agregar al carrito
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-medium text-slate-900">Carrito</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="table-professional">
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>
                  {paymentType === "Efectivo"
                    ? "Precio efectivo"
                    : paymentType === "Transferencia"
                      ? "Precio transferencia"
                      : paymentType === "Credito"
                        ? "Precio tarjeta (crédito)"
                        : "Precio tarjeta (débito)"}
                </th>
                <th>Subtotal</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {carrito.map((item, index) => (
                <tr key={index}>
                  <td className="font-medium text-slate-900">{item.codigo}</td>
                  <td>{item.nombre}</td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      value={item.cantidad}
                      onChange={(e) =>
                        actualizarCantidad(index, parseInt(e.target.value) || 1)
                      }
                      className="w-16 px-2 py-1 border border-slate-200 rounded-lg text-center text-sm"
                    />
                  </td>
                  <td>${obtenerPrecio(item)}</td>
                  <td className="font-medium">${item.cantidad * obtenerPrecio(item)}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => eliminarDelCarrito(index)}
                      className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                      title="Quitar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {carrito.length === 0 && (
            <div className="py-12 text-center text-slate-500">El carrito está vacío</div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="text-lg font-medium text-slate-900 mb-4">Método de pago</h2>
        <div className="flex flex-wrap gap-6">
          {["Efectivo", "Transferencia", "Credito", "Débito"].map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 cursor-pointer text-sm text-slate-700"
            >
              <input
                type="radio"
                name="paymentType"
                value={opt}
                checked={paymentType === opt}
                onChange={() => setPaymentType(opt)}
                className="text-teal-600 border-slate-300 focus:ring-teal-500"
              />
              {opt === "Credito" ? "Tarjeta de Crédito" : opt === "Débito" ? "Tarjeta de Débito" : opt}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <span className="text-slate-500">Total:</span>
          <span className="text-2xl font-semibold text-slate-900">${total.toFixed(2)}</span>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || carrito.length === 0}
          className="inline-flex items-center justify-center px-6 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Registrando..." : "Finalizar venta"}
        </button>
      </div>
    </div>
  );
}