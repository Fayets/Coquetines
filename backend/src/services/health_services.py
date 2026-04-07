import time

class HealthService:
    def __init__(self):
        self.start_time = time.time()
    
    def get_uptime(self) -> int:
        """Calcula el tiempo transcurrido desde el inicio del servidor en segundos"""
        return int(time.time() - self.start_time)
    
    def get_health_status(self) -> dict:
        """Retorna el estado completo del servicio"""
        return {
            "status": "ok",
            "service": "Sistema online",
            "uptime": self.get_uptime()
        }