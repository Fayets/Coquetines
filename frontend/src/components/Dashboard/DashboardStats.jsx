import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { getToken, getUser } from "../../utils/sucursal";
import { API_URL as baseUrl } from "../../utils/api";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  Layers,
  AlertTriangle,
  CreditCard,
  Wallet,
  Loader2,
  ArrowRight,
  Plus,
  Barcode,
  Search,
  RefreshCw,
} from "lucide-react";

export default function DashboardStats() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalVentas: 0,
    cantidadVentas: 0,
    gananciaTotal: 0,
    totalProductos: 0,
    valorInventario: 0,
    stockBajo: 0,
    cantidadCreditos: 0,
    deudaTotal: 0,
  });

  const token = getToken();
  const user = getUser();
  const esEmpleado = user?.role === "EMPLEADO";

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [
          ventasTotalRes, ventasCantidadRes, ventasGananciaRes,
          productosTotalRes, inventarioValorRes, stockBajoRes,
          creditosCantidadRes, creditosDeudaRes,
        ] = await Promise.all([
          axios.get(`${baseUrl}/ventas/total`, { headers }),
          axios.get(`${baseUrl}/ventas/total_sale`, { headers }),
          axios.get(`${baseUrl}/ventas/total_earnings`, { headers }),
          axios.get(`${baseUrl}/products/total_products`, { headers }),
          axios.get(`${baseUrl}/products/inventory_value`, { headers }),
          axios.get(`${baseUrl}/products/low_stock_count`, { headers }),
          axios.get(`${baseUrl}/creditos/total_credit`, { headers }).catch(() => ({ data: 0 })),
          axios.get(`${baseUrl}/creditos/total_debt`, { headers }).catch(() => ({ data: 0 })),
        ]);

        setStats({
          totalVentas: ventasTotalRes.data ?? 0,
          cantidadVentas: ventasCantidadRes.data ?? 0,
          gananciaTotal: ventasGananciaRes.data ?? 0,
          totalProductos: productosTotalRes.data?.total_products ?? 0,
          valorInventario: inventarioValorRes.data?.inventory_value ?? 0,
          stockBajo: stockBajoRes.data?.low_stock_count ?? 0,
          cantidadCreditos: creditosCantidadRes.data ?? 0,
          deudaTotal: creditosDeudaRes.data ?? 0,
        });
      } catch (error) {
        console.error("Error al cargar estadísticas:", error);
      } finally {
        setLoading(false);
      }
    };

    // Empleados: no cargan estadísticas, solo ven acciones rápidas
    if (!token || esEmpleado) {
      setLoading(false);
      return;
    }
    fetchStats();
  }, [token, esEmpleado]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
      </div>
    );
  }

  const cards = [
    { title: "Total Ventas", value: `$${Number(stats.totalVentas).toLocaleString()}`, icon: DollarSign, href: "/ventas/reports", color: "teal" },
    { title: "Nº Ventas", value: stats.cantidadVentas, icon: ShoppingCart, href: "/ventas", color: "blue" },
    { title: "Ganancia Total", value: `$${Number(stats.gananciaTotal).toLocaleString()}`, icon: TrendingUp, href: "/ventas/reports", color: "emerald" },
    { title: "Productos", value: stats.totalProductos, icon: Package, href: "/stock", color: "amber" },
    { title: "Valor Inventario", value: `$${Number(stats.valorInventario).toLocaleString()}`, icon: Layers, href: "/stock/reportes", color: "cyan" },
    { title: "Stock Bajo", value: stats.stockBajo, icon: AlertTriangle, href: "/stock/control", color: "rose" },
    { title: "Créditos Activos", value: stats.cantidadCreditos, icon: CreditCard, href: "/Creditos", color: "indigo" },
    { title: "Deuda Pendiente", value: `$${Number(stats.deudaTotal).toLocaleString()}`, icon: Wallet, href: "/Creditos", color: "orange" },
  ];

  const colorClasses = {
    teal: "bg-teal-500 text-white",
    blue: "bg-blue-500 text-white",
    emerald: "bg-emerald-500 text-white",
    amber: "bg-amber-500 text-white",
    cyan: "bg-cyan-500 text-white",
    rose: "bg-rose-500 text-white",
    indigo: "bg-indigo-500 text-white",
    orange: "bg-orange-500 text-white",
  };

  // Vista para EMPLEADO: solo acciones rápidas
  if (esEmpleado) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Panel de control</h1>
          <p className="text-slate-500 mt-0.5">Accesos directos a tus tareas diarias</p>
        </div>

        <div className="mt-2">
          <h2 className="text-lg font-medium text-slate-900 mb-4">Acciones rápidas</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link
              to="/ventas/nueva"
              className="flex items-center gap-4 p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-teal-200 transition-all group"
            >
              <div className="p-3 bg-teal-50 rounded-lg group-hover:bg-teal-100 transition-colors">
                <Plus className="h-6 w-6 text-teal-600" />
              </div>
              <div>
                <p className="font-medium text-slate-900">Nueva venta</p>
                <p className="text-sm text-slate-500">Registrar venta al contado</p>
              </div>
            </Link>
            <Link
              to="/ventas/cambio"
              className="flex items-center gap-4 p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-violet-200 transition-all group"
            >
              <div className="p-3 bg-violet-50 rounded-lg group-hover:bg-violet-100 transition-colors">
                <RefreshCw className="h-6 w-6 text-violet-600" />
              </div>
              <div>
                <p className="font-medium text-slate-900">Cambio de producto</p>
                <p className="text-sm text-slate-500">Desde una venta ya registrada</p>
              </div>
            </Link>
            <Link
              to="/stock/new"
              className="flex items-center gap-4 p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-amber-200 transition-all group"
            >
              <div className="p-3 bg-amber-50 rounded-lg group-hover:bg-amber-100 transition-colors">
                <Package className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="font-medium text-slate-900">Nuevo producto</p>
                <p className="text-sm text-slate-500">Agregar al inventario</p>
              </div>
            </Link>
            <Link
              to="/NuevoCredito"
              className="flex items-center gap-4 p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all group"
            >
              <div className="p-3 bg-indigo-50 rounded-lg group-hover:bg-indigo-100 transition-colors">
                <CreditCard className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <p className="font-medium text-slate-900">Nuevo crédito</p>
                <p className="text-sm text-slate-500">Registrar venta a crédito</p>
              </div>
            </Link>
            <Link
              to="/codigos-barra"
              className="flex items-center gap-4 p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-violet-200 transition-all group"
            >
              <div className="p-3 bg-violet-50 rounded-lg group-hover:bg-violet-100 transition-colors">
                <Barcode className="h-6 w-6 text-violet-600" />
              </div>
              <div>
                <p className="font-medium text-slate-900">Códigos de barra</p>
                <p className="text-sm text-slate-500">Generar etiquetas para ropa</p>
              </div>
            </Link>
            <Link
              to="/consultar-stock"
              className="flex items-center gap-4 p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-cyan-200 transition-all group"
            >
              <div className="p-3 bg-cyan-50 rounded-lg group-hover:bg-cyan-100 transition-colors">
                <Search className="h-6 w-6 text-cyan-600" />
              </div>
              <div>
                <p className="font-medium text-slate-900">Stock otras sucursales</p>
                <p className="text-sm text-slate-500">Consultar disponibilidad en otro local</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Vista para OWNER / ADMIN: estadísticas + acciones rápidas
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Panel de control</h1>
        <p className="text-slate-500 mt-0.5">Resumen del negocio en tiempo real</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Link
            key={card.title}
            to={card.href}
            className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all group"
          >
            <div className="flex items-start justify-between">
              <div className={`p-2.5 rounded-lg ${colorClasses[card.color]}`}>
                <card.icon className="h-5 w-5" />
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-teal-500 group-hover:translate-x-0.5 transition-all" />
            </div>
            <p className="text-2xl font-semibold text-slate-900 mt-4">{card.value}</p>
            <p className="text-sm text-slate-500 mt-0.5">{card.title}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-medium text-slate-900 mb-4">Acciones rápidas</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            to="/ventas/nueva"
            className="flex items-center gap-4 p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-teal-200 transition-all group"
          >
            <div className="p-3 bg-teal-50 rounded-lg group-hover:bg-teal-100 transition-colors">
              <Plus className="h-6 w-6 text-teal-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900">Nueva venta</p>
              <p className="text-sm text-slate-500">Registrar venta al contado</p>
            </div>
          </Link>
          <Link
            to="/ventas/cambio"
            className="flex items-center gap-4 p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-violet-200 transition-all group"
          >
            <div className="p-3 bg-violet-50 rounded-lg group-hover:bg-violet-100 transition-colors">
              <RefreshCw className="h-6 w-6 text-violet-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900">Cambio de producto</p>
              <p className="text-sm text-slate-500">Desde una venta ya registrada</p>
            </div>
          </Link>
          <Link
            to="/stock/new"
            className="flex items-center gap-4 p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-amber-200 transition-all group"
          >
            <div className="p-3 bg-amber-50 rounded-lg group-hover:bg-amber-100 transition-colors">
              <Package className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900">Nuevo producto</p>
              <p className="text-sm text-slate-500">Agregar al inventario</p>
            </div>
          </Link>
          <Link
            to="/NuevoCredito"
            className="flex items-center gap-4 p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all group"
          >
            <div className="p-3 bg-indigo-50 rounded-lg group-hover:bg-indigo-100 transition-colors">
              <CreditCard className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900">Nuevo crédito</p>
              <p className="text-sm text-slate-500">Registrar venta a crédito</p>
            </div>
          </Link>
          <Link
            to="/codigos-barra"
            className="flex items-center gap-4 p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-violet-200 transition-all group"
          >
            <div className="p-3 bg-violet-50 rounded-lg group-hover:bg-violet-100 transition-colors">
              <Barcode className="h-6 w-6 text-violet-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900">Códigos de barra</p>
              <p className="text-sm text-slate-500">Generar etiquetas para ropa</p>
            </div>
          </Link>
          <Link
            to="/consultar-stock"
            className="flex items-center gap-4 p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-cyan-200 transition-all group"
          >
            <div className="p-3 bg-cyan-50 rounded-lg group-hover:bg-cyan-100 transition-colors">
              <Search className="h-6 w-6 text-cyan-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900">Stock otras sucursales</p>
              <p className="text-sm text-slate-500">Consultar disponibilidad en otro local</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
