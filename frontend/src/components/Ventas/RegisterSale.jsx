import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Trash2, UserPlus } from "lucide-react";
import Swal from "sweetalert2";
import { getSucursalId, getUser, getToken } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";
import { precioUnitarioPorMetodoPago } from "../../utils/precioProducto";

const TIPOS_PRECIO = ["Efectivo", "Transferencia", "Credito", "Débito"];
const METODOS_COBRO = ["Efectivo", "Transferencia", "Credito", "Débito"];

const PAGO_TOL = 0.02;

function fechaContableLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function NuevaVenta() {
  const [productos, setProductos] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pagos, setPagos] = useState([{ metodo_pago: "Efectivo", monto: "" }]);
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

  useEffect(() => {
    if (getUser().role === "OWNER") {
      navigate("/ventas", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (getUser().role === "OWNER") return;
    const fetchProductos = async () => {
      try {
        const url =
          `${API_URL}/products/all` +
          (getSucursalId() != null ? `?sucursal_id=${getSucursalId()}` : "");
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

  const productosFiltrados = productos.filter(
    (producto) =>
      producto.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      producto.codigo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (producto.talles &&
        producto.talles.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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

  const obtenerPrecio = (item) =>
    precioUnitarioPorMetodoPago(item, item.tipoPrecio || "Efectivo");

  const agregarAlCarrito = () => {
    let productoId = selectedProduct;

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
        const tipoPrecio = "Efectivo";
        const pu = precioUnitarioPorMetodoPago(producto, tipoPrecio);
        setCarrito([
          ...carrito,
          { ...producto, cantidad: 1, subtotal: pu, tipoPrecio },
        ]);
      }

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
    newCarrito[index].subtotal =
      obtenerPrecio(newCarrito[index]) * cantidad;
    setCarrito(newCarrito);
  };

  const setTipoPrecioLinea = (index, tipoPrecio) => {
    const newCarrito = [...carrito];
    newCarrito[index].tipoPrecio = tipoPrecio;
    newCarrito[index].subtotal =
      obtenerPrecio(newCarrito[index]) * newCarrito[index].cantidad;
    setCarrito(newCarrito);
  };

  useEffect(() => {
    setTotal(carrito.reduce((acc, item) => acc + item.subtotal, 0));
  }, [carrito]);

  useEffect(() => {
    const t = Number(total.toFixed(2));
    setPagos((prev) => {
      if (prev.length === 1) {
        return [{ ...prev[0], monto: t === 0 ? "" : t }];
      }
      return prev;
    });
  }, [total]);

  const sumaPagos = () =>
    pagos.reduce((acc, p) => acc + (parseFloat(p.monto) || 0), 0);

  const pagosValidos = () => {
    if (pagos.length < 1) return false;
    for (const p of pagos) {
      const m = parseFloat(p.monto);
      if (!p.metodo_pago || !(m > 0)) return false;
    }
    return Math.abs(sumaPagos() - total) <= PAGO_TOL;
  };

  const agregarMedioPago = () => {
    setPagos((prev) => [...prev, { metodo_pago: "Efectivo", monto: "" }]);
  };

  const quitarMedioPago = (index) => {
    setPagos((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const actualizarPago = (index, field, value) => {
    setPagos((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pagosValidos()) {
      setError(
        "Revisá los medios de cobro: cada monto debe ser mayor a 0 y la suma debe coincidir con el total."
      );
      return;
    }
    setLoading(true);
    setError(null);
    const productosVenta = carrito.map((item) => ({
      codigo: item.codigo,
      producto_id: item.id,
      cantidad: item.cantidad,
      precio_unitario: obtenerPrecio(item),
      tipo_precio: item.tipoPrecio || "Efectivo",
    }));
    const pagosPayload = pagos.map((p) => ({
      metodo_pago: p.metodo_pago,
      monto: Math.round((parseFloat(p.monto) + Number.EPSILON) * 100) / 100,
    }));
    const sid = getSucursalId();
    const body = {
      ...(sid != null && { sucursal_id: sid }),
      cliente: "Consumidor Final",
      productos: productosVenta,
      pagos: pagosPayload,
      total: Number(total.toFixed(2)),
      fecha: fechaContableLocal(),
    };
    try {
      const response = await axios.post(`${API_URL}/ventas/register`, body, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 201 && response.data?.success !== false) {
        Swal.fire({ icon: "success", title: "Venta registrada correctamente." });
        navigate("/ventas");
      } else {
        setError(response.data?.message || "No se pudo registrar la venta.");
      }
    } catch (err) {
      console.error("Error al crear la venta:", err.response?.data || err.message);
      const msg =
        err.response?.data?.detail ??
        err.response?.data?.message ??
        "Hubo un problema al registrar la venta.";
      setError(Array.isArray(msg) ? msg.join(", ") : msg);
    } finally {
      setLoading(false);
    }
  };

  const credito = () => {
    navigate("/NuevoCredito");
  };

  const diffPagos = sumaPagos() - total;

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
          <p className="text-xs text-slate-500 mt-1">
            El tipo de lista define el precio del ítem. El cobro se define abajo (puede ser mixto).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="table-professional">
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Lista de precio</th>
                <th>P. unitario</th>
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
                  <td>
                    <select
                      value={item.tipoPrecio || "Efectivo"}
                      onChange={(e) => setTipoPrecioLinea(index, e.target.value)}
                      className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 max-w-[140px]"
                    >
                      {TIPOS_PRECIO.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt === "Credito"
                            ? "Tarjeta crédito"
                            : opt === "Débito"
                              ? "Tarjeta débito"
                              : opt}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>${obtenerPrecio(item)}</td>
                  <td className="font-medium">
                    ${(item.cantidad * obtenerPrecio(item)).toFixed(2)}
                  </td>
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
        <h2 className="text-lg font-medium text-slate-900 mb-2">Cobro (medios de pago)</h2>
        <p className="text-xs text-slate-500 mb-4">
          Podés dividir el importe en varios medios. La suma debe ser igual al total de la venta.
        </p>
        <div className="space-y-3">
          {pagos.map((pago, idx) => (
            <div key={idx} className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Medio</label>
                <select
                  value={pago.metodo_pago}
                  onChange={(e) => actualizarPago(idx, "metodo_pago", e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 min-w-[160px]"
                >
                  {METODOS_COBRO.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt === "Credito" ? "Tarjeta crédito" : opt === "Débito" ? "Tarjeta débito" : opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="block text-xs text-slate-500 mb-1">Monto</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pago.monto}
                  onChange={(e) => actualizarPago(idx, "monto", e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
              {pagos.length > 1 && (
                <button
                  type="button"
                  onClick={() => quitarMedioPago(idx)}
                  className="text-sm text-rose-600 hover:underline mb-2"
                >
                  Quitar
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={agregarMedioPago}
          className="mt-4 text-sm font-medium text-teal-700 hover:text-teal-900"
        >
          + Agregar medio de pago
        </button>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-slate-600">
            Suma cobros: <strong>${sumaPagos().toFixed(2)}</strong>
          </span>
          <span className="text-slate-600">
            Total venta: <strong>${total.toFixed(2)}</strong>
          </span>
          {Math.abs(diffPagos) > PAGO_TOL && total > 0 && (
            <span className="text-amber-700">
              Diferencia: {diffPagos > 0 ? "+" : ""}
              {diffPagos.toFixed(2)}
            </span>
          )}
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
          disabled={loading || carrito.length === 0 || !pagosValidos()}
          className="inline-flex items-center justify-center px-6 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Registrando..." : "Finalizar venta"}
        </button>
      </div>
    </div>
  );
}
