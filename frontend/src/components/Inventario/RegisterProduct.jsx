import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getSucursalId, getUser, getToken } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";

export default function ProductForm() {
  const user = getUser();
  const esOwner = user.role === "OWNER";
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [marca, setMarca] = useState("");
  const [category, setCategory] = useState("");
  const [colorId, setColorId] = useState("");
  const [talle, setTalle] = useState("");
  const [categories, setCategories] = useState([]);
  const [colors, setColors] = useState([]);
  const [codeExists, setCodeExists] = useState(false);

  const [stockInitial, setStockInitial] = useState("");
  const [stockMin, setStockMin] = useState("");
  const [priceEfectivo, setPriceEfectivo] = useState("");
  const [priceTransferencia, setPriceTransferencia] = useState("");
  const [priceSale, setPriceSale] = useState("");
  const [priceCost, setPriceCost] = useState("0");
  const [loading, setLoading] = useState(false);
  const codeInputRef = useRef(null);
  const esEmpleado = user.role === "EMPLEADO";
  const [sucursales, setSucursales] = useState([]);
  const [sucursalOwnerId, setSucursalOwnerId] = useState("");
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isLoadingColors, setIsLoadingColors] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const token = getToken();

  useEffect(() => {
    if (codeInputRef.current) {
      codeInputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (!esOwner || !token) return;
    axios
      .get(`${API_URL}/sucursales/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : [];
        setSucursales(list.filter((s) => (s.nombre || "") !== "Sucursal Principal"));
      })
      .catch(() => setSucursales([]));
  }, [esOwner, token]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await axios.get(
          `${API_URL}/categories/all`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = response.data;
        setCategories(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error(
          "Error al obtener las categorías:",
          error.response ? error.response.data : error.message
        );
        setCategories([]);
      } finally {
        setIsLoadingCategories(false);
      }
    };

    fetchCategories();
  }, [token]);

  useEffect(() => {
    const fetchColors = async () => {
      try {
        const response = await axios.get(`${API_URL}/colors/all`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setColors(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        console.error("Error al obtener los colores:", error);
        setColors([]);
      } finally {
        setIsLoadingColors(false);
      }
    };
    fetchColors();
  }, [token]);

  const sucursalParaApi = esOwner
    ? sucursalOwnerId === "" ? null : Number(sucursalOwnerId)
    : getSucursalId();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (esOwner && (sucursalOwnerId === "" || Number.isNaN(Number(sucursalOwnerId)))) {
      setError("Seleccioná una sucursal para cargar el producto.");
      setLoading(false);
      return;
    }

    // Convertir el id a número
    const categoriaId = Number(category);
    const colorIdNum = Number(colorId);

    if (isNaN(categoriaId)) {
      setError("ID de categoría inválido.");
      setLoading(false);
      return;
    }
    if (isNaN(colorIdNum)) {
      setError("Seleccioná un color.");
      setLoading(false);
      return;
    }

    const sid = sucursalParaApi;
    const costoEnviar = esEmpleado ? 0 : (priceCost === "" ? 0 : Number(priceCost));
    const pe =
      priceEfectivo === "" || priceEfectivo === null
        ? NaN
        : Number(priceEfectivo);
    const pt =
      priceTransferencia === "" || priceTransferencia === null
        ? NaN
        : Number(priceTransferencia);
    if (!Number.isFinite(pe) || pe <= 0) {
      setError("Ingresá un precio efectivo mayor a 0.");
      setLoading(false);
      return;
    }
    if (!Number.isFinite(pt) || pt <= 0) {
      setError("Ingresá un precio transferencia mayor a 0.");
      setLoading(false);
      return;
    }
    try {
      const response = await axios.post(
        `${API_URL}/products/register`,
        {
          ...(sid != null && !Number.isNaN(sid) && { sucursal_id: sid }),
          codigo: code,
          nombre: name,
          marca: marca,
          categoria_id: categoriaId,
          color_id: colorIdNum,
          talle: talle,
          stock: stockInitial,
          stock_minimo: stockMin,
          precio_et: 0,
          precio_efectivo: pe,
          precio_transferencia: pt,
          precio_venta: priceSale,
          precio_costo: costoEnviar,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 201 && response.data?.success !== false) {
        navigate("/stock");
      } else if (response.data?.success === false && response.data?.message) {
        setError(response.data.message);
      }
    } catch (error) {
      console.error(
        "Error al registrar el producto:",
        error.response ? error.response.data : error.message
      );
      setError("Error al registrar el producto. Inténtelo de nuevo más tarde.");
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = async (e) => {
    const newCode = (e.target.value || "").toUpperCase();
    setCode(newCode);

    if (newCode.trim() === "") {
      setCodeExists(false);
      return;
    }

    if (esOwner && (sucursalOwnerId === "" || Number.isNaN(Number(sucursalOwnerId)))) {
      setCodeExists(false);
      return;
    }

    try {
      const sid = sucursalParaApi;
      const url =
        sid != null && !Number.isNaN(sid)
          ? `${API_URL}/products/all?sucursal_id=${sid}`
          : `${API_URL}/products/all`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Verificar si el código ingresado ya existe
      const productExists = response.data.some(
        (product) => product.codigo === newCode
      );

      setCodeExists(productExists);
    } catch (error) {
      console.error("Error al verificar el código:", error);
      setCodeExists(false);
    }
  };

  return (
    <div className="p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Registrar Nuevo Producto</h1>

          {error && (
            <div className="bg-amber-100 border border-amber-400 text-amber-800 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="bg-white shadow-md rounded-lg p-6"
          >
            {esOwner && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sucursal
                </label>
                <select
                  value={sucursalOwnerId}
                  onChange={(e) => setSucursalOwnerId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  required
                >
                  <option value="">Seleccionar sucursal</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Código
              </label>
              <input
                type="text"
                ref={codeInputRef}
                value={code}
                onChange={handleCodeChange}
                className="w-full px-3 py-2 border rounded-md"
                required
              />
              {codeExists && (
                <div className="text-red-600 text-sm mt-1">
                  ⚠ Código existente, ingrese otro.
                </div>
              )}
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border rounded-md"
                required
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Marca
              </label>
              <input
                type="text"
                value={marca}
                onChange={(e) => setMarca(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoría
              </label>
              <p className="text-xs text-slate-500 mb-1">
                Las categorías son las mismas en todas las sucursales.
              </p>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                required
                disabled={isLoadingCategories}
              >
                <option value="">Seleccionar categoría</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Color
              </label>
              <p className="text-xs text-slate-500 mb-1">
                Catálogo global de colores (igual que categorías). Gestioná la lista en Inventario → Colores.
              </p>
              <select
                value={colorId}
                onChange={(e) => setColorId(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                required
                disabled={isLoadingColors}
              >
                <option value="">Seleccionar color</option>
                {colors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Talle
              </label>
              <input
                type="text"
                value={talle}
                onChange={(e) => setTalle(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border rounded-md"
                required
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Stock Inicial
              </label>
              <input
                type="number"
                value={stockInitial}
                onChange={(e) => setStockInitial(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                required
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Stock Mínimo
              </label>
              <input
                type="number"
                value={stockMin}
                onChange={(e) => setStockMin(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                required
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Precio venta (tarjeta / lista)
              </label>
              <input
                type="number"
                value={priceSale}
                onChange={(e) => setPriceSale(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                required
                min={0}
                step="0.01"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Precio efectivo
              </label>
              <input
                type="number"
                value={priceEfectivo}
                onChange={(e) => setPriceEfectivo(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                required
                min={0}
                step="0.01"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Precio transferencia
              </label>
              <input
                type="number"
                value={priceTransferencia}
                onChange={(e) => setPriceTransferencia(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                required
                min={0}
                step="0.01"
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Precio Costo
              </label>
              <input
                type="number"
                value={esEmpleado ? 0 : priceCost}
                onChange={(e) => setPriceCost(e.target.value)}
                readOnly={esEmpleado}
                placeholder={esEmpleado ? "ROL empleado: asignar 0. El administrador actualizará el costo." : undefined}
                className={`w-full px-3 py-2 border rounded-md ${esEmpleado ? "bg-slate-100 text-slate-500" : ""}`}
                required
              />
              {esEmpleado && (
                <p className="text-xs text-slate-500 mt-1">El administrador podrá ver y actualizar el precio de costo.</p>
              )}
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 cursor-pointer"
              disabled={loading || codeExists}
            >
              {loading ? "Registrando..." : "Guardar Producto"}
            </button>
          </form>
        </div>
    </div>
  );
}