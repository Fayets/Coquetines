from uuid import UUID
from pony.orm import *
import bcrypt
from fastapi import HTTPException

from src import models, schemas

def create_user(user: schemas.UserCreate):
    with db_session:
        try:
            usuario = models.User(username=user.username,email=user.email,password=hash_password(user.password), firstName=user.firstName,lastName=user.lastName)
            print("Usuario creado correctamente.")
            user_dict = usuario.to_dict(exclude=['id'])
            return user_dict
        except TransactionIntegrityError as e:
            print(f"Error de integridad transaccional: {e}")
        except Exception as e:
            print(f"Error al crear el usuario: {e}")

def get_users():
    with db_session:
        users = select(p for p in models.User)[:]
        users_conversion = [
        {key: str(value) if isinstance(value, UUID) else value for key, value in user.to_dict().items()}
        for user in users
        ]
        return users_conversion

def search_user(username, email,password):
    with db_session:
        user =  select(u for u in models.User if (u.username == username or u.email == email)).first()

    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    password_is_valid = check_password(user.password,password)

    if not password_is_valid:
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")
    return user


def hash_password(password: str) -> str:
    # Generar una sal (salt)
    salt = bcrypt.gensalt()
    # Encriptar la contraseña con la sal
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def check_password(stored_password: str, provided_password: str) -> bool:
    # Comparar la contraseña proporcionada con la almacenada
    return bcrypt.checkpw(provided_password.encode('utf-8'), stored_password.encode('utf-8'))


# {
#   "username": "chuly",
#   "email": "chuly@test.com",
#   "firstName": "carlos",
#   "lastName": "alem",
#   "role": "ADMIN",
#   "password": "1234"
# }


