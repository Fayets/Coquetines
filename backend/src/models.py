import uuid
from pony.orm import *
from enum import Enum
from .db import db
from datetime import date, datetime

class Roles(str, Enum):
    OWNER = "OWNER"      # Dueña: ve todas las sucursales, transferencias, etc.
    ADMIN = "ADMIN"      # Admin de una sucursal
    EMPLEADO = "EMPLEADO"  # Empleado de una sucursal

# Sucursal
class Sucursal(db.Entity):
    id = PrimaryKey(int, auto=True)
    nombre = Required(str)
    direccion = Optional(str)
    activo = Required(bool, default=True)
    usuarios = Set("User")
    productos = Set("Product")
    ventas = Set("Venta")
    cajas = Set("CajaDiaria")
    creditos = Set("CreditoPersonal")
    clientes = Set("Cliente")
    cambios_venta = Set("CambioVenta")
    notas_credito = Set("NotaCredito")
    _table_ = "Sucursales"

# Modelo de usuario (sucursal_id es None para OWNER/dueña)
class User(db.Entity):
    id = PrimaryKey(uuid.UUID, auto=True)
    username = Required(str)
    email = Required(str)
    password = Required(str)
    firstName = Required(str, column="firstName")
    lastName = Required(str, column="lastName")
    role = Required(str)  # OWNER | ADMIN | EMPLEADO
    sucursal = Optional("Sucursal", column="sucursal_id")  # Null para OWNER
    _table_ = "Users"

# Catálogo global de categorías (compartido por todas las sucursales; Product.categoria apunta aquí)
class Category(db.Entity):
    id = PrimaryKey(int, auto=True)
    name = Required(str)
    products = Set("Product")
    _table_ = "Categories"

# Catálogo global de colores (misma idea que Category; Product.color apunta aquí)
class Color(db.Entity):
    id = PrimaryKey(int, auto=True)
    name = Required(str)
    products = Set("Product")
    _table_ = "Colors"

# Modelo de productos (por sucursal: mismo código puede existir en varias sucursales con stock independiente)
class Product(db.Entity):
    id = PrimaryKey(int, auto=True)
    sucursal = Optional(Sucursal, column="sucursal_id")  # Optional para migración; en API es obligatorio
    codigo = Required(str)  # unique por (codigo, sucursal) validado en servicio
    nombre = Required(str)
    marca = Optional(str, default="Generico")
    talle = Required(str)
    categoria = Optional(Category)
    color = Required("Color", column="color_id")
    precio_costo = Required(float)
    precio_venta = Required(float)
    precio_et = Optional(float, default=0)
    precio_efectivo = Optional(float, default=0)
    precio_transferencia = Optional(float, default=0)
    stock = Required(int, default=0)
    stock_minimo = Required(int, default=0)
    ventas = Set("VentaProducto")
    creditos_productos = Set("CreditoProducto")
    ingresos_stock = Set("IngresoStock")
    cambios_venta_devuelto = Set("CambioVenta", reverse="producto_devuelto")
    cambios_venta_nuevo = Set("CambioVenta", reverse="producto_nuevo")
    _table_ = "Products"


# Registro de reposición / ingreso de stock (sin crear códigos nuevos)
class IngresoStock(db.Entity):
    id = PrimaryKey(int, auto=True)
    producto = Required("Product", column="producto_id")
    fecha = Required(date)
    cantidad = Required(int)
    motivo = Optional(str)
    _table_ = "Ingresos_Stock"


# Modelo de ventas (por sucursal)
class Venta(db.Entity):
    id = PrimaryKey(int, auto=True)
    sucursal = Optional(Sucursal, column="sucursal_id")
    cliente = Required(str, default="Consumidor Final")
    productos = Set("VentaProducto")
    total = Required(float)
    metodo_pago = Required(str)
    fecha = Required(date, default=lambda: date.today())
    cambios = Set("CambioVenta", reverse="venta_original")
    _table_ = "Ventas"

# Relación entre ventas y productos
class VentaProducto(db.Entity):
    id = PrimaryKey(int, auto=True)
    venta = Required(Venta)
    producto = Required(Product)
    cantidad = Required(int)
    subtotal = Required(float)
    cambios_como_linea = Set("CambioVenta", reverse="detalle_linea")
    _table_ = "Venta_Productos"

# Modelo de clientes (por sucursal: cada sucursal tiene su propia lista de clientes)
class Cliente(db.Entity):
    id = PrimaryKey(int, auto=True)
    sucursal = Optional(Sucursal, column="sucursal_id")  # Sucursal donde se registró el cliente
    dni = Required(str)  # Único por sucursal (mismo DNI puede existir en otra sucursal)
    nombre = Required(str)
    apellido = Required(str)
    direccion = Optional(str)
    celular = Optional(str)
    ciudad = Optional(str)
    provincia = Optional(str)
    email = Optional(str)
    creditos = Set("CreditoPersonal")
    _table_ = "Clientes"

