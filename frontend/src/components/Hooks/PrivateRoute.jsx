import React from "react";
import { Navigate } from "react-router-dom";
import checkAuth from "./checkAuth"; // La función que verifica la autenticación

const PrivateRoute = ({ element }) => {
  const isAuthenticated = checkAuth(); // Verifica si el usuario está autenticado

  // Si no está autenticado, redirige a la página de login
  if (!isAuthenticated) {
    return <Navigate to="/" replace />; // El replace evita que el usuario vuelva a la página protegida usando el botón de retroceder
  }

  return element; // Si está autenticado, muestra la ruta protegida
};

export default PrivateRoute;
