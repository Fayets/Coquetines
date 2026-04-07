from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from src.db import db
from pony.orm import *
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.controllers.auth_controller import router as auth_router
from src.controllers.users_controller import router as users_router
from src.controllers.product_controller import router as product_router
from src.controllers.category_controller import router as category_router
from src.controllers.reportes_controller import router as reportes_router
from src.controllers.ventas_controller import router as ventas_router
from src.controllers.cliente_controller import router as cliente_router
from src.controllers.creditos_controller import router as creditos_router
from src.controllers.health_controller import router as health_router
from src.controllers.caja_controller import router as caja_router
from src.controllers.config_controller import router as config_router
from src.controllers.sucursal_controller import router as sucursal_router
app = FastAPI()

# Mapeando las entidades a tablas (si no existe la tabla, la crea)
print("[startup] Conectando DB y generando mapping...")
db.generate_mapping(create_tables=True)
print("[startup] Mapping listo.")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lista de Rutas
# Auth
app.include_router(auth_router, prefix="/auth", tags=["auth"])

# Usuarios
app.include_router(users_router, prefix="/users", tags=["usuarios"])

# Productos
app.include_router(product_router, prefix="/products", tags=["productos"])

# Categorias
app.include_router(category_router, prefix="/categories", tags=["categorias"])

#Reportes
app.include_router(reportes_router, prefix="/reportes", tags=["reportes"])

#Ventas
app.include_router(ventas_router, prefix="/ventas", tags=["ventas"])

#Clientes
app.include_router(cliente_router, prefix="/clientes", tags=["clientes"])

#Creditos
app.include_router(creditos_router, prefix="/creditos", tags=["creditos"])

#Health
app.include_router(health_router, prefix="/health", tags=["health"])

#Caja diaria
app.include_router(caja_router, prefix="/caja", tags=["caja"])

#Configuración (solo admin)
app.include_router(config_router, prefix="/config", tags=["config"])

# Sucursales (listar todos; crear/actualizar/transferir stock solo OWNER)
app.include_router(sucursal_router, prefix="/sucursales", tags=["sucursales"])
# Personalizar el esquema de seguridad en OpenAPI para usar Bearer tokens
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = app._original_openapi()  # Cambiado a _original_openapi
    openapi_schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT"
        }
    }
    for path in openapi_schema["paths"].values():
        for method in path.values():
            method["security"] = [{"BearerAuth": []}]
    app.openapi_schema = openapi_schema
    return app.openapi_schema

# Guardamos la referencia original del método openapi
app._original_openapi = app.openapi
# Reemplazamos el método openapi por nuestra función personalizada
app.openapi = custom_openapi