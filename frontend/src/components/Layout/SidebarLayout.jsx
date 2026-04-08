import React, { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import BarcodePricePopup from "../Global/BarcodePricePopup";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  FileText,
  Users,
  LogOut,
  List,
  PlusCircle,
  BarChart2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Tags,
  Wallet,
  Settings,
  Truck,
  UserCircle,
  Barcode,
  SearchCheck,
  Palette,
  History,
} from "lucide-react";
import logo from "../../images/logo.png";
import { getUser } from "../../utils/sucursal";
import { clearAuth } from "../../utils/authStorage";

const ventasChildren = (esOwner, role) => {
  if (esOwner)
    return [
      { path: "/ventas", icon: List, label: "Listado" },
      { path: "/ventas/reports", icon: BarChart2, label: "Reportes" },
      { path: "/ventas/cambios-historial", icon: History, label: "Historial de cambios" },
    ];
  if (role === "EMPLEADO")
    return [
      { path: "/ventas", icon: List, label: "Listado" },
      { path: "/ventas/nueva", icon: PlusCircle, label: "Nueva Venta" },
      { path: "/ventas/cambios-historial", icon: History, label: "Historial de cambios" },
    ];
  return [
    { path: "/ventas", icon: List, label: "Listado" },
    { path: "/ventas/nueva", icon: PlusCircle, label: "Nueva Venta" },
    { path: "/ventas/reports", icon: BarChart2, label: "Reportes" },
    { path: "/ventas/cambios-historial", icon: History, label: "Historial de cambios" },
  ];
};

const creditosChildren = (esOwner, role) => {
  if (esOwner)
    return [
      { path: "/Creditos", icon: List, label: "Listado" },
      { path: "/creditos/reports", icon: BarChart2, label: "Reportes" },
    ];
  if (role === "EMPLEADO")
    return [
      { path: "/Creditos", icon: List, label: "Listado" },
      { path: "/NuevoCredito", icon: PlusCircle, label: "Nuevo Crédito" },
    ];
  return [
    { path: "/Creditos", icon: List, label: "Listado" },
    { path: "/NuevoCredito", icon: PlusCircle, label: "Nuevo Crédito" },
    { path: "/creditos/reports", icon: BarChart2, label: "Reportes" },
  ];
};

const clientesChildren = (esOwner, role) => {
  if (esOwner)
    return [
      { path: "/Clientes", icon: List, label: "Listado" },
      { path: "/clientes/reports", icon: BarChart2, label: "Reportes" },
    ];
  if (role === "EMPLEADO")
    return [
      { path: "/Clientes", icon: List, label: "Listado" },
      { path: "/NuevoCliente", icon: PlusCircle, label: "Nuevo Cliente" },
    ];
  return [
    { path: "/Clientes", icon: List, label: "Listado" },
    { path: "/NuevoCliente", icon: PlusCircle, label: "Nuevo Cliente" },
    { path: "/clientes/reports", icon: BarChart2, label: "Reportes" },
  ];
};

const navStructure = (esOwner, role) => [
  { path: "/dashboard", icon: LayoutDashboard, label: "Inicio" },
  {
    path: "/stock",
    icon: Package,
    label: "Inventario",
    children:
      esOwner
        ? [
            { path: "/stock", icon: List, label: "Listado" },
            { path: "/stock/new", icon: PlusCircle, label: "Nuevo Producto" },
            { path: "/categorias", icon: Tags, label: "Categorías" },
            { path: "/colores", icon: Palette, label: "Colores" },
            { path: "/stock/reportes", icon: BarChart2, label: "Reportes" },
          ]
        : role === "EMPLEADO"
          ? [
              { path: "/stock", icon: List, label: "Listado" },
              { path: "/stock/new", icon: PlusCircle, label: "Nuevo Producto" },
              { path: "/categorias", icon: Tags, label: "Categorías" },
              { path: "/colores", icon: Palette, label: "Colores" },
            ]
          : [
              { path: "/stock", icon: List, label: "Listado" },
              { path: "/stock/new", icon: PlusCircle, label: "Nuevo Producto" },
              { path: "/categorias", icon: Tags, label: "Categorías" },
              { path: "/colores", icon: Palette, label: "Colores" },
              { path: "/stock/control", icon: AlertCircle, label: "Control" },
              { path: "/stock/reportes", icon: BarChart2, label: "Reportes" },
            ],
  },
  {
    path: "/ventas",
    icon: ShoppingBag,
    label: "Ventas",
    children: ventasChildren(esOwner, role),
  },
  {
    path: "/Creditos",
    icon: FileText,
    label: "Créditos",
    children: creditosChildren(esOwner, role),
  },
  ...(esOwner ? [] : [{ path: "/caja", icon: Wallet, label: "Caja diaria" }]),
  {
    path: "/Clientes",
    icon: Users,
    label: "Clientes",
    children: clientesChildren(esOwner, role),
  },
  { path: "/codigos-barra", icon: Barcode, label: "Códigos de barra" },
  { path: "/consultar-stock", icon: SearchCheck, label: "Stock sucursales" },
  ...(role !== "EMPLEADO" ? [{ path: "/configuracion", icon: Settings, label: "Configuración" }] : []),
];

