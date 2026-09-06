import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { X, Save, Loader2, Trash2, Plus, Upload, Star } from "lucide-react";
import Swal from "sweetalert2";
import { API_URL } from "../../utils/api";

function stockStatusLabel(status) {
  if (status === "instock") return "En stock";
  if (status === "outofstock") return "Sin stock";
  if (status === "onbackorder") return "Pedido pendiente";
  return status || "—";
}

function PanelSection({ title, children }) {
  return (
    <section className="border border-slate-200 rounded-lg overflow-hidden">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 px-3 py-2 border-b border-slate-200">
        {title}
      </h3>
      <div className="p-3 space-y-3">{children}</div>
    </section>
  );
}

const emptyForm = {
  nombre: "",
  descripcion: "",
  descripcion_corta: "",
  precio_regular: "",
  precio_oferta: "",
  stock: "",
  estado: "publish",
  tipo: "simple",
  categoriaId: "",
  atributos: [],
  variaciones: [],
  imagenes: [],
};

function mapAtributosToForm(atributos, idRef) {
  return (atributos || []).map((a) => {
    idRef.current += 1;
    return {
      localId: idRef.current,
      id: a.id ?? 0,
      nombre: a.nombre || "",
      opcionesText: (a.opciones || []).join(", "),
      visible: !!a.visible,
      variacion: !!a.variacion,
    };
  });
}

function mapVariacionesToForm(variaciones, idRef) {
  return (variaciones || []).map((v) => {
    idRef.current += 1;
    return {
      localId: idRef.current,
      variacion_id: v.variacion_id,
      label:
        (v.atributos || []).map((a) => `${a.nombre}: ${a.opcion}`).join(" · ") ||
        `#${v.variacion_id}`,
      sku: v.sku || "",
      precio_regular: v.precio_regular || "",
      precio_oferta: v.precio_oferta || "",
      stock: v.stock != null ? String(v.stock) : "",
    };
  });
}

function mapImagenesToForm(imagenes, idRef) {
  return (imagenes || []).map((img) => {
    idRef.current += 1;
    return {
      localId: idRef.current,
      id: img.id ?? null,
      url: img.url || "",
      alt: img.alt || "",
    };
  });
}