# Modelo de créditos personales (por sucursal)
class CreditoPersonal(db.Entity):
    id = PrimaryKey(int, auto=True)
    sucursal = Optional(Sucursal, column="sucursal_id")
    cliente = Required(Cliente)
    fecha_credito = Required(date, default=lambda: date.today())
    entrega_inicial = Required(float, default=0)
    saldo_pendiente = Required(float)
    total = Optional(float, default=0)
    metodo_pago = Required(str)
    productos = Set("CreditoProducto")
    pagos = Set("PagoCredito")
    estado = Required(str, default="Activo")
    _table_ = "Creditos_Personales"

# Relación entre crédito y productos comprados en él
class CreditoProducto(db.Entity):
    id = PrimaryKey(int, auto=True)
    credito = Required(CreditoPersonal)
    producto = Required(Product)
    cantidad = Required(int)
    subtotal = Required(float)  # Precio total por el producto dentro del crédito
    _table_ = "Credito_Productos"

# Modelo de pagos de créditos
class PagoCredito(db.Entity):
    id = PrimaryKey(int, auto=True)
    credito = Required(CreditoPersonal)  
    fecha_pago = Required(date, default=lambda: date.today())  # Fecha del pago
    monto = Required(float)  # Monto abonado en este pago
    _table_ = "Pagos_Creditos"


class TipoMovimientoCaja(str, Enum):
    INGRESO = "INGRESO"
    EGRESO = "EGRESO"


class OrigenMovimientoCaja(str, Enum):
    VENTA = "VENTA"
    PAGO_CREDITO = "PAGO_CREDITO"
    MANUAL = "MANUAL"
    CAMBIO_VENTA = "CAMBIO_VENTA"


class CajaDiaria(db.Entity):
    """Caja diaria por sucursal: cada sucursal tiene su propia caja por día (ingresos/egresos independientes)."""
    id = PrimaryKey(int, auto=True)
    sucursal = Optional(Sucursal, column="sucursal_id")
    fecha = Required(date)
    composite_key(sucursal, fecha)  # una caja por sucursal por día
    saldo_inicial = Required(float, default=0)
    total_ingresos = Required(float, default=0)
    total_egresos = Required(float, default=0)
    saldo_final = Required(float, default=0)
    estado = Required(str, default="ABIERTA")
    movimientos = Set("MovimientoCaja")
    _table_ = "Cajas_Diarias"


class MovimientoCaja(db.Entity):
    id = PrimaryKey(int, auto=True)
    caja = Required(CajaDiaria)
    tipo = Required(str)  # Usa valores de TipoMovimientoCaja
    origen = Required(str)  # Usa valores de OrigenMovimientoCaja
    referencia_id = Optional(int)  # ID de venta, pago de crédito, etc.
    descripcion = Optional(str)
    monto = Required(float)
    fecha_hora = Required(datetime, default=lambda: datetime.now())
    _table_ = "Movimientos_Caja"


# Cambio de producto respecto de una venta (devolución parcial de línea + entrega de otro artículo)
class CambioVenta(db.Entity):
    id = PrimaryKey(int, auto=True)
    venta_original = Required("Venta", column="venta_original_id")
    sucursal = Optional("Sucursal", column="sucursal_id")
    fecha = Required(date, default=lambda: date.today())
    detalle_linea = Required("VentaProducto", column="venta_producto_id")
    producto_devuelto = Required("Product", column="producto_devuelto_id")
    cantidad_devuelta = Required(int)
    valor_devuelto = Required(float)
    producto_nuevo = Required("Product", column="producto_nuevo_id")
    cantidad_nueva = Required(int)
    valor_nuevo = Required(float)
    diferencia_monto = Required(float)
    metodo_pago_suplemento = Optional(str)
    # Mismo UUID en todos los CambioVenta creados por un POST /cambios/registrar-lote (una fila en historial).
    grupo_lote_uid = Optional(str, nullable=True)
    # Al borrar el cambio (p. ej. al eliminar la venta), borrar la nota asociada.
    nota_credito = Optional("NotaCredito", cascade_delete=True)
    _table_ = "Cambios_Venta"


# Nota de crédito (saldo a favor del cliente, p. ej. cambio por artículo de menor valor)
class NotaCredito(db.Entity):
    id = PrimaryKey(int, auto=True)
    sucursal = Optional("Sucursal", column="sucursal_id")
    cliente_nombre = Required(str)
    monto = Required(float)
    fecha = Required(date, default=lambda: date.today())
    motivo = Optional(str)
    cambio = Required("CambioVenta", column="cambio_id", unique=True, reverse="nota_credito")
    _table_ = "Notas_Credito"


# Configuración (clave-valor) para el administrador
class Config(db.Entity):
    id = PrimaryKey(int, auto=True)
    clave = Required(str, unique=True)
    valor = Optional(str, default="")
    _table_ = "Config"