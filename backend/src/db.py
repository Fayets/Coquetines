from pony.orm import *
from decouple import config

# Pony ORM: db.bind() pasa kwargs extra al driver (psycopg2); connect_timeout evita colgar si la DB no responde
db = Database()
db.bind(
    provider=config("DB_PROVIDER"),
    user=config("DB_USER"),
    password=config("DB_PASS"),
    host=config("DB_HOST"),
    database=config("DB_NAME"),
    connect_timeout=15,  # pasado a psycopg2 por Pony
)