export default function WooProductoSlidePanel({ token, wooId, open, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [categoriasWoo, setCategoriasWoo] = useState([]);
  const [loadingCategorias, setLoadingCategorias] = useState(false);
  const [uploadingImagen, setUploadingImagen] = useState(false);
  const [nuevaUrlImagen, setNuevaUrlImagen] = useState("");
  const onCloseRef = useRef(onClose);
  const atributoIdRef = useRef(0);
  const variacionIdRef = useRef(0);
  const imagenIdRef = useRef(0);
  const fileInputPrincipalRef = useRef(null);
  const fileInputGaleriaRef = useRef(null);
  onCloseRef.current = onClose;

  const applyDetalle = useCallback((data) => {
    atributoIdRef.current = 0;
    variacionIdRef.current = 0;
    imagenIdRef.current = 0;
    setDetalle(data);
    setForm({
      nombre: data.nombre || "",
      descripcion: data.descripcion || "",
      descripcion_corta: data.descripcion_corta || "",
      precio_regular: data.precio_regular || "",
      precio_oferta: data.precio_oferta || "",
      stock: data.stock != null ? String(data.stock) : "",
      estado: data.estado || "publish",
      tipo: data.tipo || "simple",
      categoriaId:
        data.categorias?.length > 0 && data.categorias[0].id != null
          ? String(data.categorias[0].id)
          : "",
      atributos: mapAtributosToForm(data.atributos, atributoIdRef),
      variaciones: mapVariacionesToForm(data.variaciones, variacionIdRef),
      imagenes: mapImagenesToForm(data.imagenes, imagenIdRef),
    });
    setNuevaUrlImagen("");
  }, []);

  useEffect(() => {
    if (!open || !wooId || !token) return;
    setLoading(true);
    setDetalle(null);
    setCategoriasWoo([]);
    axios
      .get(`${API_URL}/woo/tienda/woocommerce-productos/${wooId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => applyDetalle(res.data))
      .catch((err) => {
        const msg = err.response?.data?.detail || "No se pudo cargar el producto de WooCommerce.";
        Swal.fire("Error", typeof msg === "string" ? msg : "No se pudo cargar el producto.", "error");
        onCloseRef.current();
      })
      .finally(() => setLoading(false));
  }, [open, wooId, token, applyDetalle]);

  useEffect(() => {
    if (!open || !token) return;
    setLoadingCategorias(true);
    axios
      .get(`${API_URL}/woo/tienda/woocommerce-categorias`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setCategoriasWoo(Array.isArray(res.data) ? res.data : []))
      .catch(() => setCategoriasWoo([]))
      .finally(() => setLoadingCategorias(false));
  }, [open, token]);

  const buildPatchBody = () => {
    const stockNum = form.stock.trim() === "" ? null : Number(form.stock);
    if (form.stock.trim() !== "" && Number.isNaN(stockNum)) {
      throw new Error("STOCK_INVALID");
    }
    const body = {
      nombre: form.nombre,
      descripcion: form.descripcion,
      descripcion_corta: form.descripcion_corta,
      estado: form.estado,
      tipo: form.tipo,
      categoria_id: form.categoriaId === "" ? null : Number(form.categoriaId),
      atributos: form.atributos.map((a) => ({
        id: a.id ?? 0,
        nombre: a.nombre,
        opciones: a.opcionesText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        visible: a.visible,
        variacion: a.variacion,
      })),
    };
    if (detalle?.tipo !== "variable" && form.tipo !== "variable") {
      body.precio_regular = form.precio_regular;
      body.precio_oferta = form.precio_oferta;
      body.stock = stockNum;
    }
    if (form.tipo === "variable") {
      body.generar_variaciones = true;
      body.variaciones = form.variaciones.map((v) => {
        const stockVar = v.stock.trim() === "" ? null : Number(v.stock);
        if (v.stock.trim() !== "" && Number.isNaN(stockVar)) {
          throw new Error("STOCK_VAR_INVALID");
        }
        return {
          variacion_id: v.variacion_id,
          precio_regular: v.precio_regular,
          precio_oferta: v.precio_oferta,
          stock: stockVar,
        };
      });
    }
    body.imagenes = form.imagenes.map(({ id, url, alt }) => ({
      id: id || null,
      url,
      alt,
    }));
    return body;
  };

  const handleSave = async () => {
    if (!token || !wooId || saving || deleting) return;

    if (form.atributos.some((a) => !a.nombre.trim())) {
      Swal.fire("Error", "Completá el nombre de todos los atributos.", "error");
      return;
    }
    if (form.tipo === "simple" && form.atributos.some((a) => a.variacion)) {
      Swal.fire(
        "Error",
        "Para usar atributos en variaciones, cambiá el tipo del producto a Variable.",
        "error"
      );
      return;
    }

    let body;
    try {
      body = buildPatchBody();
    } catch (err) {
      if (err?.message === "STOCK_VAR_INVALID") {
        Swal.fire("Error", "El stock de una variación debe ser un número.", "error");
      } else {
        Swal.fire("Error", "El stock debe ser un número.", "error");
      }
      return;
    }
    setSaving(true);
    try {
      const res = await axios.patch(`${API_URL}/woo/tienda/woocommerce-productos/${wooId}`, body, {
        headers: { Authorization: `Bearer ${token}` },
      });
      applyDetalle(res.data);
      onSaved?.();
      Swal.fire({
        icon: "success",
        title: "Guardado",
        text: res.data?.message || "Producto actualizado en WooCommerce",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err) {
      const msg = err.response?.data?.detail || "No se pudo guardar el producto en WooCommerce.";
      Swal.fire("Error", typeof msg === "string" ? msg : "No se pudo guardar el producto.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePermanent = async () => {
    if (!token || !wooId || saving || deleting) return;
    const result = await Swal.fire({
      icon: "warning",
      title: "¿Eliminar definitivamente?",
      text: "El producto se borrará de WooCommerce y no se podrá recuperar. El SKU quedará libre para volver a publicar desde Coquetines.",
      showCancelButton: true,
      confirmButtonText: "Eliminar definitivamente",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626",
    });
    if (!result.isConfirmed) return;

    setDeleting(true);
    try {
      const res = await axios.delete(`${API_URL}/woo/tienda/woocommerce-productos/${wooId}`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { force: true },
      });
      onSaved?.();
      onClose();
      Swal.fire({
        icon: "success",
        title: "Eliminado",
        text: res.data?.message || "Producto eliminado definitivamente",
        timer: 2500,
        showConfirmButton: false,
      });
    } catch (err) {
      const msg = err.response?.data?.detail || "No se pudo eliminar el producto.";
      Swal.fire("Error", typeof msg === "string" ? msg : "No se pudo eliminar el producto.", "error");
    } finally {
      setDeleting(false);
    }
  };

  const addImagen = (imagen, asMain = false) => {
    imagenIdRef.current += 1;
    const entry = {
      localId: imagenIdRef.current,
      id: imagen.id ?? null,
      url: imagen.url || "",
      alt: imagen.alt || "",
    };
    setForm((f) => ({
      ...f,
      imagenes: asMain ? [entry, ...f.imagenes] : [...f.imagenes, entry],
    }));
  };

  const removeImagen = (index) => {
    setForm((f) => ({
      ...f,
      imagenes: f.imagenes.filter((_, i) => i !== index),
    }));
  };

  const setMainImagen = (index) => {
    if (index <= 0) return;
    setForm((f) => {
      const next = [...f.imagenes];
      const [img] = next.splice(index, 1);
      next.unshift(img);
      return { ...f, imagenes: next };
    });
  };

  const addImagenFromUrl = (asMain = false) => {
    const url = nuevaUrlImagen.trim();
    if (!url) {
      Swal.fire("Error", "Ingresá una URL de imagen válida.", "error");
      return;
    }
    addImagen({ id: null, url, alt: "" }, asMain);
    setNuevaUrlImagen("");
  };

  const uploadImagenFile = async (file, asMain = false) => {
    if (!file || !token) return;
    setUploadingImagen(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post(`${API_URL}/woo/tienda/woocommerce-imagenes`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });
      addImagen(res.data, asMain);
    } catch (err) {
      const msg = err.response?.data?.detail || "No se pudo subir la imagen.";
      Swal.fire({
        icon: "error",
        title: "Error al subir imagen",
        html: typeof msg === "string" ? msg.replace(/\n/g, "<br>") : "No se pudo subir la imagen.",
      });
    } finally {
      setUploadingImagen(false);
    }
  };

  const handleFileSelect = (e, asMain) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadImagenFile(file, asMain);
  };

  const updateVariacion = (index, field, value) => {
    setForm((f) => ({
      ...f,
      variaciones: f.variaciones.map((v, i) => (i === index ? { ...v, [field]: value } : v)),
    }));
  };

  const updateAtributo = (index, field, value) => {
    setForm((f) => ({
      ...f,
      atributos: f.atributos.map((a, i) => (i === index ? { ...a, [field]: value } : a)),
    }));
  };

  const addAtributo = () => {
    atributoIdRef.current += 1;
    setForm((f) => ({
      ...f,
      atributos: [
        ...f.atributos,
        {
          localId: atributoIdRef.current,
          id: 0,
          nombre: "",
          opcionesText: "",
          visible: true,
          variacion: f.tipo === "variable",
        },
      ],
    }));
  };

  const removeAtributo = (index) => {
    setForm((f) => ({
      ...f,
      atributos: f.atributos.filter((_, i) => i !== index),
    }));
  };

  if (!open) return null;

  const esVariable = form.tipo === "variable";
  const enPapelera = detalle?.estado === "trash";
  const busy = saving || deleting || uploadingImagen;
  const imagenPrincipal = form.imagenes[0] || null;
  const galeriaImagenes = form.imagenes.slice(1);

  return (
    <>
      <div
        className="fixed inset-0 bg-slate-900/40 z-[100]"
        onClick={() => !busy && onClose()}
        aria-hidden="true"
      />
      <aside
        className="fixed inset-y-0 right-0 z-[110] w-full max-w-lg bg-white shadow-2xl border-l border-slate-200 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="woo-panel-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 id="woo-panel-title" className="text-lg font-semibold text-slate-900">
              Producto WooCommerce
            </h2>
            {detalle && (
              <p className="text-xs text-slate-500 mt-0.5">
                {detalle.tipo_label} · SKU: {detalle.sku || "—"}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center min-h-[200px]">
            <Loader2 className="h-8 w-8 text-violet-600 animate-spin" />
          </div>
        ) : detalle ? (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {enPapelera && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Este producto está en la <strong>papelera</strong> de WooCommerce. Podés restaurarlo cambiando el
                  estado a Publicado o Borrador, o eliminarlo definitivamente.
                </div>
              )}

              <PanelSection title="Info general">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex-1 min-w-[140px]">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
                    <select
                      value={form.tipo}
                      onChange={(e) => {
                        const nuevoTipo = e.target.value;
                        setForm((f) => ({
                          ...f,
                          tipo: nuevoTipo,
                          atributos:
                            nuevoTipo === "variable"
                              ? f.atributos.map((a) => ({ ...a, variacion: true }))
                              : f.atributos,
                        }));
                      }}
                      disabled={busy}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:opacity-50"
                    >
                      <option value="simple">Simple</option>
                      <option value="variable">Variable</option>
                    </select>
                  </div>
                  <div className="pt-5">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                      {detalle.estado_label}
                    </span>
                  </div>
                </div>
                {detalle.tipo === "simple" && form.tipo === "variable" && (
                  <p className="text-xs text-violet-700 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                    Al guardar, el producto pasará a ser <strong>variable</strong>. Podés agregar atributos y
                    luego crear variaciones en WooCommerce.
                  </p>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    disabled={busy}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Descripción corta</label>
                  <textarea
                    value={form.descripcion_corta}
                    onChange={(e) => setForm((f) => ({ ...f, descripcion_corta: e.target.value }))}
                    disabled={busy}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-y disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Descripción</label>
                  <textarea
                    value={form.descripcion}
                    onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                    disabled={busy}
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-y disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">SKU</label>
                  <p className="text-sm text-slate-800 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                    {detalle.sku || "—"}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
                  <select
                    value={form.estado}
                    onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}
                    disabled={busy}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:opacity-50"
                  >
                    <option value="publish">Publicado</option>
                    <option value="draft">Borrador</option>
                    <option value="trash">Papelera</option>
                  </select>
                </div>
              </PanelSection>

              <PanelSection title="Atributos">
                {form.tipo === "simple" && (
                  <p className="text-xs text-slate-500">
                    Para agregar atributos de variación (talle, color, etc.), cambiá el tipo a{" "}
                    <strong>Variable</strong>.
                  </p>
                )}
                {form.atributos.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Este producto no tiene atributos.</p>
                ) : (
                  <div className="space-y-3">
                    {form.atributos.map((attr, idx) => (
                      <div key={attr.localId} className="border border-slate-100 rounded-lg p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-slate-600 mb-1">Nombre</label>
                            <input
                              type="text"
                              value={attr.nombre}
                              onChange={(e) => updateAtributo(idx, "nombre", e.target.value)}
                              disabled={busy || attr.id > 0}
                              placeholder="Ej: Talle, Color"
                              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm disabled:opacity-50 disabled:bg-slate-50"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAtributo(idx)}
                            disabled={busy}
                            className="mt-5 p-1.5 text-slate-400 hover:text-rose-600 rounded disabled:opacity-50"
                            aria-label="Quitar atributo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Opciones (separadas por coma)
                          </label>
                          <input
                            type="text"
                            value={attr.opcionesText}
                            onChange={(e) => updateAtributo(idx, "opcionesText", e.target.value)}
                            disabled={busy}
                            placeholder="Ej: 3, 4, 5"
                            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm disabled:opacity-50"
                          />
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs">
                          <label className="inline-flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={attr.visible}
                              onChange={(e) => updateAtributo(idx, "visible", e.target.checked)}
                              disabled={busy}
                              className="rounded border-slate-300 text-violet-600"
                            />
                            Visible
                          </label>
                          <label className="inline-flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={attr.variacion}
                              onChange={(e) => updateAtributo(idx, "variacion", e.target.checked)}
                              disabled={busy || form.tipo !== "variable"}
                              className="rounded border-slate-300 text-violet-600"
                            />
                            Usado en variaciones
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={addAtributo}
                  disabled={busy || form.tipo !== "variable"}
                  className="inline-flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="h-4 w-4" />
                  Agregar atributo
                </button>
              </PanelSection>

              {esVariable && (
                <PanelSection title="Variaciones — precios y stock">
                  {form.variaciones.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Todavía no hay variaciones. Guardá los cambios para generarlas automáticamente
                      desde los atributos (ej. Talle 1, 2).
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {form.variaciones.map((v, idx) => (
                        <div key={v.localId} className="border border-slate-100 rounded-lg p-3 space-y-2">
                          <div>
                            <p className="text-sm font-medium text-slate-800">{v.label}</p>
                            {v.sku && <p className="text-xs text-slate-500">SKU: {v.sku}</p>}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Precio regular
                              </label>
                              <input
                                type="text"
                                value={v.precio_regular}
                                onChange={(e) => updateVariacion(idx, "precio_regular", e.target.value)}
                                disabled={busy}
                                className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm disabled:opacity-50"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Precio oferta
                              </label>
                              <input
                                type="text"
                                value={v.precio_oferta}
                                onChange={(e) => updateVariacion(idx, "precio_oferta", e.target.value)}
                                disabled={busy}
                                placeholder="Opcional"
                                className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm disabled:opacity-50"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Stock</label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={v.stock}
                              onChange={(e) => updateVariacion(idx, "stock", e.target.value)}
                              disabled={busy}
                              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm disabled:opacity-50"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </PanelSection>
              )}

              {!esVariable && (
                <PanelSection title="Precios">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Precio regular</label>
                      <input
                        type="text"
                        value={form.precio_regular}
                        onChange={(e) => setForm((f) => ({ ...f, precio_regular: e.target.value }))}
                        disabled={busy}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Precio oferta</label>
                      <input
                        type="text"
                        value={form.precio_oferta}
                        onChange={(e) => setForm((f) => ({ ...f, precio_oferta: e.target.value }))}
                        disabled={busy}
                        placeholder="Opcional"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:opacity-50"
                      />
                    </div>
                  </div>
                </PanelSection>
              )}

              {!esVariable && (
                <PanelSection title="Stock">
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Cantidad</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={form.stock}
                        onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                        disabled={busy}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Stock status</label>
                      <p className="text-sm text-slate-800">
                        {stockStatusLabel(detalle.stock_status)}
                        {detalle.manage_stock ? "" : " · Sin gestión de stock"}
                      </p>
                    </div>
                  </>
              </PanelSection>
              )}

              <PanelSection title="Imagen principal">
                <div className="space-y-3">
                  {imagenPrincipal ? (
                    <div className="relative">
                      <img
                        src={imagenPrincipal.url}
                        alt={imagenPrincipal.alt || detalle.nombre}
                        className="w-full aspect-[4/3] rounded-lg object-cover border border-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => removeImagen(0)}
                        disabled={busy}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-white/95 text-slate-500 hover:text-rose-600 shadow border border-slate-200/80 disabled:opacity-50"
                        aria-label="Quitar imagen principal"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-full aspect-[4/3] rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-xs text-slate-400">
                      Sin imagen principal
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputPrincipalRef.current?.click()}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                    >
                      {uploadingImagen ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Subir imagen
                    </button>
                    <input
                      ref={fileInputPrincipalRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => handleFileSelect(e, true)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={nuevaUrlImagen}
                      onChange={(e) => setNuevaUrlImagen(e.target.value)}
                      disabled={busy}
                      placeholder="https://… URL de imagen"
                      className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => addImagenFromUrl(!imagenPrincipal)}
                      disabled={busy}
                      className="px-3 py-1.5 text-sm text-violet-600 font-medium hover:text-violet-800 disabled:opacity-50 whitespace-nowrap"
                    >
                      {imagenPrincipal ? "A galería" : "Agregar"}
                    </button>
                  </div>
                </div>
              </PanelSection>

              <PanelSection title="Galería de imágenes">
                {galeriaImagenes.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No hay imágenes en la galería.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {galeriaImagenes.map((img, idx) => {
                      const realIndex = idx + 1;
                      return (
                        <div key={img.localId} className="relative group">
                          <img
                            src={img.url}
                            alt={img.alt || detalle.nombre}
                            className="aspect-square w-full rounded-lg object-cover border border-slate-200"
                          />
                          <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 transition-colors rounded-lg flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => setMainImagen(realIndex)}
                              disabled={busy}
                              title="Usar como principal"
                              className="p-1.5 rounded-full bg-white/95 text-violet-600 hover:text-violet-800 disabled:opacity-50"
                            >
                              <Star className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeImagen(realIndex)}
                              disabled={busy}
                              title="Quitar"
                              className="p-1.5 rounded-full bg-white/95 text-rose-600 hover:text-rose-800 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputGaleriaRef.current?.click()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 font-medium disabled:opacity-50"
                >
                  {uploadingImagen ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Agregar a galería
                </button>
                <input
                  ref={fileInputGaleriaRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e, false)}
                />
              </PanelSection>

              <PanelSection title="Categorías WooCommerce">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Categoría</label>
                  <select
                    value={form.categoriaId}
                    onChange={(e) => setForm((f) => ({ ...f, categoriaId: e.target.value }))}
                    disabled={busy || loadingCategorias}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm disabled:opacity-50 bg-white"
                  >
                    <option value="">
                      {loadingCategorias ? "Cargando categorías…" : "Sin categoría"}
                    </option>
                    {categoriasWoo.map((cat) => (
                      <option key={cat.id} value={String(cat.id)}>
                        {cat.parent ? "— " : ""}
                        {cat.nombre}
                      </option>
                    ))}
                  </select>
                  {form.categoriaId && (
                    <p className="text-xs text-slate-400 mt-1">
                      Slug: {categoriasWoo.find((c) => String(c.id) === form.categoriaId)?.slug || "—"}
                    </p>
                  )}
                </div>
              </PanelSection>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 shrink-0 space-y-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Guardando…
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Guardar cambios
                  </>
                )}
              </button>
              {(enPapelera || form.estado === "trash") && (
                <button
                  type="button"
                  onClick={handleDeletePermanent}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 border border-rose-200 text-rose-700 text-sm font-medium rounded-lg hover:bg-rose-50 disabled:opacity-50"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Eliminando…
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Eliminar definitivamente
                    </>
                  )}
                </button>
              )}
            </div>
          </>
        ) : null}
      </aside>
    </>
  );
}
