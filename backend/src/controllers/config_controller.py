from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.controllers.auth_controller import get_current_user, get_admin_user
from src.services.config_services import ConfigServices


router = APIRouter()
service = ConfigServices()


class ConfigResponse(BaseModel):
    whatsapp_numero_caja: str


class ConfigUpdateRequest(BaseModel):
    whatsapp_numero_caja: str = ""


@router.get("", response_model=ConfigResponse)
def get_config(current_user=Depends(get_admin_user)):
    """Obtiene la configuración (solo administrador)."""
    try:
        numero = service.get_whatsapp_caja()
        return ConfigResponse(whatsapp_numero_caja=numero)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("", response_model=ConfigResponse)
def update_config(data: ConfigUpdateRequest, current_user=Depends(get_admin_user)):
    """Actualiza la configuración (solo administrador)."""
    try:
        service.set_whatsapp_caja(data.whatsapp_numero_caja)
        numero = service.get_whatsapp_caja()
        return ConfigResponse(whatsapp_numero_caja=numero)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
