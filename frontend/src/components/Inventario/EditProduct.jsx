import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import Swal from 'sweetalert2';
import { getToken, getUser } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";

const EditProduct = ({ product }) => {
  const { codigo } = useParams();
  const token = getToken();
  const esEmpleado = getUser().role === "EMPLEADO";

  // Estado para las categorías
  const [categories, setCategories] = useState([]);
  const [editedProduct, setEditedProduct] = useState({
    codigo: product.codigo,
    nombre: product.nombre,
    marca: product.marca || "Generico",
    categoria_id: product.categoria.id,
    talle: product.talle,
    precio_costo: product.precio_costo,
    precio_venta: product.precio_venta,
    precio_et: product.precio_et,
    stock: product.stock,
    stock_minimo: product.stock_minimo,
  });

  // Obtener las categorías cuando el componente se monte
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await axios.get(
          `${API_URL}/categories/all`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        console.log(response.data);
        setCategories(response.data); // Guardamos las categorías en el estado
      } catch (error) {
        console.error("Error al obtener las categorías:", error);
      }      
    };
    fetchCategories();
  }, [token]);

  // Manejar cambios en los campos del formulario (textos en mayúsculas)
  const handleChange = (e) => {
    const { name, value } = e.target;
    const numFields = ["precio_costo", "precio_venta", "stock", "stock_minimo", "categoria_id"];
    const textFields = ["codigo", "nombre", "marca", "talle"];
    let newValue = value;
    if (numFields.includes(name)) {
      newValue = value === "" ? "" : Number(value);
    } else if (textFields.includes(name)) {
      newValue = (value || "").toUpperCase();
    }
    setEditedProduct({
      ...editedProduct,
      [name]: newValue,
    });
  };

  // Manejar el envío del formulario
  const handleSubmit = async () => {
    try {
      const formattedProduct = {
        codigo: String(editedProduct.codigo),
        nombre: String(editedProduct.nombre),
        marca: String(editedProduct.marca || "Generico"),
        categoria_id: Number(editedProduct.categoria_id),
        talle: String(editedProduct.talle),
        precio_costo: Number(editedProduct.precio_costo),
        precio_venta: Number(editedProduct.precio_venta),
        precio_et: Number(editedProduct.precio_et),
        stock: Number(editedProduct.stock),
        stock_minimo: Number(editedProduct.stock_minimo),
      };

      let url = `${API_URL}/products/update/${codigo}`;
      if (getUser().role === "OWNER" && product.sucursal_id != null) {
        url = `${url}?sucursal_id=${product.sucursal_id}`;
      }

      const response = await axios.put(url, formattedProduct, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data?.success === false) {
        Swal.fire({
          title: 'Error',
          text: response.data.message || 'No se pudo actualizar el producto.',
          icon: 'error',
          confirmButtonText: 'Reintentar'
        });
        return;
      }

      Swal.fire({
        title: 'Éxito',
        text: 'Producto modificado correctamente',
        icon: 'success',
        confirmButtonText: 'Aceptar'
      });
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.detail || 'Error al editar el producto';
      Swal.fire({
        title: 'Error',
        text: msg,
        icon: 'error',
        confirmButtonText: 'Reintentar'
      });
    }
  };

  return (
    <div className="flex flex-col space-y-4">
      <h1 className="text-2xl font-bold mb-4">Producto: {editedProduct.nombre}</h1>

      {/* Código */}
      <div className='mb-4'>
        <label className="font-bold">Código</label>
        <input
          type="text"
          name="codigo"
          value={editedProduct.codigo}
          onChange={handleChange}
          className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Nombre */}
      <div>
        <label className="font-bold mb-2">Nombre</label>
        <input
          type="text"
          name="nombre"
          value={editedProduct.nombre}
          onChange={handleChange}
          className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Marca */}
      <div>
        <label className="font-bold mb-2">Marca</label>
        <input
          type="text"
          name="marca"
          value={editedProduct.marca}
          onChange={handleChange}
          placeholder="Generico"
          className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Categoría */}
      <div>
        <label className="font-bold mb-2">Categoría</label>
        <select
          name="categoria_id"
          value={editedProduct.categoria_id}
          onChange={handleChange}
          className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Seleccionar categoría</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {/* Talle */}
      <div>
        <label className="font-bold mb-2">Talle</label>
        <input
          type="text"
          name="talle"
          value={editedProduct.talle}
          onChange={handleChange}
          className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Precio Costo: empleados no lo ven ni editan; admin lo actualiza */}
      <div>
        <label className="font-bold mb-2">Precio Costo</label>
        <input
          type="number"
          name="precio_costo"
          value={editedProduct.precio_costo}
          onChange={handleChange}
          readOnly={esEmpleado}
          placeholder={esEmpleado ? "ROL empleado: asignar 0. El administrador actualizará el costo." : undefined}
          className={`w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${esEmpleado ? "bg-slate-100 text-slate-500" : ""}`}
        />
        {esEmpleado && (
          <p className="text-xs text-slate-500 mt-1">Solo el administrador puede ver y editar el precio de costo.</p>
        )}
      </div>

      {/* Precio Venta */}
      <div>
        <label className="font-bold mb-2">Precio Venta</label>
        <input
          type="number"
          name="precio_venta"
          value={editedProduct.precio_venta}
          onChange={handleChange}
          className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {/* Precio E/T */}
      <div>
        <label className="font-bold mb-2">Precio E/T</label>
        <input
          type="number"
          name="precio_et"
          value={editedProduct.precio_et}
          onChange={handleChange}
          className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Stock Actual */}
      <div>
        <label className="font-bold mb-2">Stock Actual</label>
        <input
          type="number"
          name="stock"
          value={editedProduct.stock}
          onChange={handleChange}
          className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Stock Mínimo */}
      <div>
        <label className="font-bold mb-2">Stock Mínimo</label>
        <input
          type="number"
          name="stock_minimo"
          value={editedProduct.stock_minimo}
          onChange={handleChange}
          className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Botón de guardar */}
      <div className="mt-6">
        <button
          onClick={handleSubmit}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          Guardar cambios
        </button>
      </div>
    </div>

  );
};

export default EditProduct;