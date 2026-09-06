/**
 * Datos de maqueta para mostrarle el catálogo a la clienta antes de tener
 * fotos cargadas en el sistema. Se activa solo con ?demo=1 en la URL, así el
 * catálogo real nunca muestra precios ni prendas inventadas.
 *
 * Las fotos viven en frontend/public/catalogo-demo/.
 */

const FOTO_LINO = "/catalogo-demo/conjunto-lino.jpg";
const FOTO_RAYAS = "/catalogo-demo/conjunto-rayas.jpg";

const VARIANTES = [
  {
    nombre: "Conjunto camisa lino + short",
    marca: "COQUETINES",
    color: "BEIGE",
    imagen: FOTO_LINO,
    base: 42500,
    talles: [
      { talle: "2", categoria: "CONJUNTO - BEBE", stock: 4 },
      { talle: "4", categoria: "CONJUNTO - BEBE", stock: 2 },
      { talle: "6", categoria: "CONJUNTO - NENE", stock: 6 },
      { talle: "8", categoria: "CONJUNTO - NENE", stock: 1 },
    ],
  },
  {
    nombre: "Conjunto camisa rayada + short",
    marca: "DEEP",
    color: "CELESTE",
    imagen: FOTO_RAYAS,
    base: 46900,
    talles: [
      { talle: "2", categoria: "CONJUNTO - BEBE", stock: 3 },
      { talle: "4", categoria: "CONJUNTO - BEBE", stock: 5 },
      { talle: "6", categoria: "CONJUNTO - NENE", stock: 2 },
      { talle: "8", categoria: "CONJUNTO - NENE", stock: 7 },
    ],
  },
];

function construirProductos() {
  const productos = [];
  let id = 9000;
  VARIANTES.forEach((v, vi) => {
    v.talles.forEach((t, ti) => {
      // Los talles más grandes valen un poco más, como en el inventario real.
      const precio = Math.round((v.base + ti * 2600) / 100) * 100;
      productos.push({
        id: (id += 1),
        codigo: `DEMO-${vi + 1}${ti + 1}`,
        nombre: v.nombre,
        marca: v.marca,
        talle: t.talle,
        color: v.color,
        categoria: t.categoria,
        imagen: v.imagen,
        stock: t.stock,
        precio,
      });
    });
  });
  return productos;
}

export function catalogoDemo() {
  const productos = construirProductos();
  return {
    tienda: "TIENDA ONLINE",
    disponible: true,
    productos,
    categorias: [...new Set(productos.map((p) => p.categoria))].sort(),
    talles: [...new Set(productos.map((p) => p.talle))].sort(
      (a, b) => Number(a) - Number(b)
    ),
  };
}

/** ¿La URL pide la vista de maqueta? */
export function esModoDemo() {
  try {
    return new URLSearchParams(window.location.search).get("demo") === "1";
  } catch {
    return false;
  }
}
