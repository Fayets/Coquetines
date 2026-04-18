import React, { useState, useEffect } from "react";
import { FileText, Hash, TrendingDown, Loader2, Building2 } from "lucide-react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getUser, getToken } from "../../utils/sucursal";

import { API_URL } from "../../utils/api";

export default function CreditReports() {
  const [loading, setLoading] = useState(true);
  const [totalCreditos, setTotalCreditos] = useState(0);
  const [cantidadCreditos, setCantidadCreditos] = useState(0);
  const [deudaTotal, setDeudaTotal] = useState(0);
  const [statsPorSucursal, setStatsPorSucursal] = useState([]);

  const token = getToken();
  const user = getUser();
  const esOwner = user.role === "OWNER";
  const navigate = useNavigate();

  useEffect(() => {
    if (user.role === "EMPLEADO") {
      navigate("/Creditos", { replace: true });
    }
  }, [user.role, navigate]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (esOwner) {
          const res = await axios.get(`${API_URL}/creditos/stats_por_sucursal`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          setStatsPorSucursal(
            (Array.isArray(res.data) ? res.data : []).filter(
              (s) => (s.sucursal_nombre || "") !== "Sucursal Principal"
            )
          );
          return;
        }
        const [totalRes, cantidadRes, deudaRes] = await Promise.all([
          axios.get(`${API_URL}/creditos/total`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}/creditos/total_credit`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}/creditos/total_debt`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        setTotalCreditos(totalRes.data ?? 0);
        setCantidadCreditos(cantidadRes.data ?? 0);
        setDeudaTotal(deudaRes.data ?? 0);
      } catch (error) {
        console.error("Error al obtener datos de créditos:", error);
      } finally {
        setLoading(false);
      }
    };

    if (token && user.role !== "EMPLEADO") fetchData();
  }, [token, esOwner, user.role]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
      </div>
    );
  }

  const colorClasses = {
    teal: "bg-teal-500 text-white",
    blue: "bg-blue-500 text-white",
    amber: "bg-amber-500 text-white",
  };

  if (esOwner && statsPorSucursal.length > 0) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Reportes de créditos</h1>
          <p className="text-slate-500 text-sm mt-0.5">Estadísticas por sucursal</p>
        </div>

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
                    <FileText className="h-5 w-5" />
                  </div>
                  <p className="text-2xl font-semibold text-slate-900 mt-4">
                    ${Number(suc.total_creditos).toLocaleString()}
                  </p>
                  <p className="text-sm text-slate-500 mt-0.5">Total créditos</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <div className={`inline-flex p-2.5 rounded-lg ${colorClasses.blue}`}>
                    <Hash className="h-5 w-5" />
                  </div>
                  <p className="text-2xl font-semibold text-slate-900 mt-4">{suc.cantidad_creditos}</p>
                  <p className="text-sm text-slate-500 mt-0.5">Cantidad de créditos</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <div className={`inline-flex p-2.5 rounded-lg ${colorClasses.amber}`}>
                    <TrendingDown className="h-5 w-5" />
                  </div>
                  <p className="text-2xl font-semibold text-slate-900 mt-4">
                    ${Number(suc.deuda_total).toLocaleString()}
                  </p>
                  <p className="text-sm text-slate-500 mt-0.5">Deuda total</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const stats = [
    {
      title: "Total créditos",
      value: `$${Number(totalCreditos).toLocaleString()}`,
      icon: FileText,
      color: "teal",
    },
    {
      title: "Cantidad de créditos",
      value: cantidadCreditos,
      icon: Hash,
      color: "blue",
    },
    {
      title: "Deuda total",
      value: `$${Number(deudaTotal).toLocaleString()}`,
      icon: TrendingDown,
      color: "amber",
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Reportes de créditos</h1>
        <p className="text-slate-500 text-sm mt-0.5">Estadísticas de créditos personales</p>
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
    </div>
  );
}
