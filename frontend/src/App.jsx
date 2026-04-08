import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Login";
import SidebarLayout from "./components/Layout/SidebarLayout";
import DashboardStats from "./components/Dashboard/DashboardStats";
import ProductList from "./components/Inventario/ProductList";
import ProductForm from "./components/Inventario/RegisterProduct";
import StockControl from "./components/Inventario/ControInventary";
import StockReports from "./components/Inventario/StockReports";
import VerProducto from "./components/Inventario/VerProductos";
import NuevaVenta from "./components/Ventas/RegisterSale";
import VentasList from "./components/Ventas/VerVentas";
import VentasReports from "./components/Ventas/SaleReports";
import CambioProducto from "./components/Ventas/CambioProducto";
import HistorialCambiosVenta from "./components/Ventas/HistorialCambiosVenta";
import VentasControl from "./components/Ventas/VentaID";
import ListadoCreditoss from "./components/Creditos/ListadoCreditoss";
import ListadoClientes from "./components/Clientes/ListadoClientes";
import ClientReports from "./components/Clientes/ClientReports";
import NuevoCliente from "./components/Clientes/NuevoCliente";
import EditarCliente from "./components/Clientes/EditarCliente";
import NuevoCredito from "./components/Creditos/NuevoCredito";
import PrivateRoute from "./components/Hooks/PrivateRoute";
import CreditoDetail from "./components/Creditos/CreditoID";
import CreditReports from "./components/Creditos/CreditReports";
import Pagos from "./components/Creditos/Pagos";
import AdjustStock from "./components/Inventario/AdjustStock";
import CategoriasList from "./components/Inventario/CategoriasList";
import ColoresList from "./components/Inventario/ColoresList";
import CajaDiaria from "./components/Caja/CajaDiaria";
import Configuracion from "./components/Configuracion/Configuracion";
import TransferirStock from "./components/Transferencia/TransferirStock";
import GenerarCodigosBarra from "./components/CodigosBarra/GenerarCodigosBarra";
import ConsultarStockSucursales from "./components/Inventario/ConsultarStockSucursales";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />

        <Route element={<PrivateRoute element={<SidebarLayout />} />}>
          <Route path="dashboard" element={<DashboardStats />} />
          <Route path="stock" element={<ProductList />} />
          <Route path="stock/new" element={<ProductForm />} />
          <Route path="stock/control" element={<StockControl />} />
          <Route path="stock/reportes" element={<StockReports />} />
          <Route path="stock/details/:codigo" element={<VerProducto />} />
          <Route path="stock/adjust/:codigo" element={<AdjustStock />} />
          <Route path="categorias" element={<CategoriasList />} />
          <Route path="colores" element={<ColoresList />} />
          <Route path="ventas/nueva" element={<NuevaVenta />} />
          <Route path="ventas" element={<VentasList />} />
          <Route path="ventas/reports" element={<VentasReports />} />
          <Route path="ventas/cambio" element={<CambioProducto />} />
          <Route path="ventas/cambios-historial" element={<HistorialCambiosVenta />} />
          <Route path="ventas/details/:id" element={<VentasControl />} />
          <Route path="Creditos" element={<ListadoCreditoss />} />
          <Route path="creditos/reports" element={<CreditReports />} />
          <Route path="Clientes" element={<ListadoClientes />} />
          <Route path="clientes/reports" element={<ClientReports />} />
          <Route path="NuevoCliente" element={<NuevoCliente />} />
          <Route path="EditarCliente/:dni" element={<EditarCliente />} />
          <Route path="NuevoCredito" element={<NuevoCredito />} />
          <Route path="creditos/detalle/:credito_id" element={<CreditoDetail />} />
          <Route path="pagos/:credito_id" element={<Pagos />} />
          <Route path="caja" element={<CajaDiaria />} />
          <Route path="configuracion" element={<Configuracion />} />
          <Route path="transferir-stock" element={<TransferirStock />} />
          <Route path="codigos-barra" element={<GenerarCodigosBarra />} />
          <Route path="consultar-stock" element={<ConsultarStockSucursales />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
