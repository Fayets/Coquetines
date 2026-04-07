import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { getToken } from "../../utils/sucursal";
import { API_URL } from "../../utils/api";
import { X } from "lucide-react";

const SCAN_MIN_LENGTH = 3;

function isTextInputFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea") return true;
  if (tag === "select") return true;
  if (tag === "input") {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    return ["text", "search", "number", "tel", "url", "password"].includes(type);
  }
  if (el.isContentEditable) return true;
  return false;
}

export default function BarcodePricePopup() {
  const [product, setProduct] = useState(null);
  const [visible, setVisible] = useState(false);
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);
  const resetTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const token = getToken();

  const lookupProduct = useCallback(
    async (code) => {
      if (!token || !code) return;
      try {
        const response = await axios.get(`${API_URL}/products/all`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const products = Array.isArray(response.data) ? response.data : [];
        const found = products.find(
          (p) => p.codigo && p.codigo.toLowerCase() === code.toLowerCase()
        );
        if (found) {
          setProduct(found);
          setVisible(true);
          if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
          hideTimerRef.current = setTimeout(() => setVisible(false), 6000);
        }
      } catch (err) {
        console.error("BarcodePricePopup: error buscando producto", err);
      }
    },
    [token]
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isTextInputFocused()) return;

      const now = Date.now();

      if (e.key === "Enter") {
        const code = bufferRef.current.trim();
        bufferRef.current = "";
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        if (code.length >= SCAN_MIN_LENGTH) {
          lookupProduct(code);
        }
        return;
      }

      if (e.key.length === 1) {
        const gap = now - lastKeyTimeRef.current;
        if (lastKeyTimeRef.current > 0 && gap > 300) {
          bufferRef.current = "";
        }
        bufferRef.current += e.key;
        lastKeyTimeRef.current = now;

        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        resetTimerRef.current = setTimeout(() => {
          const pending = bufferRef.current.trim();
          if (pending.length >= SCAN_MIN_LENGTH) {
            lookupProduct(pending);
          }
          bufferRef.current = "";
        }, 400);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [lookupProduct]);

  if (!visible || !product) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 24,
        right: 24,
        zIndex: 99999,
        animation: "popupFadeIn 0.25s ease-out",
      }}
    >
      <style>{`
        @keyframes popupFadeIn {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 p-5"
        style={{ minWidth: 280, maxWidth: 340 }}
      >
        <div className="flex items-start justify-between mb-3">
          <span className="text-xs font-medium text-teal-600 bg-teal-50 px-2 py-1 rounded-md">
            {product.codigo}
          </span>
          <button
            onClick={() => setVisible(false)}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            style={{ marginRight: -4, marginTop: -4 }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">
          {product.nombre}
        </h3>
        {product.talle && (
          <p className="text-xs text-slate-500 mb-3">Talle: {product.talle}</p>
        )}
        <div className="flex gap-3">
          <div className="flex-1 bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-slate-500 mb-1" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Efect./Transf.
            </p>
            <p className="text-lg font-bold text-slate-900">
              ${product.precio_et ?? "—"}
            </p>
          </div>
          <div className="flex-1 bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-slate-500 mb-1" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Tarjeta
            </p>
            <p className="text-lg font-bold text-slate-900">
              ${product.precio_venta ?? "—"}
            </p>
          </div>
        </div>
        {product.stock != null && (
          <p className="text-xs text-slate-500 mt-3 text-center">
            Stock disponible:{" "}
            <span className={product.stock <= 0 ? "text-rose-600 font-medium" : "font-medium text-slate-700"}>
              {product.stock}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
