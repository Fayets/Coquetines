// checkAuth.js
import { getToken } from "../../utils/sucursal";

const checkAuth = () => {
    const token = getToken();
    return !!token; // Retorna true si el token existe, de lo contrario false
  };
  
  export default checkAuth;
  