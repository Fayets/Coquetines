import { useCallback, useEffect, useMemo, useState } from "react";

const CLAVE = "coquetines_carrito_v1";

function leerStorage() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    const datos = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(datos) ? datos : [];
  } catch {
    return [];
  }
}

/**
 * Carrito del catálogo público. Vive en localStorage para que no se pierda si
 * la clienta recarga o vuelve más tarde. El tope de cantidad es el stock real
 * del producto, así el pedido que llega por WhatsApp siempre es cumplible.
 */
export function useCarrito() {
  const [items, setItems] = useState(leerStorage);

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(items));
    } catch {
      /* modo privado / storage lleno: el carrito sigue funcionando en memoria */
    }
  }, [items]);

  const agregar = useCallback((producto, cantidad = 1) => {
    setItems((previos) => {
      const existente = previos.find((i) => i.id === producto.id);
      const tope = Math.max(1, Number(producto.stock) || 1);
      if (existente) {
        return previos.map((i) =>
          i.id === producto.id
            ? { ...i, cantidad: Math.min(tope, i.cantidad + cantidad) }
            : i
        );
      }
      return [
        ...previos,
        {
          id: producto.id,
          codigo: producto.codigo,
          nombre: producto.nombre,
          marca: producto.marca,
          talle: producto.talle,
          color: producto.color,
          imagen: producto.imagen ?? null,
          precio: Number(producto.precio) || 0,
          stock: tope,
          cantidad: Math.min(tope, cantidad),
        },
      ];
    });
  }, []);

  const cambiarCantidad = useCallback((id, cantidad) => {
    setItems((previos) =>
      previos
        .map((i) =>
          i.id === id
            ? { ...i, cantidad: Math.max(0, Math.min(i.stock, cantidad)) }
            : i
        )
        .filter((i) => i.cantidad > 0)
    );
  }, []);

  const quitar = useCallback((id) => {
    setItems((previos) => previos.filter((i) => i.id !== id));
  }, []);

  const vaciar = useCallback(() => setItems([]), []);

  /**
   * Reconcilia el carrito guardado contra el catálogo recién traído: elimina lo
   * que ya no está publicado y ajusta precio y stock si cambiaron.
   */
  const sincronizar = useCallback((productos) => {
    if (!productos?.length) return;
    const porId = new Map(productos.map((p) => [p.id, p]));
    setItems((previos) =>
      previos
        .filter((i) => porId.has(i.id))
        .map((i) => {
          const actual = porId.get(i.id);
          const stock = Math.max(1, Number(actual.stock) || 1);
          return {
            ...i,
            nombre: actual.nombre,
            imagen: actual.imagen ?? null,
            precio: Number(actual.precio) || 0,
            stock,
            cantidad: Math.min(i.cantidad, stock),
          };
        })
    );
  }, []);

  const unidades = useMemo(
    () => items.reduce((acc, i) => acc + i.cantidad, 0),
    [items]
  );
  const total = useMemo(
    () => items.reduce((acc, i) => acc + i.precio * i.cantidad, 0),
    [items]
  );

  return {
    items,
    unidades,
    total,
    agregar,
    cambiarCantidad,
    quitar,
    vaciar,
    sincronizar,
  };
}
