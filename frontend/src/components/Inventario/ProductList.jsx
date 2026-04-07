import React, { useEffect, useState, useRef } from "react";
import { Search, Plus, Building2, PackagePlus } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { FaEye } from "react-icons/fa";
import { MdDelete } from "react-icons/md";
import Swal from "sweetalert2";
import { appendSucursalParam, getUser, getToken } from "../../utils/sucursal";

const ITEMS_PER_PAGE = 6;
import { API_URL } from "../../utils/api";

export default function ProductList() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [mostrarInput, setMostrarInput] = useState(false);
  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const [categories, setCategories] = useState([]);
  const [colors, setColors] = useState([]);
  const [selectedColor, setSelectedColor] = useState("");
  const [sucursales, setSucursales] = useState([]);
  const [sucursalFilter, setSucursalFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState("");
  const searchInputRef = useRef(null);
  const navigate = useNavigate();
  const token = getToken();
  const user = getUser();
  const esOwner = user.role === "OWNER";

  const [ingresoProduct, setIngresoProduct] = useState(null);
  const [ingresoFecha, setIngresoFecha] = useState("");
  const [ingresoCantidad, setIngresoCantidad] = useState("");
  const [ingresoMotivo, setIngresoMotivo] = useState("");
  const [ingresoSubmitting, setIngresoSubmitting] = useState(false);

  const todayLocalISO = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const openIngresoStock = (product) => {
    setIngresoProduct(product);
    setIngresoFecha(todayLocalISO());
    setIngresoCantidad("");
    setIngresoMotivo("");
  };

  const closeIngresoStock = () => {
    setIngresoProduct(null);
    setIngresoSubmitting(false);
  };

  const submitIngresoStock = async (e) => {
    e.preventDefault();
    if (!ingresoProduct?.id) return;
    const qty = parseInt(String(ingresoCantidad).trim(), 10);
    if (!Number.isFinite(qty) || qty < 1) {
      Swal.fire({ title: "Cantidad inválida", text: "Ingresá un entero mayor a 0.", icon: "warning" });
      return;
    }
    if (!ingresoFecha) {
      Swal.fire({ title: "Fecha", text: "Seleccioná la fecha del ingreso.", icon: "warning" });
      return;
    }
    setIngresoSubmitting(true);
    try {
      const body = {
        producto_id: ingresoProduct.id,
        fecha: ingresoFecha,
        cantidad: qty,
      };
      const motivoTrim = ingresoMotivo.trim();
      if (motivoTrim) body.motivo = motivoTrim;

      const { data } = await axios.post(`${API_URL}/products/ingreso-stock`, body, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (data?.success === false) {
        Swal.fire({ title: "Error", text: data?.message || "No se pudo registrar", icon: "error" });
        return;
      }
      const nuevoStock = data.stock_actual;
      setProducts((prev) =>
        prev.map((p) => (p.id === ingresoProduct.id ? { ...p, stock: nuevoStock } : p))
      );
      closeIngresoStock();
      Swal.fire({
        title: "Ingreso registrado",
        text: `Stock actual: ${nuevoStock} unidades.`,
        icon: "success",
        timer: 2200,
        showConfirmButton: false,
      });
    } catch (error) {
      const d = error.response?.data?.detail;
      const msg = Array.isArray(d)
        ? d.map((x) => x.msg || x).join(" ")
        : d ||
          (typeof error.response?.data === "string" ? error.response.data : null) ||
          error.response?.data?.message ||
          "No se pudo registrar el ingreso.";
      Swal.fire({ title: "Error", text: String(msg), icon: "error" });
    } finally {
      setIngresoSubmitting(false);
    }
  };

  useEffect(() => {
    if (!loading && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [loading]);

  useEffect(() => {
    if (!esOwner || !token) return;
    axios
      .get(`${API_URL}/sucursales/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : [];
        setSucursales(list.filter((s) => (s.nombre || "") !== "Sucursal Principal"));
      })
      .catch((error) => {
        console.error("Error al obtener sucursales:", error);
        if (error.response?.status === 500) {
          console.error("Detalle del servidor (sucursales):", error.response.data?.detail || error.response.data);
        }
        setSucursales([]);
      });
  }, [esOwner, token]);

  useEffect(() => {
    const fetchProducts = async () => {
      if (!token) return;
      setLoading(true);
      try {
        let url = `${API_URL}/products/all`;
        if (esOwner && sucursalFilter) {
          url += `?sucursal_id=${sucursalFilter}`;
        } else if (!esOwner) {
          url = appendSucursalParam(url);
        }
        const response = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setProducts(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        console.error("❌ Error al obtener productos:", error);
        if (error.response?.status === 500 && error.response?.data?.detail) {
          console.error("Detalle del servidor:", error.response.data.detail);
        }
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [token, esOwner, sucursalFilter]);

  useEffect(() => {
    const fetchCategories = async () => {
      if (!token) return;
      try {
        const response = await axios.get(`${API_URL}/categories/all`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setCategories(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        console.error("❌ Error al obtener categorías:", error);
      }
    };
    fetchCategories();
  }, [token]);

  useEffect(() => {
    const fetchColors = async () => {
      if (!token) return;
      try {
        const response = await axios.get(`${API_URL}/colors/all`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setColors(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        console.error("Error al obtener colores:", error);
      }
    };
    fetchColors();
  }, [token]);

  const filteredProducts = products.filter(
    (product) => {
      const matchSearch =
        product.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.codigo && product.codigo.toString().toLowerCase().includes(searchTerm.toLowerCase()));
      const matchCategory = !selectedCategory || (product.categoria && String(product.categoria.id) === selectedCategory);
      const matchColor = !selectedColor || (product.color && String(product.color.id) === selectedColor);
      return matchSearch && matchCategory && matchColor;
    }
  );

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedProducts = filteredProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);

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

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="w-10 h-10 border-2 border-slate-200 border-t-teal-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  const handleAgregarCategoria = async () => {
    if (!nuevaCategoria.trim()) {
      alert("El nombre de la categoría no puede estar vacío.");
      return;
    }

    try {
      const res = await axios.post(
        `${API_URL}/categories/register`,
        { name: nuevaCategoria },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.success === false) {
        Swal.fire({ title: "No se pudo crear", text: res.data?.message || "", icon: "error" });
        return;
      }
      const catRes = await axios.get(`${API_URL}/categories/all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCategories(Array.isArray(catRes.data) ? catRes.data : []);
      Swal.fire({
        title: "Éxito",
        text: "Categoría agregada (visible en todas las sucursales)",
        icon: "success",
        confirmButtonText: "Aceptar",
      });
      setNuevaCategoria("");
      setMostrarInput(false);
    } catch (error) {
      console.error("Error al agregar categoría:", error);
      const msg = error.response?.data?.message || "Hubo un error al agregar la categoría.";
      Swal.fire({ title: "Error", text: msg, icon: "error" });
    }
  };

  const deleteCategory = (categoria_id) => {
    if (!categoria_id) {
      Swal.fire({
        title: 'Error',
        text: 'Debe seleccionar una categoria',
        icon: 'error',
        confirmButtonText: 'Reintentar'
      });
      return;
    }

    axios
      .delete(`${API_URL}/categories/${categoria_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((response) => {
        Swal.fire({
          title: 'Éxito',
          text: 'Categoría eliminada correctamente',
          icon: 'success',
          confirmButtonText: 'Aceptar'
        });
        setCategories((prevCategories) =>
          prevCategories.filter((category) => category.id !== categoria_id)
        );
      })
      .catch((error) => {
        console.error("Error al eliminar la categoría:", error);
        alert("Hubo un problema al eliminar la categoría.");
      });
  };

  const handleViewProduct = (product) => {
    if (product && product.codigo) {
      navigate(`/stock/details/${product.codigo}`);
    } else {
      console.error("Invalid product ID");
    }
  };

  const deleteProduct = async (product) => {
    const codigo = product?.codigo;
    if (!codigo) {
      console.error("ID de producto no válido");
      return;
    }

    try {
      const confirmDelete = await Swal.fire({
        title: "¿Estás seguro?",
        text: "No podrás revertir esto",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        cancelButtonColor: "#3085d6",
        confirmButtonText: "Sí, eliminar",
        cancelButtonText: "Cancelar",
      });

      if (!confirmDelete.isConfirmed) {
        console.log("Eliminación cancelada");
        return;
      }

      const params =
        esOwner && product.sucursal_id != null
          ? { sucursal_id: product.sucursal_id }
          : {};

      const response = await axios.delete(`${API_URL}/products/${encodeURIComponent(codigo)}`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });

      if (response.data?.success === false && response.data?.message) {
        Swal.fire("Error", response.data.message, "error");
        return;
      }

      setProducts((prevProducts) =>
        prevProducts.filter((p) => {
          if (p.codigo !== codigo) return true;
          if (!esOwner) return false;
          const a = product.sucursal_id ?? null;
          const b = p.sucursal_id ?? null;
          return a !== b;
        })
      );

      await Swal.fire("Eliminado", "El producto ha sido eliminado.", "success");
    } catch (error) {
      console.error("❌ Error al eliminar el producto:", error);
      const msg =
        error.response?.data?.message ||
        error.response?.data?.detail ||
        "No se pudo eliminar el producto.";
      Swal.fire("Error", msg, "error");
    }
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Inventario</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Las categorías del filtro son el mismo catálogo en todas las sucursales.
          </p>
        </div>
        <Link
          to="/stock/new"
          style={{ backgroundColor: "#2563eb", color: "#fff" }}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg shadow-sm hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Nuevo producto
        </Link>
      </div>

      {/* Acciones de categoría - fuera de la tabla */}
      <div className="flex items-center gap-2 mb-4">
        <button
          className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
          onClick={() => setMostrarInput(!mostrarInput)}
        >
          {mostrarInput ? "Cerrar" : "Nueva categoría"}
        </button>
        {mostrarInput && (
          <>
            <input
              type="text"
              value={nuevaCategoria}
              onChange={(e) => setNuevaCategoria(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg w-40 text-sm"
              placeholder="Categoría..."
            />
            <button
              className="px-3 py-1.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700"
              onClick={handleAgregarCategoria}
            >
              Guardar
            </button>
          </>
        )}
        <button
          className="px-3 py-1.5 text-sm text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 disabled:opacity-50"
          onClick={() => deleteCategory(selectedCategory)}
          disabled={!selectedCategory}
        >
          Eliminar categoría
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        {/* Barra de búsqueda y filtros */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                ref={searchInputRef}
                autoFocus
                placeholder="Buscar por código o nombre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchTerm.trim()) {
                    e.preventDefault();
                    const match = products.find(
                      (p) => p.codigo && p.codigo.toLowerCase() === searchTerm.trim().toLowerCase()
                    );
                    if (match) {
                      navigate(`/stock/details/${match.codigo}`);
                    } else if (filteredProducts.length === 1) {
                      navigate(`/stock/details/${filteredProducts[0].codigo}`);
                    }
                  }
                }}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              {esOwner && sucursales.length > 0 && (
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-500" />
                  <select
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                    value={sucursalFilter}
                    onChange={(e) => {
                      setSucursalFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    title="Filtrar por sucursal"
                  >
                    <option value="">Todas las sucursales</option>
                    {sucursales.map((s) => (
                      <option key={s.id} value={s.id}>{s.nombre}</option>
                    ))}
                  </select>
                </div>
              )}
              <select
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="">Todas las categorías</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <select
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                value={selectedColor}
                onChange={(e) => {
                  setSelectedColor(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="">Todos los colores</option>
                {colors.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <table className="table-professional">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Marca</th>
              <th>Categoría</th>
              <th>Color</th>
              <th>Talle</th>
              <th>Precio</th>
              <th>Stock</th>
              <th className="w-40 text-right pr-4">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paginatedProducts.map((product) => (
              <tr key={product.id ?? `${product.codigo}-${product.sucursal_id ?? "na"}`}>
                <td className="font-medium text-slate-900">{product.codigo}</td>
                <td>{product.nombre}</td>
                <td>{product.marca || "Generico"}</td>
                <td>{product.categoria?.name ?? "—"}</td>
                <td>{product.color?.name ?? "—"}</td>
                <td>{product.talle}</td>
                <td>${product.precio_venta}</td>
                <td>
                  <span className={product.stock < (product.stock_minimo || 5) ? "text-rose-600 font-medium" : ""}>
                    {product.stock}
                  </span>
                </td>
                <td className="text-right pr-2">
                  <div className="inline-flex items-center justify-end gap-0.5 flex-wrap">
                    {esOwner && (
                      <button
                        type="button"
                        className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                        onClick={() => openIngresoStock(product)}
                        title="Ingreso de stock (reposición)"
                      >
                        <PackagePlus className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg"
                      onClick={() => handleViewProduct(product)}
                      title="Ver"
                    >
                      <FaEye className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                      onClick={() => deleteProduct(product)}
                      title="Eliminar"
                    >
                      <MdDelete className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {esOwner && ingresoProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ingreso-stock-title"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) closeIngresoStock();
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 id="ingreso-stock-title" className="text-lg font-semibold text-slate-900">
                Ingreso de stock
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {ingresoProduct.codigo} · {ingresoProduct.nombre}
                <span className="block text-xs mt-0.5">
                  Stock actual: <strong>{ingresoProduct.stock}</strong>
                </span>
              </p>
            </div>
            <form onSubmit={submitIngresoStock} className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Fecha del ingreso</label>
                <input
                  type="date"
                  required
                  value={ingresoFecha}
                  onChange={(e) => setIngresoFecha(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Cantidad agregada</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={ingresoCantidad}
                  onChange={(e) => setIngresoCantidad(e.target.value)}
                  placeholder="Ej: 10"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Motivo <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={ingresoMotivo}
                  onChange={(e) => setIngresoMotivo(e.target.value)}
                  placeholder="Ej: Reposición por pedido"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={closeIngresoStock}
                  disabled={ingresoSubmitting}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={ingresoSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {ingresoSubmitting ? "Guardando…" : "Registrar ingreso"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Página {currentPage} de {totalPages || 1}
        </p>
        <div className="flex gap-2">
          <button
            onClick={prevPage}
            disabled={currentPage === 1}
            className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            onClick={nextPage}
            disabled={currentPage === totalPages || totalPages === 0}
            className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}