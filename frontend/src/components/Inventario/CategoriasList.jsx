import React, { useState, useEffect } from "react";
import axios from "axios";
import { Plus, Pencil, Trash2 } from "lucide-react";
import Swal from "sweetalert2";
import { getToken } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";

export default function CategoriasList() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const token = getToken();

  const fetchCategories = async () => {
    try {
      const response = await axios.get(
        `${API_URL}/categories/all`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCategories(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error al obtener categorías:", error);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchCategories();
  }, [token]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) {
      Swal.fire({ title: "Campo vacío", text: "Ingresa un nombre", icon: "warning" });
      return;
    }
    try {
      const response = await axios.post(
        `${API_URL}/categories/register`,
        { name: newName.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data?.success !== false) {
        setNewName("");
        fetchCategories();
        Swal.fire({
          title: "Categoría creada",
          text: "Queda disponible en todas las sucursales.",
          icon: "success",
          timer: 2000,
          showConfirmButton: false,
        });
      } else {
        Swal.fire({ title: "Error", text: response.data?.message || "No se pudo crear", icon: "error" });
      }
    } catch (error) {
      Swal.fire({
        title: "Error",
        text: error.response?.data?.message || "No se pudo crear la categoría",
        icon: "error",
      });
    }
  };

  const startEdit = (cat) => {
    setEditingId(cat.id);
    setEditName(cat.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editName.trim()) return;
    try {
      const response = await axios.put(
        `${API_URL}/categories/update/${editingId}`,
        { name: editName.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data?.success !== false) {
        setEditingId(null);
        setEditName("");
        fetchCategories();
        Swal.fire({ title: "Categoría actualizada", icon: "success", timer: 1500, showConfirmButton: false });
      } else {
        Swal.fire({ title: "Error", text: response.data?.message || "No se pudo actualizar", icon: "error" });
      }
    } catch (error) {
      Swal.fire({
        title: "Error",
        text: error.response?.data?.message || "No se pudo actualizar",
        icon: "error",
      });
    }
  };

  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: "¿Eliminar categoría?",
      text: "Los productos de esta categoría quedarán sin categoría asignada.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!result.isConfirmed) return;
    try {
      await axios.delete(
        `${API_URL}/categories/${id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchCategories();
      Swal.fire({ title: "Categoría eliminada", icon: "success", timer: 1500, showConfirmButton: false });
    } catch (error) {
      Swal.fire({
        title: "Error",
        text: error.response?.data?.message || "No se pudo eliminar. Puede que tenga productos asociados.",
        icon: "error",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="w-10 h-10 border-2 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Categorías</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Un solo catálogo compartido por todas las sucursales: al crear o editar categorías, todos los locales ven las mismas opciones.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <form onSubmit={handleAdd} className="p-4 border-b border-slate-100 flex flex-wrap gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nueva categoría"
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm flex-1 min-w-[200px]"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" />
            Agregar
          </button>
        </form>

        <div className="divide-y divide-slate-100">
          {categories.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              No hay categorías. Agrega una para comenzar.
            </div>
          ) : (
            categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50"
              >
                {editingId === cat.id ? (
                  <form onSubmit={handleUpdate} className="flex items-center gap-3 flex-1">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="px-4 py-2 border border-slate-200 rounded-lg text-sm flex-1 max-w-xs"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="px-4 py-2 text-slate-600 text-sm font-medium hover:bg-slate-100 rounded-lg"
                    >
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="font-medium text-slate-900">{cat.name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg"
                        onClick={() => startEdit(cat)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                        onClick={() => handleDelete(cat.id)}
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
