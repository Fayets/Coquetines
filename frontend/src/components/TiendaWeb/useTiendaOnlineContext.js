import { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getUser, getToken } from "../../utils/sucursal";
import { puedeAccederTiendaWeb } from "../../utils/tiendaWeb";
import { API_URL } from "../../utils/api";

export function useTiendaOnlineContext() {
  const token = getToken();
  const user = getUser();
  const navigate = useNavigate();
  const esAdminTiendaOnline = puedeAccederTiendaWeb(user);
  const [tiendaOnline, setTiendaOnline] = useState(null);
  const [stockSucursalNombre, setStockSucursalNombre] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user.role === "OWNER" || !esAdminTiendaOnline) {
      navigate("/dashboard", { replace: true });
    }
  }, [user.role, esAdminTiendaOnline, navigate]);

  useEffect(() => {
    if (!token || !esAdminTiendaOnline) {
      setLoading(false);
      return;
    }

    const loadContext = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API_URL}/sucursales/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const list = Array.isArray(res.data) ? res.data : [];
        const tiendas = list.filter((s) => s.es_tienda_online && s.activo);
        const sid = Number(user.sucursal_id);
        const tienda =
          user.es_tienda_online === true
            ? list.find((s) => Number(s.id) === sid && s.es_tienda_online && s.activo) ||
              tiendas.find((s) => Number(s.id) === sid) ||
              tiendas[0]
            : tiendas.find((s) => Number(s.id) === sid);

        if (!tienda) {
          navigate("/dashboard", { replace: true });
          return;
        }

        setTiendaOnline(tienda);
        const stock = list.find((s) => Number(s.id) === Number(tienda.sucursal_stock_id));
        setStockSucursalNombre(stock?.nombre || "");
      } catch {
        navigate("/dashboard", { replace: true });
      } finally {
        setLoading(false);
      }
    };

    loadContext();
  }, [token, esAdminTiendaOnline, user.sucursal_id, user.es_tienda_online, navigate]);

  return { token, user, tiendaOnline, stockSucursalNombre, loading, esAdminTiendaOnline };
}
