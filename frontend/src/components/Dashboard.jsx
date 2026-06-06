import React from 'react'
import { ShoppingBag,LogOut , Package, FileText, CreditCard } from "lucide-react"
import { useNavigate } from 'react-router-dom'
import { clearAuth } from "../../utils/authStorage"


const modules = [
  { name: "Ventas", icon: ShoppingBag },
  { name: "Inventario", icon: Package },
  { name: "Creditos Personales", icon: FileText },
  { name: "Cerrar sesión", icon: LogOut },  // Sin espacio al final
];


const Dashboard = () => {
  const navigate = useNavigate(); 

  const handleNavigate = (moduleName) => {
    console.log("Módulo seleccionado:", moduleName);  // Esto te muestra el nombre del módulo
  
    if (moduleName === "Inventario") {
      navigate("/stock");
    } else if (moduleName === "Ventas") {
      navigate("/Ventas");
    } else if (moduleName === "Creditos Personales") {
      navigate("/Creditos");
    }
    else if (moduleName === "Cerrar sesión") {
      clearAuth();
      navigate("/");
    }
  };
  

  return (
    <>
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-12">
          <h1 className="text-3xl font-bold text-gray-800">Dashboard de Negocio</h1>
        </div>
        <div className="grid grid-cols-2 gap-8 mt-8">
          {modules.map((module) => (
            <>
            
            <button
              key={module.name}
              className="flex flex-col items-center justify-center bg-blue-50 p-12 rounded-xl shadow-md hover:shadow-lg hover:bg-blue-100 transition-all duration-300 ease-in-out"
              onClick={() => handleNavigate(module.name)} 
            >
              <module.icon className="w-24 h-24 text-blue-600 mb-6" />
              <span className="text-xl font-medium text-gray-800">{module.name}</span>
            </button>
            </>
          ))}
        </div>
      </div>
    </div>
    </>
  )
}

export default Dashboard