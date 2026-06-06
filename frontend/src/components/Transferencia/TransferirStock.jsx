import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import { Truck, Search, GripVertical, Trash2 } from "lucide-react";
import { getToken } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";

const SUCURSAL_PRINCIPAL = "Sucursal Principal";

export default function TransferirStock() {
  const [sucursales, setSucursales] = useState([]);
  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [productosOrigen, setProductosOrigen] = useState([]);
  const [busquedaOrigen, setBusquedaOrigen] = useState("");
  const [busquedaDestino, setBusquedaDestino] = useState("");
  const [itemsATransferir, setItemsATransferir] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [transfiriendo, setTransfiriendo] = useState(false);
  const token = getToken();

  useEffect(() => {
    if (!token) return;
    axios
      .get(`${API_URL}/sucursales/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : [];
        setSucursales(list.filter((s) => (s.nombre || "").trim() !== SUCURSAL_PRINCIPAL));
      })
      .catch(() => setSucursales([]));
  }, [token]);

  const cargarProductosOrigen = useCallback(() => {
    if (!origenId || !token) {
      setProductosOrigen([]);
      return;
    }
    setCargando(true);
    axios
      .get(`${API_URL}/products/all?sucursal_id=${origenId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((r) => setProductosOrigen(Array.isArray(r.data) ? r.data : []))
      .catch(() => setProductosOrigen([]))
      .finally(() => setCargando(false));
  }, [origenId, token]);

  useEffect(() => {
    cargarProductosOrigen();
  }, [cargarProductosOrigen]);

  const nombreOrigen = sucursales.find((s) => String(s.id) === String(origenId))?.nombre || "Origen";
  const nombreDestino = sucursales.find((s) => String(s.id) === String(destinoId))?.nombre || "Destino";

  const filtrarProductos = (lista, busqueda) => {
    if (!(busqueda || "").trim()) return lista;
    const q = busqueda.trim().toLowerCase();
    return lista.filter(
      (p) =>
        (p.codigo || "").toLowerCase().includes(q) ||
        (p.nombre || "").toLowerCase().includes(q) ||
        (p.talle || "").toLowerCase().includes(q)
    );
  };

  const productosOrigenFiltrados = filtrarProductos(productosOrigen, busquedaOrigen);
  const itemsDestinoFiltrados = filtrarProductos(itemsATransferir, busquedaDestino);

  const handleDragStart = (e, product) => {
    e.dataTransfer.setData("application/json", JSON.stringify(product));
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const o = parseInt(origenId, 10);
    const d = parseInt(destinoId, 10);
    if (!o || !d || o === d) {
      Swal.fire({ icon: "warning", title: "Elegí sucursal origen y destino distintas." });
      return;
    }
    try {
      const product = JSON.parse(e.dataTransfer.getData("application/json"));
      if (!product || !product.codigo) return;
      const stock = Math.max(0, parseInt(product.stock, 10) || 0);
      if (stock < 1) {
        Swal.fire({ icon: "warning", title: "Sin stock para transferir." });
        return;
      }
      setItemsATransferir((prev) => {
        const exist = prev.find((i) => i.codigo === product.codigo);
        if (exist) {
          const nuevaCant = Math.min(exist.stockMax, (exist.cantidad || 0) + 1);
          return prev.map((i) =>
            i.codigo === product.codigo ? { ...i, cantidad: nuevaCant } : i
          );
        }
        return [
          ...prev,
          {
            codigo: product.codigo,
            nombre: product.nombre || product.codigo,
            talle: product.talle || "",
            stockMax: stock,
            cantidad: 1,
          },
        ];
      });
    } catch (_) {}
  };

  const actualizarCantidad = (codigo, nuevaCantidad) => {
    const n = Math.max(0, parseInt(nuevaCantidad, 10) || 0);
    setItemsATransferir((prev) =>
      prev.map((i) => (i.codigo === codigo ? { ...i, cantidad: Math.min(i.stockMax, n) } : i))
    );
  };

  const quitarItem = (codigo) => {
    setItemsATransferir((prev) => prev.filter((i) => i.codigo !== codigo));
  };

  const handleTransferirTodo = async () => {
    const o = parseInt(origenId, 10);
    const d = parseInt(destinoId, 10);
    if (!o || !d || o === d) {
      Swal.fire({ icon: "warning", title: "Elegí sucursal origen y destino distintas." });
      return;
    }
    const list = itemsATransferir.filter((i) => (i.cantidad || 0) > 0);
    if (list.length === 0) {
      Swal.fire({ icon: "warning", title: "Agregá al menos un producto con cantidad." });
      return;
    }
    setTransfiriendo(true);
    let ok = 0;
    let errorMsg = null;
    for (const item of list) {
      try {
        await axios.post(
          `${API_URL}/sucursales/transferir-stock`,
          {
            sucursal_origen_id: o,
            sucursal_destino_id: d,
            producto_codigo: item.codigo,
            cantidad: item.cantidad,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        ok += 1;
      } catch (err) {
        errorMsg = err.response?.data?.detail || err.message || "Error al transferir.";
        break;
      }
    }
    setTransfiriendo(false);
    if (errorMsg) {
      Swal.fire({ icon: "error", title: errorMsg });
      return;
    }
    Swal.fire({
      icon: "success",
      title: ok === list.length ? "Transferencia realizada." : `Transferidos ${ok} de ${list.length}.`,
    });
    setItemsATransferir([]);
    cargarProductosOrigen();
  };

  const origenNum = parseInt(origenId, 10);
  const destinoNum = parseInt(destinoId, 10);
  const mismoDestino = origenNum && destinoNum && origenNum === destinoNum;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2 mb-1">
        <Truck className="h-7 w-7 text-teal-600" />
        Transferir stock entre sucursales
      </h1>
      <p className="text-slate-500 text-sm mb-6">
        Elegí origen y destino. Arrastrá productos de la izquierda a la derecha y luego Transferir.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Sucursal origen</label>
          <select
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 bg-white"
            value={origenId}
            onChange={(e) => setOrigenId(e.target.value)}
          >
            <option value="">Seleccionar</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Sucursal destino</label>
          <select
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 bg-white"
            value={destinoId}
            onChange={(e) => setDestinoId(e.target.value)}
          >
            <option value="">Seleccionar</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id} disabled={s.id === origenNum}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tabla origen: productos de la sucursal */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-3 border-b border-slate-100 flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Buscar por código, nombre o talle"
              className="flex-1 border-0 bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:ring-0"
              value={busquedaOrigen}
              onChange={(e) => setBusquedaOrigen(e.target.value)}
            />
          </div>
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
            <span className="text-sm font-medium text-slate-700">
              Productos en {nombreOrigen}
              {origenId && ` (${productosOrigenFiltrados.length})`}
            </span>
          </div>
          <div className="overflow-auto min-h-[280px] max-h-[400px]">
            {cargando ? (
              <div className="flex justify-center items-center py-12">
                <div className="w-8 h-8 border-2 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
              </div>
            ) : !origenId ? (
              <p className="p-4 text-slate-500 text-sm">Elegí una sucursal origen.</p>
            ) : productosOrigenFiltrados.length === 0 ? (
              <p className="p-4 text-slate-500 text-sm">No hay productos o no coinciden con la búsqueda.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="w-8"></th>
                    <th className="text-left py-2 px-2 font-medium text-slate-600">Código</th>
                    <th className="text-left py-2 px-2 font-medium text-slate-600">Nombre</th>
                    <th className="text-left py-2 px-2 font-medium text-slate-600">Talle</th>
                    <th className="text-right py-2 px-2 font-medium text-slate-600">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {productosOrigenFiltrados.map((p) => (
                    <tr
                      key={p.id}
                      draggable={p.stock > 0}
                      onDragStart={(e) => handleDragStart(e, p)}
                      className={`border-b border-slate-100 hover:bg-teal-50/50 ${
                        p.stock > 0 ? "cursor-grab active:cursor-grabbing" : "opacity-60"
                      }`}
                    >
                      <td className="py-2 px-2 text-slate-400">
                        {p.stock > 0 && <GripVertical className="h-4 w-4" />}
                      </td>
                      <td className="py-2 px-2 font-mono text-slate-800">{p.codigo}</td>
                      <td className="py-2 px-2 text-slate-800">{p.nombre}</td>
                      <td className="py-2 px-2 text-slate-600">{p.talle}</td>
                      <td className="py-2 px-2 text-right font-medium text-slate-800">{p.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Tabla destino: a transferir */}
        <div
          className="bg-white rounded-xl border-2 border-dashed border-slate-200 shadow-sm overflow-hidden flex flex-col transition-colors"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{ borderColor: mismoDestino ? "#fecaca" : undefined }}
        >
          <div className="p-3 border-b border-slate-100 flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Buscar en la lista a transferir"
              className="flex-1 border-0 bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:ring-0"
              value={busquedaDestino}
              onChange={(e) => setBusquedaDestino(e.target.value)}
            />
          </div>
          <div className="px-3 py-2 bg-teal-50 border-b border-teal-100">
            <span className="text-sm font-medium text-teal-800">
              A transferir → {nombreDestino}
              {itemsATransferir.length > 0 && ` (${itemsATransferir.length})`}
            </span>
            <p className="text-xs text-teal-600 mt-0.5">Soltá aquí los productos</p>
          </div>
          <div className="overflow-auto min-h-[280px] max-h-[400px]">
            {itemsATransferir.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <p className="text-slate-500 text-sm">Arrastrá productos desde la tabla de la izquierda.</p>
                <p className="text-slate-400 text-xs mt-1">Elegí origen y destino distintos.</p>
              </div>
            ) : itemsDestinoFiltrados.length === 0 ? (
              <p className="p-4 text-slate-500 text-sm">Ningún ítem coincide con la búsqueda.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left py-2 px-2 font-medium text-slate-600">Producto</th>
                    <th className="text-left py-2 px-2 font-medium text-slate-600">Código</th>
                    <th className="text-right py-2 px-2 font-medium text-slate-600">Cantidad</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {itemsDestinoFiltrados.map((i) => (
                    <tr key={i.codigo} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-2 text-slate-800">{i.nombre}</td>
                      <td className="py-2 px-2 font-mono text-slate-600">{i.codigo}</td>
                      <td className="py-2 px-2 text-right">
                        <input
                          type="number"
                          min={1}
                          max={i.stockMax}
                          value={i.cantidad}
                          onChange={(e) => actualizarCantidad(i.codigo, e.target.value)}
                          className="w-16 text-right border border-slate-300 rounded px-2 py-1 text-sm"
                        />
                        <span className="text-slate-400 text-xs ml-1">/ {i.stockMax}</span>
                      </td>
                      <td className="py-2 px-2">
                        <button
                          type="button"
                          onClick={() => quitarItem(i.codigo)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                          title="Quitar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={handleTransferirTodo}
          disabled={transfiriendo || itemsATransferir.length === 0 || mismoDestino}
          className="px-6 py-2.5 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {transfiriendo ? "Transfiriendo..." : "Transferir todo"}
        </button>
      </div>
    </div>
  );
}
