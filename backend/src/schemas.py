from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, date
from src.models import Roles

#USUARIOS
class BaseUser(BaseModel):
    username: str
    email: str
    firstName: str
    lastName: str
    role: Roles

    class Config:
        from_attributes = True
        use_enum_values = True


class UserCreate(BaseUser):
    password: str
    sucursal_id: Optional[int] = None  # Para ADMIN/EMPLEADO; OWNER sin sucursal


class EmpleadoResponse(BaseModel):
    """Respuesta para listar empleados (ADMIN/EMPLEADO) en configuración owner."""
    id: str
    username: str
    email: str
    firstName: str
    lastName: str
    role: str
    sucursal_id: Optional[int] = None
    sucursal_nombre: Optional[str] = None

    class Config:
        from_attributes = True


class ChangePasswordRequest(BaseModel):
    new_password: str


#LOGIN
class LoginRequest(BaseModel):
    username: str | None = None
    email: str | None = None
    password: str

class TokenVerificationRequest(BaseModel):
    token: str

# SUCURSALES
class SucursalCreate(BaseModel):
    nombre: str
    direccion: Optional[str] = None

class SucursalResponse(BaseModel):
    id: int
    nombre: str
    direccion: Optional[str] = None
    activo: bool

    class Config:
        from_attributes = True

class TransferenciaStockRequest(BaseModel):
    sucursal_origen_id: int
    sucursal_destino_id: int
    producto_codigo: str  # código del producto en la sucursal origen
    cantidad: int

#PRODUCTOS  
class ProductCreate(BaseModel):
    sucursal_id: Optional[int] = None  # Si no se envía, se usa la del usuario
    codigo: str
    nombre: str
    marca: Optional[str] = ""
    talle: str
    categoria_id: int
    color_id: int
    precio_costo: float
    precio_venta: float
    precio_et: float
    stock: int
    stock_minimo: int    

class CategoryBase(BaseModel):
    id: int
    name: str

class ColorBase(BaseModel):
    id: int
    name: str

class ProductResponse(BaseModel):
    id: int
    sucursal_id: Optional[int] = None
    codigo: str
    nombre: str
    marca: Optional[str] = "Generico"
    talle: str
    categoria: CategoryBase | None
    color: ColorBase
    precio_costo: float
    precio_venta: float
    precio_et: float
    stock: int
    stock_minimo: int

    class Config:
        from_attributes = True


class StockIngresoCreate(BaseModel):
    """Reposición: suma unidades al stock del producto existente y deja auditoría."""

    producto_id: int
    fecha: date
    cantidad: int = Field(..., gt=0, description="Unidades agregadas al stock")
    motivo: Optional[str] = Field(None, max_length=500)


class StockIngresoRegistroItem(BaseModel):
    id: int
    fecha: date
    cantidad: int
    motivo: Optional[str] = None


class StockIngresoAPIResponse(BaseModel):
    message: str
    success: bool
    stock_actual: int


#CATEGORIAS (catálogo único compartido por todas las sucursales)
class CategoryCreate(BaseModel):
    name: str = Field(
        ...,
        min_length=1,
        description="Nombre de categoría en el catálogo global; no se duplica entre sucursales (comparación sin distinguir mayúsculas).",
    )

class CategoryResponse(BaseModel):
   name: str
   id:int

# COLORES (catálogo global, igual que categorías)
class ColorCreate(BaseModel):
    name: str = Field(
        ...,
        min_length=1,
        description="Nombre del color en el catálogo global; único sin distinguir mayúsculas.",
    )


class ColorResponse(BaseModel):
    name: str
    id: int

class StockAdjustMessage(BaseModel):
    message: str
    stock_actual: int

# VENTAS
class VentaCreate(BaseModel):
    sucursal_id: Optional[int] = None  # Si no se envía, se usa la del usuario
    cliente: str
    metodo_pago: str
    productos: List["DetalleVentaCreate"]
    total: Optional[float] = None
    fecha: datetime = Field(default_factory=lambda: datetime.now().date())

class VentaResponse(BaseModel):
    id: int
    cliente: str
    total: float
    metodo_pago: str
    fecha: str
    productos: List["DetalleVentaResponse"]
    
# DETALLE DE VENTA
class DetalleVentaCreate(BaseModel):
    producto_id: int
    codigo: Optional[str] = None
    cantidad: int
    precio_unitario: float  # Agregar el precio unitario del producto

class DetalleVentaResponse(BaseModel):
    id: int
    producto_id: int
    codigo: Optional[str] = None
    nombre: str  # Agregar el nombre del producto
    cantidad: int
    precio_unitario: float  # Agregar el precio unitario
    subtotal: float


# CLIENTES

class ClienteCreate(BaseModel):
    nombre: str
    apellido: str
    dni: str
    celular: str
    email: str
    direccion: str
    ciudad: str
    provincia: str

class ClienteResponse(BaseModel):
    id: int
    nombre: str
    apellido: str
    dni: str
    celular: str
    email: str
    direccion: str
    ciudad: str
    provincia: str
    sucursal_id: Optional[int] = None
    sucursal_nombre: Optional[str] = None

    class Config:
        from_attributes = True

#CREDITOS

class PagoCreditoCreate(BaseModel):
    credito_id: int
    monto: float
    fecha_pago: datetime = Field(default_factory=lambda: datetime.now().date())  # Guarda solo la fecha sin hora

class PagoCreditoRequest(BaseModel):
    monto: float
    fecha_pago: date

class CreditoCreate(BaseModel):
    sucursal_id: Optional[int] = None  # Si no se envía, se usa la del usuario
    cliente: str
    productos: List[DetalleVentaCreate]
    entrega_inicial: float
    saldo_pendiente: float
    total: float
    fecha: date
    metodo_pago: str

    
class CreditoResponse(BaseModel):
    id: int
    fecha: str
    cliente: str
    productos: List[DetalleVentaResponse]
    entrega_inicial: float
    saldo_pendiente: float
    metodo_pago: str
    estado: str
    fecha_credito: str

class CreditoViewResponse(BaseModel):
    id: int
    cliente: str
    fecha_inicio: str  # Formato de fecha en string
    saldo_pendiente: float
    estado: str

class ProductoCreditoItem(BaseModel):
    producto_id: int
    cantidad: int
    precio_unitario: float

class ProductosAgregarRequest(BaseModel):
    productos: List[ProductoCreditoItem]

class PagoCreditoResponse(BaseModel):
    id: int
    monto: float
    fecha_pago: datetime


# CAJA DIARIA
class AbrirCajaRequest(BaseModel):
    sucursal_id: Optional[int] = None  # Si no se envía, se usa la del usuario
    saldo_inicial: float
    fecha: Optional[date] = None


class EgresoCajaRequest(BaseModel):
    monto: float
    descripcion: str
    fecha: Optional[date] = None


class MovimientoCajaResponse(BaseModel):
    id: int
    tipo: str
    origen: str
    referencia_id: Optional[int] = None
    descripcion: Optional[str] = None
    monto: float
    fecha_hora: datetime


class CajaDiariaResumenResponse(BaseModel):
    id: int
    fecha: date
    estado: str
    saldo_inicial: float
    total_ingresos: float
    total_egresos: float
    saldo_final: float
    movimientos: List[MovimientoCajaResponse]


# CÓDIGOS DE BARRA
class CodigoBarraItem(BaseModel):
    producto_id: int
    cantidad: int = 1

class CodigoBarraRequest(BaseModel):
    productos: List[CodigoBarraItem]