export default function SidebarLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const esOwner = user.role === "OWNER";
  const navStructureWithTransfer = [
    ...navStructure(esOwner, user.role),
    ...(esOwner ? [{ path: "/transferir-stock", icon: Truck, label: "Transferir stock" }] : []),
  ];
  const [expanded, setExpanded] = useState(() => {
    const path = location.pathname;
    if (path.includes("ventas")) return "ventas";
    if (path.includes("stock") || path.includes("categorias") || path.includes("colores")) return "stock";
    if (path.includes("Creditos") || path.includes("creditos")) return "Creditos";
    if (path.includes("Clientes") || path.includes("clientes") || path.includes("NuevoCliente") || path.includes("EditarCliente")) return "Clientes";
    return null;
  });

  const handleLogout = () => {
    clearAuth();
    sessionStorage.removeItem("sucursal_id");
    navigate("/");
  };

  const roleLabel = {
    OWNER: "Dueña",
    ADMIN: "Administrador",
    EMPLEADO: "Empleado",
  }[user.role] || user.role || "Usuario";

  const userName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "Usuario";

  const toggleExpand = (key) => {
    setExpanded((prev) => (prev === key ? null : key));
  };

  const isPathActive = (path) => {
    if (path === "/dashboard") return location.pathname === "/dashboard";
    if (path === "/ventas") return location.pathname === "/ventas" || location.pathname.startsWith("/ventas/");
    if (path === "/caja") return location.pathname === "/caja";
    if (path === "/configuracion") return location.pathname === "/configuracion";
    if (path === "/stock")
      return (
        location.pathname === "/stock" ||
        location.pathname.startsWith("/stock/") ||
        location.pathname === "/categorias" ||
        location.pathname === "/colores"
      );
    if (path === "/Creditos") return location.pathname === "/Creditos" || location.pathname.startsWith("/creditos") || location.pathname === "/NuevoCredito";
    if (path === "/Clientes") return location.pathname === "/Clientes" || location.pathname === "/NuevoCliente" || location.pathname.startsWith("/EditarCliente") || location.pathname === "/clientes/reports";
    if (path === "/transferir-stock") return location.pathname === "/transferir-stock";
    if (path === "/codigos-barra") return location.pathname === "/codigos-barra";
    if (path === "/consultar-stock") return location.pathname === "/consultar-stock";
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-64 bg-slate-900 flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-slate-700/50">
          <Link to="/dashboard" className="flex items-center gap-3">
            <span className="text-base font-semibold text-white">Gestión Comercial</span>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navStructureWithTransfer.map((item) => {
            if (!item.children) {
              const isActive = isPathActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-base leading-normal text-left transition-colors no-underline font-medium ${
                    isActive
                      ? "bg-teal-600 text-white"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <item.icon className="h-5 w-5 shrink-0 opacity-90" />
                  {item.label}
                </Link>
              );
            }

            const isExpanded = expanded === item.path;
            const parentActive = isPathActive(item.path);

            return (
              <div key={item.path}>
                <button
                  onClick={() => toggleExpand(item.path)}
                  type="button"
                  className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-base leading-normal font-medium transition-colors text-left ${
                    parentActive
                      ? "bg-teal-600/10 text-teal-400"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="h-5 w-5 shrink-0 opacity-90" />
                    {item.label}
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                </button>
                {isExpanded && (
                  <div className="mt-1 ml-4 pl-4 border-l border-slate-700/50 space-y-0.5">
                    {item.children.map((child) => {
                      const active =
                        location.pathname === child.path ||
                        (child.path === "/ventas" && location.pathname.startsWith("/ventas/details")) ||
                        (child.path === "/stock" && (location.pathname.startsWith("/stock/details") || location.pathname.startsWith("/stock/adjust"))) ||
                        (child.path === "/categorias" && location.pathname === "/categorias") ||
                        (child.path === "/colores" && location.pathname === "/colores") ||
                        (child.path === "/Creditos" && location.pathname.startsWith("/creditos/"));
                      return (
                        <Link
                          key={child.path}
                          to={child.path}
                          className={`flex items-center gap-2 py-2 px-2 rounded text-sm transition-colors ${
                            active
                              ? "text-teal-400 font-medium"
                              : "text-slate-500 hover:text-white"
                          }`}
                        >
                          <child.icon className="h-4 w-4 shrink-0" />
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-700/50">
          <div className="px-3 py-2 mb-1 flex items-center gap-2 text-slate-400">
            <UserCircle className="h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate" title={userName}>{userName}</p>
              <p className="text-xs text-slate-500">{roleLabel}</p>
              {!esOwner && user.sucursal_nombre && (
                <p className="text-xs text-slate-500 truncate" title={user.sucursal_nombre}>{user.sucursal_nombre}</p>
              )}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto min-w-0">
        <Outlet />
      </main>
      <BarcodePricePopup />
    </div>
  );
}
