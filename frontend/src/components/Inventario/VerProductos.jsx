import React, { useState, useEffect } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";
import Swal from "sweetalert2";
import EditProduct from "./EditProduct";
import { appendSucursalParam, getUser, getToken } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";

const INGRESOS_PAGE_SIZE = 10;

const VerProductos = () => {
  const { codigo } = useParams(); // Obtiene el código del producto desde la URL
  const token = getToken(); // Token de autenticación, si es necesario
  const [product, setProduct] = useState(null); // Estado para el producto
  const [VerEditar, SetVerEditar] = useState(false); // Estado para mostrar/ocultar el componente de editar
  const [ingresosHistorial, setIngresosHistorial] = useState([]);
  const [historialPage, setHistorialPage] = useState(1);
  const user = getUser();
  const esOwner = user.role === "OWNER";
  const esEmpleado = user.role === "EMPLEADO";

  const handleClickEditar = () => {
    if (!esOwner) {
      Swal.fire({
        title: "Sin permiso",
        text: "Solo el rol OWNER (dueña) puede editar productos. Consultá con la administración del local.",
        icon: "info",
        confirmButtonText: "Entendido",
      });
      return;
    }
    SetVerEditar(true);
  };

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const url = appendSucursalParam(`${API_URL}/products/get/${codigo}`);
        const response = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setProduct(response.data);
      } catch (error) {
        console.error("Error al obtener el producto:", error);
      }
    };

    fetchProduct();
  }, [codigo, token]);

  useEffect(() => {
    if (!product?.id || !token) return;
    setIngresosHistorial([]);
    axios
      .get(`${API_URL}/products/ingreso-stock/historial`, {
        params: { producto_id: product.id },
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((r) => setIngresosHistorial(Array.isArray(r.data) ? r.data : []))
      .catch(() => setIngresosHistorial([]));
  }, [product?.id, token]);

  useEffect(() => {
    setHistorialPage(1);
  }, [product?.id]);

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(ingresosHistorial.length / INGRESOS_PAGE_SIZE));
    setHistorialPage((p) => Math.min(Math.max(1, p), tp));
  }, [ingresosHistorial]);

  if (!product) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="w-72 h-72 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  const totalHistorialPages = Math.max(
    1,
    Math.ceil(ingresosHistorial.length / INGRESOS_PAGE_SIZE)
  );
  const historialPageSafe = Math.min(historialPage, totalHistorialPages);
  const historialStart = (historialPageSafe - 1) * INGRESOS_PAGE_SIZE;
  const ingresosPagina = ingresosHistorial.slice(
    historialStart,
    historialStart + INGRESOS_PAGE_SIZE
  );

  return (
    <div className="p-8">
        <div className="flex items-center mb-6">
          <h1 className="text-2xl font-bold">Detalle del Producto</h1>
        </div>

        {/* Grid of Product Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2>Detalles del Producto</h2>
            <p className="mb-2 mt-2">
              <strong>Nombre:</strong> {product.nombre}
            </p>
            <p className="mb-2 mt-2">
              <strong>Marca:</strong> {product.marca || "Generico"}
            </p>
            <p className="mb-2 mt-2">
              <strong>Categoría:</strong>{" "}
              {product.categoria?.name || "Sin categoría"}
            </p>
            <p className="mb-2 mt-2">
              <strong>Color:</strong> {product.color?.name ?? "—"}
            </p>
            <p className="mb-2 mt-2">
              <strong>Talle:</strong> {product.talle}
            </p>
            <p className="mb-2 mt-2">
              <strong>Stock:</strong> {product.stock}
            </p>
            <p className="mb-2 mt-2">
              <strong>Stock Minimo:</strong> {product.stock_minimo}
            </p>
            <p className="mb-2 mt-2">
              <strong>Precio Venta:</strong> ${product.precio_venta}
            </p>
            {!esEmpleado && (
              <p className="mb-2 mt-2">
                <strong>Precio Costo:</strong> ${product.precio_costo}
              </p>
            )}
            <p className="mb-2 mt-2">
              <strong>Precio E/T</strong> ${product.precio_et}
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">Acciones</h2>
            <button
              type="button"
              className="bg-blue-600 text-white px-4 py-2 rounded-md mr-2 w-full md:w-auto cursor-pointer hover:bg-blue-700"
              onClick={handleClickEditar}
            >
              Editar Producto
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-8 py-8 mb-8">
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
              Historial de ingresos de stock
            </h2>
            <p className="text-sm text-slate-500 mt-3 leading-relaxed max-w-2xl">
              Los movimientos se registran desde Inventario con el icono de caja (+). Se muestran{" "}
              {INGRESOS_PAGE_SIZE} por página.
            </p>
          </div>
          {ingresosHistorial.length === 0 ? (
            <p className="text-sm text-slate-500 pt-2">Aún no hay ingresos registrados para este producto.</p>
          ) : (
            <>
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                {ingresosPagina.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 text-sm bg-white hover:bg-slate-50/90"
                  >
                    <span className="text-slate-500 tabular-nums w-[8rem] shrink-0">{row.fecha}</span>
                    <span className="font-semibold text-emerald-700 w-16 shrink-0">+{row.cantidad}</span>
                    <span className="text-slate-600 min-w-0 flex-1">
                      {row.motivo ? (
                        <span className="text-slate-600">— {row.motivo}</span>
                      ) : (
                        <span className="text-slate-400">Sin motivo</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-4 mt-8 pt-6 border-t border-slate-100">
                <p className="text-sm text-slate-600">
                  Página <span className="font-medium text-slate-800">{historialPageSafe}</span> de{" "}
                  <span className="font-medium text-slate-800">{totalHistorialPages}</span>
                  <span className="text-slate-400 mx-2">·</span>
                  {ingresosHistorial.length} registro{ingresosHistorial.length !== 1 ? "s" : ""} en total
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setHistorialPage((p) => Math.max(1, p - 1))}
                    disabled={historialPageSafe <= 1}
                    className="px-4 py-2.5 text-sm font-medium border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistorialPage((p) => Math.min(totalHistorialPages, p + 1))}
                    disabled={historialPageSafe >= totalHistorialPages}
                    className="px-4 py-2.5 text-sm font-medium border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {esOwner && VerEditar && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <EditProduct product={product} />
          </div>
        )}
    </div>
  );
};

export default VerProductos;