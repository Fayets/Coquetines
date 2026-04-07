from pony.orm import db_session, desc, select
from fastapi import HTTPException
from typing import Optional
from uuid import UUID
from types import SimpleNamespace
import bcrypt
from pony.orm.core import TransactionIntegrityError
from src import models, schemas


class UsersService:
    def __init__(self):
        pass

    def create_user(self, user: schemas.UserCreate):
        """ Crea un usuario nuevo en la base de datos. OWNER sin sucursal; ADMIN/EMPLEADO con sucursal_id opcional. """
        with db_session:
            try:
                hashed_password = self.hash_password(user.password)
                sucursal = None
                if getattr(user, "sucursal_id", None) is not None:
                    sucursal = models.Sucursal.get(id=user.sucursal_id)
                    if not sucursal and user.role != "OWNER":
                        raise HTTPException(status_code=400, detail="Sucursal no encontrada")
                usuario = models.User(
                    username=user.username,
                    email=user.email,
                    password=hashed_password,
                    firstName=user.firstName,
                    lastName=user.lastName,
                    role=user.role,
                    sucursal=sucursal,
                )
                return usuario
            except HTTPException:
                raise
            except TransactionIntegrityError:
                raise HTTPException(status_code=400, detail="El usuario o email ya existen")
            except Exception:
                raise HTTPException(status_code=500, detail="Error al crear el usuario")

    def search_user_by_id(self, user_id: UUID):
        """ Devuelve un objeto simple con id, role, sucursal_id (leídos en sesión) para no hacer lazy load fuera de sesión. """
        with db_session:
            user = models.User.get(id=user_id)
            if not user:
                return None
            sid = None
            if getattr(user, "sucursal", None) is not None:
                s = user.sucursal
                if s is not None and getattr(s, "id", None) is not None:
                    sid = int(s.id)
            return SimpleNamespace(
                id=user.id,
                username=user.username,
                email=user.email,
                firstName=getattr(user, "firstName", "") or "",
                lastName=getattr(user, "lastName", "") or "",
                role=getattr(user, "role", "ADMIN") or "ADMIN",
                sucursal_id=sid,
            )

    def search_user(self, username: Optional[str], email: Optional[str], password: str):
        """ Busca un usuario por nombre o email y valida su contraseña. Devuelve (user_entity, sucursal_id, sucursal_nombre) con sucursal leído en la misma sesión para evitar lazy load fuera de sesión. """
        with db_session:
            user = None
            if username:
                user = models.User.get(username=username)
            elif email:
                user = models.User.get(email=email)

            if not user:
                raise HTTPException(status_code=404, detail="Usuario no encontrado")

            if not self.check_password(user.password, password):
                raise HTTPException(status_code=401, detail="Contraseña incorrecta")

            sucursal_id = None
            sucursal_nombre = None
            if getattr(user, "sucursal", None) is not None:
                s = user.sucursal
                if s is not None:
                    sucursal_id = int(s.id) if s.id is not None else None
                    sucursal_nombre = str(s.nombre) if getattr(s, "nombre", None) else None

            return user, sucursal_id, sucursal_nombre

    @staticmethod
    def hash_password(password: str) -> str:
        """ Hashea una contraseña con bcrypt """
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')

    @staticmethod
    def check_password(stored_password: str, provided_password: str) -> bool:
        """ Verifica si la contraseña ingresada coincide con la almacenada """
        return bcrypt.checkpw(provided_password.encode('utf-8'), stored_password.encode('utf-8'))

    def delete_user(self, user_id: UUID):
        """Elimina un usuario. No permite eliminar OWNER. Solo empleados (ADMIN/EMPLEADO)."""
        with db_session:
            user = models.User.get(id=user_id)
            if not user:
                raise HTTPException(status_code=404, detail="Usuario no encontrado")
            role = getattr(user, "role", None) or ""
            if role == "OWNER":
                raise HTTPException(status_code=403, detail="No se puede eliminar a la dueña del local.")
            user.delete()
            return True

    def update_password(self, user_id: UUID, new_password: str):
        """Actualiza la contraseña de un usuario (solo ADMIN/EMPLEADO; OWNER no se modifica desde aquí)."""
        if not new_password or len(new_password) < 4:
            raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 4 caracteres.")
        with db_session:
            user = models.User.get(id=user_id)
            if not user:
                raise HTTPException(status_code=404, detail="Usuario no encontrado")
            role = getattr(user, "role", None) or ""
            if role == "OWNER":
                raise HTTPException(status_code=403, detail="No se puede cambiar la contraseña de la dueña desde aquí.")
            user.password = self.hash_password(new_password)
            return True
