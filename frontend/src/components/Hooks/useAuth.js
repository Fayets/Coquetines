import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getToken } from "../../utils/sucursal";

const useAuth = () => {
  const navigate = useNavigate();
  const token = getToken();

  useEffect(() => {
    if (!token) {
      navigate("/"); // Redirige a login si no hay token
    }
  }, [token, navigate]); // El efecto se ejecuta cuando el token cambie

  return !!token; // Retorna true si hay token, de lo contrario false
};

export default useAuth;
