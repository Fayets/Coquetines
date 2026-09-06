from fastapi import HTTPException, APIRouter, status, Depends
from pony.orm import db_session
from src import schemas
from jose import jwt, JWTError
from src.services.user_services import UsersService
from pydantic import BaseModel
from decouple import config
from fastapi.security import OAuth2PasswordBearer
from datetime import datetime, timedelta
from uuid import UUID

# Auth controller

router = APIRouter()
service = UsersService()

SECRET_KEY = config("SECRET")
ACCESS_TOKEN_DURATION = 180  # 3 horas
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")


class RegisterMessage(BaseModel):
    message: str
    success: bool


async def get_current_user(token: str = Depends(oauth2_scheme)):
    """ Verifica el token y obtiene el usuario actual. Devuelve SimpleNamespace con role y sucursal_id. """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user_id = payload.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token inválido (ID no encontrado)")
        try:
            user_id = UUID(user_id)
        except (ValueError, TypeError):
            raise HTTPException(status_code=401, detail="Token inválido (ID malformado)")
        user = service.search_user_by_id(user_id)
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        return user
    except HTTPException:
        raise
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error al cargar usuario: {str(e)}")


async def get_admin_user(current_user=Depends(get_current_user)):
    """Exige que el usuario sea ADMIN de una sucursal."""
    if getattr(current_user, "role", None) not in ("ADMIN", "OWNER"):
        raise HTTPException(status_code=403, detail="Solo el administrador puede realizar esta acción")
    return current_user


async def get_owner_user(current_user=Depends(get_current_user)):
    """Exige que el usuario sea OWNER (dueña del local)."""
    if getattr(current_user, "role", None) != "OWNER":
        raise HTTPException(
            status_code=403,
            detail="Solo la dueña del local puede realizar esta acción (crear sucursales, transferir stock).",
        )
    return current_user


def get_sucursal_id_for_user(current_user, sucursal_id_from_request: int | None) -> int | None:
    """
    Determina la sucursal a usar: para OWNER usa la pasada por request (o None).
    Para ADMIN/EMPLEADO usa la sucursal del usuario (sucursal_id en el objeto, sin lazy load).
    """
    role = getattr(current_user, "role", None)
    if role == "OWNER":
        return sucursal_id_from_request
    sid = getattr(current_user, "sucursal_id", None)
    if sid is not None:
        return int(sid)
    from src.services.sucursal_services import SucursalServices
    return SucursalServices().get_or_create_default_sucursal_id()


def _stock_sucursal_id_for_user(current_user) -> int | None:
    """Si el usuario pertenece a tienda online, devuelve la sucursal física de stock."""
    if getattr(current_user, "es_tienda_online", False):
        stock_id = getattr(current_user, "sucursal_stock_id", None)
        if stock_id is not None:
            return int(stock_id)
    user_sid = getattr(current_user, "sucursal_id", None)
    if user_sid is None:
        return None
    from pony.orm import db_session
    from src import models

    with db_session:
        suc = models.Sucursal.get(id=int(user_sid))
        if not suc or not bool(getattr(suc, "es_tienda_online", False) or False):
            return None
        stock_id = getattr(suc, "sucursal_stock_id", None)
        return int(stock_id) if stock_id is not None else None


def get_sucursal_id_for_stock_read(current_user, sucursal_id_from_request: int | None) -> int | None:
    """
    Sucursal para consultas de inventario/stock.
    Tienda online: usa sucursal_stock_id vinculada (ignora la sucursal virtual del usuario).
    """
    role = getattr(current_user, "role", None)
    if role == "OWNER":
        return sucursal_id_from_request

    stock_sid = _stock_sucursal_id_for_user(current_user)
    if stock_sid is not None:
        if sucursal_id_from_request is not None and int(sucursal_id_from_request) != stock_sid:
            raise HTTPException(
                status_code=403,
                detail="Solo podés consultar el stock de la sucursal vinculada a la tienda online.",
            )
        return stock_sid

    return get_sucursal_id_for_user(current_user, sucursal_id_from_request)


def get_sucursal_id_for_ventas_cambio_listado(
    current_user, sucursal_id_from_request: int | None
) -> int | None:
    """
    Sucursal cuyas ventas se listan solo en GET /ventas/all?listado_cambio=1.
    - OWNER: la del query o None (todas las ventas).
    - ADMIN/EMPLEADO: la del query si existe en el sistema; si no viene, la sucursal del usuario.
    """
    from src.services.sucursal_services import SucursalServices

    role = getattr(current_user, "role", None)
    if role == "OWNER":
        return sucursal_id_from_request
    if sucursal_id_from_request is not None:
        sid_req = int(sucursal_id_from_request)
        SucursalServices().get_by_id(sid_req)
        return sid_req
    sid = getattr(current_user, "sucursal_id", None)
    if sid is not None:
        return int(sid)
    return SucursalServices().get_or_create_default_sucursal_id()


@router.post("/verify-token")
async def verify_token(token: str):
    """ Verifica la validez del token y devuelve la info del usuario """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user_id = payload.get("id")

        if not user_id:
            raise HTTPException(status_code=401, detail="Token inválido")

        try:
            user_id = UUID(user_id)
        except (ValueError, TypeError):
            raise HTTPException(status_code=401, detail="Token inválido")

        user = service.search_user_by_id(user_id)

        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")

        return {
            "message": "Token válido",
            "user": {
                "username": user.username,
                "email": user.email
            }
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")


@router.post("/register", response_model=RegisterMessage, status_code=201)
async def register(user: schemas.UserCreate):
    """ Registra un nuevo usuario """
    try:
        service.create_user(user)
        return {"message": "Usuario creado correctamente", "success": True}
    except HTTPException as e:
        return {"message": e.detail, "success": False}
    except Exception:
        return {"message": "Error inesperado al crear el usuario.", "success": False}


@router.post("/login")
async def login(request: schemas.LoginRequest):
    """ Autenticación del usuario y generación de token """
    username = request.username
    email = request.email
    password = request.password

    if not username and not email:
        raise HTTPException(status_code=400, detail="Se requiere un nombre de usuario o un email")

    # Buscar el usuario con el servicio (sucursal leída dentro de la sesión para no colgar)
    user, sucursal_id, sucursal_nombre, es_tienda_online, sucursal_stock_id, sucursal_stock_nombre = service.search_user(
        username=username, email=email, password=password
    )

    access_token = {
        "id": str(user.id),
        "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_DURATION)
    }
    if sucursal_nombre is None and sucursal_id is not None:
        sucursal_nombre = "Sucursal"

    return {
        "message": "Usuario autenticado correctamente",
        "success": True,
        "access_token": jwt.encode(access_token, key=SECRET_KEY, algorithm="HS256"),
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
            "firstName": getattr(user, "firstName", ""),
            "lastName": getattr(user, "lastName", ""),
            "role": getattr(user, "role", "ADMIN"),
            "sucursal_id": sucursal_id,
            "sucursal_nombre": sucursal_nombre,
            "es_tienda_online": es_tienda_online,
            "sucursal_stock_id": sucursal_stock_id,
            "sucursal_stock_nombre": sucursal_stock_nombre,
        },
    }



#{
#  "username": "chuly",
#  "email": "chuly@test.com",
#  "firstName": "Carlos",
#  "lastName": "Alem",
#  "role": "ADMIN",
#  "password": "1234"
#}