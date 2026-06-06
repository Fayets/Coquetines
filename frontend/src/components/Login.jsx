import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import logo from "../images/login.png";
import Swal from "sweetalert2";
import { LogIn, Mail, Lock } from "lucide-react";
import { setAuth } from "../utils/authStorage";
import { API_URL } from "../utils/api";

const Login = () => {
  const [credentials, setCredentials] = useState({
    usernameOrEmail: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setCredentials((prev) => ({ ...prev, [name]: value }));
  };

  const postApi = async () => {
    try {
      if (!credentials.usernameOrEmail || !credentials.password) {
        Swal.fire({
          title: "Campos requeridos",
          text: "Ingresa usuario/correo y contraseña",
          icon: "warning",
        });
        return;
      }

      const loginData = {
        username: credentials.usernameOrEmail.includes("@") ? undefined : credentials.usernameOrEmail,
        email: credentials.usernameOrEmail.includes("@") ? credentials.usernameOrEmail : undefined,
        password: credentials.password,
      };

      const response = await axios.post(
        `${API_URL}/auth/login`,
        loginData,
        { timeout: 15000 }
      );

      if (response.data.access_token) {
        setAuth(response.data.access_token, response.data.user ?? null);
        navigate("/dashboard");
        return response.data;
      }
    } catch (error) {
      console.error("Error al logear:", error);
      const isNetwork = !error.response && (error.code === "ECONNABORTED" || error.message?.includes("Network"));
      Swal.fire({
        title: "Error",
        text: isNetwork
          ? `No se pudo conectar con el servidor. La app intenta usar: ${API_URL}. Revisá que en la carpeta backend esté corriendo: uvicorn main:app --reload`
          : error.response?.data?.detail || "Las credenciales son incorrectas",
        icon: "error",
        confirmButtonText: "Reintentar",
      });
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await postApi();
    } catch (err) {
      // postApi ya muestra Swal en catch; acá no hace falta repetir
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 p-12 flex-col justify-between">
        <div>
          <img src={logo} alt="Logo" className="h-12 w-auto" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-white mb-4">Gestión Comercial</h2>
          <p className="text-slate-400 text-lg max-w-md">
            Sistema profesional de gestión de ventas, inventario y créditos.
          </p>
        </div>
        <p className="text-slate-500 text-sm">© Gestión Comercial</p>
      </div>

      {/* Right panel - Login form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <img src={logo} alt="Logo" className="h-10 w-auto" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 mb-1">Iniciar sesión</h1>
          <p className="text-slate-500 mb-8">Ingresa tus credenciales para acceder</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Usuario o correo electrónico
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  name="usernameOrEmail"
                  type="text"
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400"
                  placeholder="usuario@ejemplo.com"
                  value={credentials.usernameOrEmail}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400"
                  placeholder="••••••••"
                  value={credentials.password}
                  onChange={handleChange}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <LogIn className="h-5 w-5" />
              {loading ? "Verificando..." : "Iniciar sesión"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
