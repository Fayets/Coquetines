import React, { useEffect, useState, useRef } from "react";
import { Search, Trash2, X, Plus } from "lucide-react";
import axios from "axios";
import Swal from "sweetalert2";
import { appendSucursalParam } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";

const ModalProductos = ({ isOpen, onClose, onAgregar, onSuccess, token, creditoId }) => {
  const [productos, setProductos] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [carrito, setCarrito] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const searchRef = useRef(null);
  const scanTimerRef = useRef(null);

  useEffect(() => {
    const fetchProductos = async () => {
      try {
        const url = appendSucursalParam(`${API_URL}/products/all`);
        const response = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setProductos(response.data);
      } catch (error) {
        console.error("Error al obtener productos:", error);
      }
    };

    if (isOpen) {
      fetchProductos();
      setSearchQuery("");
      setSelectedProduct(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Debounce para lectora de código de barras
  useEffect(() => {
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    if (!searchQuery) return;
    scanTimerRef.current = setTimeout(() => {
      const exacta = productos.filter(
        (p) => p.codigo && p.codigo.toLowerCase() === searchQuery.toLowerCase()
      );
      if (exacta.length === 1) {
        agregarProductoDirecto(exacta[0]);
      }
    }, 300);
    return () => clearTimeout(scanTimerRef.current);
  }, [searchQuery]);

  const agregarProductoDirecto = (producto) => {
    if (producto.stock <= 0) {
      Swal.fire("Sin stock", `El producto ${producto.nombre} no tiene stock`, "warning");
      return;
    }
    const yaExiste = carrito.find((item) => item.id === producto.id);
    if (yaExiste) {
      const idx = carrito.indexOf(yaExiste);
      actualizarCantidad(idx, yaExiste.cantidad + 1);
    } else {
      setCarrito((prev) => [
        ...prev,
        { ...producto, cantidad: 1, subtotal: producto.precio_venta },
      ]);
    }
    setSearchQuery("");
    setSelectedProduct(null);
    if (searchRef.current) searchRef.current.focus();
  };

  const agregarAlCarrito = () => {
    if (!selectedProduct) return;
    const producto = productos.find((p) => p.id === parseInt(selectedProduct));
    if (!producto) return;
    agregarProductoDirecto(producto);
  };

  const actualizarCantidad = (index, cantidad) => {
    if (cantidad < 1) return;
    const updated = [...carrito];
    updated[index].cantidad = cantidad;
    updated[index].subtotal = updated[index].precio_venta * cantidad;
    setCarrito(updated);
  };

  const eliminarDelCarrito = (index) => {
    const nuevo = [...carrito];
    nuevo.splice(index, 1);
    setCarrito(nuevo);
  };

  const productosFiltrados = searchQuery.trim()
    ? productos.filter(
        (producto) =>
          producto.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
          producto.codigo.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (producto.talle && producto.talle.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : [];

  const handleAgregar = async () => {
    if (!carrito.length) return;

    try {
      const payload = {
        productos: carrito.map((item) => ({
          producto_id: item.id,
          cantidad: item.cantidad,
          precio_unitario: item.precio_venta,
        })),
      };

      await axios.post(
        `${API_URL}/creditos/${creditoId}/agregar-productos`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      Swal.fire("Éxito", "Productos agregados al crédito", "success");
      setCarrito([]);
      setSearchQuery("");
      onClose();
      onSuccess?.();
    } catch (error) {
      console.error("Error al agregar productos:", error);
      Swal.fire("Error", "No se pudieron agregar los productos", "error");
    }
  };

  if (!isOpen) return null;

  return (
    <div style={overlayStyles}>
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">Agregar Productos</h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Buscador */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              ref={searchRef}
              autoFocus
              placeholder="Escanear código o buscar producto..."
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
                    agregarProductoDirecto(exacta);
                  } else if (selectedProduct) {
                    agregarAlCarrito();
                  }
                }
              }}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Resultados de búsqueda */}
          {productosFiltrados.length > 0 && (
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {productosFiltrados.map((producto) => (
                <div
                  key={producto.id}
                  className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <span className="text-sm">
                    {producto.nombre}
                    {producto.talle && (
                      <span className="text-slate-500 ml-1">({producto.talle})</span>
                    )}
                    <span className="text-slate-500 ml-1">– {producto.codigo}</span>
                  </span>
                  <button
                    onClick={() => setSelectedProduct(producto.id)}
                    className={`ml-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      selectedProduct === producto.id
                        ? "bg-indigo-600 text-white"
                        : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    }`}
                  >
                    {selectedProduct === producto.id ? "Seleccionado" : "Seleccionar"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {searchQuery.trim() && productosFiltrados.length === 0 && (
            <div className="text-center text-slate-500 py-4 text-sm mb-4">
              No se encontraron productos
            </div>
          )}

          {!searchQuery.trim() && carrito.length === 0 && (
            <div className="text-center text-slate-400 py-8 text-sm">
              Escaneá un código de barras o buscá un producto para agregar
            </div>
          )}

          <button
            type="button"
            onClick={agregarAlCarrito}
            disabled={!selectedProduct}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed mb-6"
          >
            <Plus className="h-4 w-4" />
            Agregar al carrito
          </button>

          {/* Carrito */}
          {carrito.length > 0 && (
            <>
              <h3 className="text-lg font-semibold text-slate-900 mb-3">Carrito</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200 mb-6">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-slate-600">Producto</th>
                      <th className="text-center px-4 py-2.5 font-medium text-slate-600">Cant.</th>
                      <th className="text-center px-4 py-2.5 font-medium text-slate-600">Precio</th>
                      <th className="text-center px-4 py-2.5 font-medium text-slate-600">Subtotal</th>
                      <th className="w-14 px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {carrito.map((item, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2.5 text-slate-900">{item.nombre}</td>
                        <td className="px-4 py-2.5 text-center">
                          <input
                            type="number"
                            min="1"
                            value={item.cantidad}
                            onChange={(e) => actualizarCantidad(i, parseInt(e.target.value))}
                            className="w-16 text-center border border-slate-200 rounded-lg p-1"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-center">${item.precio_venta}</td>
                        <td className="px-4 py-2.5 text-center font-medium">${item.subtotal}</td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => eliminarDelCarrito(i)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-slate-200">
          <button
            onClick={() => { setCarrito([]); setSearchQuery(""); onClose(); }}
            className="px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleAgregar}
            disabled={carrito.length === 0}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Agregar Productos
          </button>
        </div>
      </div>
    </div>
  );
};

const overlayStyles = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000,
};

export default ModalProductos
