import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Trash2, User, X } from "lucide-react";
import Swal from "sweetalert2";
import { getSucursalId, getUser, getToken } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";
import { precioUnitarioPorMetodoPago } from "../../utils/precioProducto";

export default function NuevoCredito() {
  const [clientes, setClientes] = useState([]);
  const [searchCliente, setSearchCliente] = useState("");
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [productos, setProductos] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [paymentType] = useState("Crédito");
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [entregaInicial, setEntregaInicial] = useState("");
  const [fechaPago, setFechaPago] = useState("");
  const navigate = useNavigate();
  const token = getToken();

  const clienteSeleccionadoObj = clientes.find((c) => c.id === clienteSeleccionado);
  const saldoPendiente = total - (parseFloat(entregaInicial) || 0);

  useEffect(() => {
    if (getUser().role === "OWNER") {
      navigate("/Creditos", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${API_URL}/clientes/all`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("No autorizado"))))
      .then((data) => setClientes(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Error al obtener clientes:", err))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    const fetchProductos = async () => {
      try {
        const url = `${API_URL}/products/all` + (getSucursalId() != null ? `?sucursal_id=${getSucursalId()}` : "");
        const res = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setProductos(res.data ?? []);
      } catch (err) {
        console.error("Error al cargar productos:", err);
        setError("No se pudieron cargar los productos.");
      }
    };
    if (token) fetchProductos();
  }, [token]);

  const productosFiltrados = productos.filter(
    (p) =>
      p.nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.codigo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.talle && p.talle.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.talles && p.talles.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const clientesFiltrados = clientes.filter(
    (c) =>
      c.nombre?.toLowerCase().includes(searchCliente.toLowerCase()) ||
      c.apellido?.toLowerCase().includes(searchCliente.toLowerCase()) ||
      c.dni?.includes(searchCliente)
  );

  const obtenerPrecio = (producto) =>
    precioUnitarioPorMetodoPago(producto, paymentType);

  const agregarAlCarrito = () => {
    if (!selectedProduct) return;
    const producto = productos.find((p) => p.id === parseInt(selectedProduct));
    if (!producto) return;
    if (producto.stock <= 0) {
      Swal.fire({ icon: "warning", title: "Sin stock", text: `"${producto.nombre}" no tiene stock disponible.` });
      return;
    }
    const existing = carrito.find((item) => item.id === producto.id);
    if (existing) {
      actualizarCantidad(carrito.indexOf(existing), existing.cantidad + 1);
    } else {
      setCarrito([...carrito, { ...producto, cantidad: 1, subtotal: obtenerPrecio(producto) }]);
    }
  };

  const eliminarDelCarrito = (index) => {
    setCarrito(carrito.filter((_, i) => i !== index));
  };

  const actualizarCantidad = (index, cantidad) => {
    if (cantidad < 1) return;
    const next = [...carrito];
    next[index].cantidad = cantidad;
    next[index].subtotal = obtenerPrecio(next[index]) * cantidad;
    setCarrito(next);
  };

  useEffect(() => {
    setTotal(carrito.reduce((acc, item) => acc + item.subtotal, 0));
  }, [carrito]);

  useEffect(() => {
    setCarrito((prev) =>
      prev.map((item) => ({ ...item, subtotal: obtenerPrecio(item) * item.cantidad }))
    );
  }, [paymentType]);

  const handleSelectCliente = (cliente) => {
    setClienteSeleccionado(cliente.id);
    setSearchCliente("");
  };

  const clearCliente = () => {
    setClienteSeleccionado(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!clienteSeleccionadoObj) {
      Swal.fire({ icon: "warning", title: "Selecciona un cliente" });
      return;
    }
    if (!fechaPago) {
      Swal.fire({ icon: "warning", title: "Indica la fecha de pago" });
      return;
    }

    setCargando(true);
    const entrega = parseFloat(entregaInicial) || 0;
    const sid = getSucursalId();
    const formData = {
      ...(sid != null && { sucursal_id: sid }),
      cliente: String(clienteSeleccionadoObj.id),
      entrega_inicial: entrega,
      fecha: fechaPago,
      fecha_pago: fechaPago,
      metodo_pago: paymentType,
      productos: carrito.map((item) => ({
        producto_id: item.id,
        cantidad: item.cantidad,
        precio_unitario: obtenerPrecio(item),
        subtotal: item.subtotal,
      })),
      saldo_pendiente: saldoPendiente,
      total: total,
    };

    try {
      const response = await fetch(`${API_URL}/creditos/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (response.ok) {
        Swal.fire({ title: "Crédito creado", icon: "success", timer: 1500, showConfirmButton: false });
        navigate("/Creditos");
      } else {
        Swal.fire({ title: "Error", text: result?.message || "No se pudo crear el crédito", icon: "error" });
      }
    } catch (err) {
      Swal.fire({ title: "Error", text: "Reintenta nuevamente", icon: "error" });
    } finally {
      setCargando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="w-10 h-10 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Nuevo crédito</h1>
        <p className="text-slate-500 text-sm mt-0.5">Registrar venta a crédito</p>
      </div>

      {error && (
        <div className="mb-6 bg-amber-100 border border-amber-400 text-amber-800 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Columna izquierda: Cliente, Productos, Carrito */}
        <div className="space-y-6">
          {/* Cliente */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100">
              <h2 className="text-lg font-medium text-slate-900 flex items-center gap-2">
                <User className="h-5 w-5 text-indigo-500" />
                Cliente
              </h2>
            </div>
            <div className="p-4 sm:p-6">
              {clienteSeleccionadoObj ? (
                <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                  <span className="font-medium text-slate-900">
                    {clienteSeleccionadoObj.nombre} {clienteSeleccionadoObj.apellido}
                  </span>
                  <span className="text-sm text-slate-500">DNI: {clienteSeleccionadoObj.dni}</span>
                  <button
                    type="button"
                    onClick={clearCliente}
                    className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                    title="Cambiar cliente"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar por nombre, apellido o DNI"
                      value={searchCliente}
                      onChange={(e) => setSearchCliente(e.target.value)}
                      className="w-full pl-9 pr-4 py-3 sm:py-2.5 border border-slate-200 rounded-lg text-sm"
                    />
                  </div>
                  {searchCliente && clientesFiltrados.length > 0 && (
                    <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                      {clientesFiltrados.map((cliente) => (
                        <li
                          key={cliente.id}
                          onClick={() => handleSelectCliente(cliente)}
                          className="px-4 py-3 hover:bg-slate-50 cursor-pointer text-sm"
                        >
                          {cliente.nombre} {cliente.apellido} – {cliente.dni}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Productos */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100">
              <h2 className="text-lg font-medium text-slate-900">Productos</h2>
            </div>
            <div className="p-4 sm:p-6">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar producto..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-3 sm:py-2.5 border border-slate-200 rounded-lg text-sm"
                />
              </div>
              <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                {searchQuery && productosFiltrados.length > 0
                  ? productosFiltrados.map((producto) => (
                      <div
                        key={producto.id}
                        className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50/50"
                      >
                        <span className="text-sm truncate flex-1 min-w-0">
                          {producto.nombre}
                          {(producto.talle || producto.talles) && (
                            <span className="text-slate-500 ml-1">({producto.talle || producto.talles})</span>
                          )}
                          <span className="text-slate-500 ml-1">– {producto.codigo}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedProduct(String(producto.id))}
                          className={`ml-2 px-4 py-2.5 text-sm font-medium rounded-lg shrink-0 min-h-[44px] ${
                            selectedProduct === String(producto.id)
                              ? "bg-indigo-600 text-white"
                              : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                          }`}
                        >
                          {selectedProduct === String(producto.id) ? "Seleccionado" : "Seleccionar"}
                        </button>
                      </div>
                    ))
                  : searchQuery && (
                      <div className="text-center text-slate-500 py-4 text-sm">No se encontraron productos</div>
                    )}
              </div>
              <button
                type="button"
                onClick={agregarAlCarrito}
                disabled={!selectedProduct}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                <Plus className="h-4 w-4" />
                Agregar al carrito
              </button>
            </div>
          </div>

          {/* Carrito */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100">
              <h2 className="text-lg font-medium text-slate-900">Carrito</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="table-professional min-w-[500px]">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Cant.</th>
                    <th>Precio</th>
                    <th>Subtotal</th>
                    <th className="w-14"></th>
                  </tr>
                </thead>
                <tbody>
                  {carrito.map((item, index) => (
                    <tr key={index}>
                      <td className="font-medium text-slate-900">{item.codigo}</td>
                      <td className="max-w-[120px] truncate">{item.nombre}</td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          value={item.cantidad}
                          onChange={(e) => actualizarCantidad(index, parseInt(e.target.value) || 1)}
                          className="w-14 sm:w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-center text-sm min-h-[40px]"
                        />
                      </td>
                      <td>${obtenerPrecio(item)}</td>
                      <td className="font-medium">${(item.cantidad * obtenerPrecio(item)).toFixed(2)}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => eliminarDelCarrito(index)}
                          className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg min-h-[40px] min-w-[40px]"
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
                <div className="py-12 text-center text-slate-500 text-sm">El carrito está vacío</div>
              )}
            </div>
          </div>
        </div>

        {/* Columna derecha: Detalles del pago + acciones */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden xl:sticky xl:top-6">
            <div className="p-4 sm:p-6 border-b border-slate-100">
              <h2 className="text-lg font-medium text-slate-900">Detalles del pago</h2>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Entrega inicial</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={entregaInicial}
                  onChange={(e) => setEntregaInicial(e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-3 sm:py-2.5 border border-slate-200 rounded-lg text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de pago</label>
                <input
                  type="date"
                  value={fechaPago}
                  onChange={(e) => setFechaPago(e.target.value)}
                  className="w-full px-4 py-3 sm:py-2.5 border border-slate-200 rounded-lg text-sm min-h-[44px]"
                />
              </div>
            </div>
            <div className="p-4 sm:p-6 border-t border-slate-100 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Total</span>
                <span className="font-semibold text-slate-900">${total.toFixed(2)}</span>
              </div>
              {entregaInicial !== "" && parseFloat(entregaInicial) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Saldo pendiente</span>
                  <span className="font-medium text-indigo-600">${saldoPendiente.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => navigate("/Creditos")}
              className="flex-1 sm:flex-initial px-6 py-3 sm:py-2.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 min-h-[44px]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={cargando || carrito.length === 0 || !clienteSeleccionadoObj}
              className="flex-1 sm:flex-initial px-6 py-3 sm:py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              {cargando ? "Registrando…" : "Finalizar crédito"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
