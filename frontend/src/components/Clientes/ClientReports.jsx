import React, { useState, useEffect } from "react";
import { Users, Building2, Loader2 } from "lucide-react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getUser, getToken } from "../../utils/sucursal";

import { API_URL } from "../../utils/api";

export default function ClientReports() {
  const [loading, setLoading] = useState(true);
  const [statsPorSucursal, setStatsPorSucursal] = useState([]);
  const [totalClientes, setTotalClientes] = useState(0);

  const token = getToken();
  const user = getUser();
  const esOwner = user.role === "OWNER";
  const navigate = useNavigate();

  useEffect(() => {
    if (user.role === "EMPLEADO") {
      navigate("/Clientes", { replace: true });
    }
  }, [user.role, navigate]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (esOwner) {
          const res = await axios.get(`${API_URL}/clientes/cantidad_por_sucursal`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const list = Array.isArray(res.data) ? res.data : [];
          setStatsPorSucursal(list.filter((s) => (s.sucursal_nombre || "").trim() !== "Sucursal Principal"));
          return;
        }
        const res = await axios.get(`${API_URL}/clientes/all`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const list = Array.isArray(res.data) ? res.data : [];
        setTotalClientes(list.length);
      } catch (error) {
        console.error("Error al obtener datos de clientes:", error);
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

  if (esOwner) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Reportes de clientes</h1>
          <p className="text-slate-500 text-sm mt-0.5">Cantidad de clientes en cada sucursal</p>
        </div>

        <div className="space-y-6">
          {statsPorSucursal.length === 0 ? (
            <p className="text-slate-500">No hay sucursales con clientes registrados.</p>
          ) : (
            statsPorSucursal.map((suc) => (
              <div key={suc.sucursal_id} className="bg-slate-50 rounded-xl border border-slate-200 p-6">
                <div className="flex items-center gap-3">
                  <div className="inline-flex p-2.5 rounded-lg bg-teal-500 text-white">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{suc.sucursal_nombre}</h2>
                    <p className="text-2xl font-semibold text-teal-600 mt-0.5">
                      {suc.cantidad_clientes} {suc.cantidad_clientes === 1 ? "cliente" : "clientes"}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Reportes de clientes</h1>
        <p className="text-slate-500 text-sm mt-0.5">Total de clientes en la base</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-sm">
        <div className="inline-flex p-2.5 rounded-lg bg-teal-500 text-white">
          <Users className="h-5 w-5" />
        </div>
        <p className="text-2xl font-semibold text-slate-900 mt-4">{totalClientes}</p>
        <p className="text-sm text-slate-500 mt-0.5">Total de clientes</p>
      </div>
    </div>
  );
}
