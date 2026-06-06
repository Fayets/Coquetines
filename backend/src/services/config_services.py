from pony.orm import db_session
from fastapi import HTTPException

from src import models


CLAVE_WHATSAPP_CAJA = "whatsapp_numero_caja"


class ConfigServices:
    def __init__(self):
        pass

    def get_todas(self) -> dict:
        """Devuelve todas las configuraciones como dict clave -> valor."""
        with db_session:
            items = list(models.Config.select())
            return {item.clave: item.valor for item in items}

    def get(self, clave: str) -> str | None:
        with db_session:
            c = models.Config.get(clave=clave)
            return c.valor if c else None

    def set(self, clave: str, valor: str) -> None:
        with db_session:
            c = models.Config.get(clave=clave)
            if c:
                c.valor = valor
            else:
                models.Config(clave=clave, valor=valor)

    def get_whatsapp_caja(self) -> str:
        """Número de WhatsApp para envío del cierre de caja (puede estar vacío)."""
        v = self.get(CLAVE_WHATSAPP_CAJA)
        return v or ""

    def set_whatsapp_caja(self, numero: str) -> None:
        self.set(CLAVE_WHATSAPP_CAJA, (numero or "").strip())
