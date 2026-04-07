import React, { useState, useEffect } from "react";
import { DollarSign, ShoppingCart, TrendingUp, Printer, Loader2, Building2 } from "lucide-react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getUser, getToken } from "../../utils/sucursal";

import { API_URL } from "../../utils/api";
import RankingProductosVendidos from "../Reportes/RankingProductosVendidos";

export default function VentasReports() {
  const [loading, setLoading] = useState(true);
  const [totalVentas, setTotalVentas] = useState(0);
  const [cantidadVentas, setCantidadVentas] = useState(0);
  const [gananciaTotal, setGananciaTotal] = useState(0);
  const [statsPorSucursal, setStatsPorSucursal] = useState([]);

  const token = getToken();
  const navigate = useNavigate();
  const user = getUser();
  const esOwner = user.role === "OWNER";

  useEffect(() => {
    if (user.role === "EMPLEADO") {
      navigate("/ventas", { replace: true });
      return;
    }
  }, [navigate, user.role]);

  useEffect(() => {
    if (user.role === "EMPLEADO" || !token) return;
    const fetchVentasData = async () => {
      try {
        if (esOwner) {
          const res = await axios.get(`${API_URL}/ventas/stats_por_sucursal`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          setStatsPorSucursal(
            (Array.isArray(res.data) ? res.data : []).filter(
              (s) => (s.sucursal_nombre || "") !== "Sucursal Principal"
            )
          );
          return;
        }
        const [totalRes, cantidadRes, gananciasRes] = await Promise.all([
          axios.get(`${API_URL}/ventas/total`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}/ventas/total_sale`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}/ventas/total_earnings`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        setTotalVentas(totalRes.data ?? 0);
        setCantidadVentas(cantidadRes.data ?? 0);
        setGananciaTotal(gananciasRes.data ?? 0);
      } catch (error) {
        console.error("Error al obtener datos de ventas:", error);
        if (error?.response?.status === 500) {
          console.error(
            "Detalle del servidor (ventas/stats_por_sucursal):",
            error.response.data?.detail || error.response.data
          );
        }
      } finally {
        setLoading(false);
      }
    };

    if (token) fetchVentasData();
  }, [token, esOwner]);

  if (loading && !esOwner) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
      </div>
    );
  }

  const colorClasses = {
    teal: "bg-teal-500 text-white",
    blue: "bg-blue-500 text-white",
    emerald: "bg-emerald-500 text-white",
  };

  if (esOwner) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Reportes de ventas</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Ranking de productos (solo dueña) y estadísticas por sucursal
          </p>
        </div>

        <RankingProductosVendidos />

        {loading ? (
          <div className="flex justify-center items-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
          </div>
        ) : statsPorSucursal.length > 0 ? (
          <div className="space-y-10">
            {statsPorSucursal.map((suc) => (
              <div key={suc.sucursal_id} className="bg-slate-50 rounded-xl border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-4">
                  <Building2 className="h-5 w-5 text-teal-600" />
                  {suc.sucursal_nombre}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <div className={`inline-flex p-2.5 rounded-lg ${colorClasses.teal}`}>
                      <DollarSign className="h-5 w-5" />
                    </div>
                    <p className="text-2xl font-semibold text-slate-900 mt-4">
                      ${Number(suc.total_ventas).toLocaleString()}
                    </p>
                    <p className="text-sm text-slate-500 mt-0.5">Total de ventas</p>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <div className={`inline-flex p-2.5 rounded-lg ${colorClasses.blue}`}>
                      <ShoppingCart className="h-5 w-5" />
                    </div>
                    <p className="text-2xl font-semibold text-slate-900 mt-4">{suc.cantidad_ventas}</p>
                    <p className="text-sm text-slate-500 mt-0.5">Número de ventas</p>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <div className={`inline-flex p-2.5 rounded-lg ${colorClasses.emerald}`}>
                      <TrendingUp className="h-5 w-5" />
                    </div>
                    <p className="text-2xl font-semibold text-slate-900 mt-4">
                      ${Number(suc.ganancia_total).toLocaleString()}
                    </p>
                    <p className="text-sm text-slate-500 mt-0.5">Ganancia total</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 mb-8">
            No hay estadísticas por sucursal para mostrar (p. ej. solo figura Sucursal Principal).
          </p>
        )}

        <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-medium text-slate-900 mb-4">Generar reportes</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <select className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 max-w-xs">
              <option>Seleccionar tipo de reporte</option>
              <option>Ventas por día</option>
              <option>Ventas por mes</option>
            </select>
            <button className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700">
              <Printer className="h-4 w-4" />
              Generar reporte
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Vista ADMIN / sin rol OWNER: totales de la sucursal
  const stats = [
    {
      title: "Total de ventas",
      value: `$${Number(totalVentas).toLocaleString()}`,
      icon: DollarSign,
      color: "teal",
    },
    {
      title: "Número de ventas",
      value: cantidadVentas,
      icon: ShoppingCart,
      color: "blue",
    },
    {
      title: "Ganancia total",
      value: `$${Number(gananciaTotal).toLocaleString()}`,
      icon: TrendingUp,
      color: "emerald",
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Reportes de ventas</h1>
        <p className="text-slate-500 text-sm mt-0.5">Estadísticas y análisis de ventas</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.title}
            className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm"
          >
            <div
              className={`inline-flex p-2.5 rounded-lg ${colorClasses[stat.color]}`}
            >
              <stat.icon className="h-5 w-5" />
            </div>
            <p className="text-2xl font-semibold text-slate-900 mt-4">{stat.value}</p>
            <p className="text-sm text-slate-500 mt-0.5">{stat.title}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-medium text-slate-900 mb-4">Generar reportes</h2>
        <div className="flex flex-col sm:flex-row gap-4">
          <select className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 max-w-xs">
            <option>Seleccionar tipo de reporte</option>
            <option>Ventas por día</option>
            <option>Ventas por mes</option>
          </select>
          <button className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700">
            <Printer className="h-4 w-4" />
            Generar reporte
          </button>
        </div>
      </div>
    </div>
  );
}