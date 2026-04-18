from fastapi import APIRouter
from fastapi.responses import Response
from src.services.health_services import HealthService

router = APIRouter()
health_service = HealthService()

@router.get("/")
async def health_check():
    """Endpoint GET para verificar el estado del servicio"""
    return health_service.get_health_status()

@router.head("/")
async def health_check_head():
    """Endpoint HEAD para verificar el estado del servicio"""
    # HEAD no debe devolver cuerpo, solo headers con status 200
    return Response(status_code=200)