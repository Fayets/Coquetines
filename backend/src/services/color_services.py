from pony.orm import db_session
from fastapi import HTTPException
from src import models, schemas
from src.schemas import ColorCreate


def _normalize_color_name(name: str) -> str:
    """Unifica espacios y guarda siempre en MAYÚSCULAS (mismo criterio visual que el input)."""
    return " ".join((name or "").strip().split()).upper()


class ColorService:
    def get_color_by_id(self, color_id: int):
        with db_session:
            color = models.Color.get(id=color_id)
            if not color:
                raise HTTPException(status_code=404, detail="Color no encontrado")
            return schemas.ColorResponse(id=int(color.id), name=color.name)

    def _name_taken_ci(self, name: str, exclude_id: int | None = None) -> models.Color | None:
        target = _normalize_color_name(name).lower()
        if not target:
            return None
        for c in models.Color.select():
            if exclude_id is not None and int(c.id) == int(exclude_id):
                continue
            if _normalize_color_name(c.name).lower() == target:
                return c
        return None

    def get_all_colors(self):
        with db_session:
            try:
                colors = list(models.Color.select())
                out = [{"id": int(c.id), "name": c.name} for c in colors]
                out.sort(key=lambda x: (x.get("name") or "").lower())
                return out
            except Exception as e:
                print(f"Error al obtener los colores: {e}")
                raise HTTPException(status_code=500, detail="Error inesperado al obtener los colores")

    def create_color(self, data: ColorCreate):
        with db_session:
            try:
                normalized = _normalize_color_name(data.name)
                if not normalized:
                    raise HTTPException(status_code=400, detail="El nombre del color no puede estar vacío.")
                if self._name_taken_ci(normalized):
                    raise HTTPException(
                        status_code=400,
                        detail="Ya existe un color con ese nombre (catálogo único para todas las sucursales).",
                    )
                models.Color(name=normalized)
                return True
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al crear el color: {e}")
                raise HTTPException(status_code=500, detail="Error al crear el color.")

    def update_color(self, color_id: int, data: ColorCreate):
        with db_session:
            try:
                color = models.Color.get(id=color_id)
                if not color:
                    raise HTTPException(status_code=404, detail="Color no encontrado")
                if _normalize_color_name(color.name) == "NEUTRO":
                    raise HTTPException(status_code=400, detail="No se puede renombrar el color NEUTRO.")
                normalized = _normalize_color_name(data.name)
                if not normalized:
                    raise HTTPException(status_code=400, detail="El nombre del color no puede estar vacío.")
                other = self._name_taken_ci(normalized, exclude_id=color_id)
                if other:
                    raise HTTPException(status_code=400, detail="Ya existe otro color con ese nombre.")
                color.name = normalized
                return {"message": "Color actualizado correctamente"}
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al actualizar el color: {e}")
                raise HTTPException(status_code=500, detail="Error al actualizar el color.")

    def delete_color(self, color_id: int):
        with db_session:
            try:
                color = models.Color.get(id=color_id)
                if not color:
                    raise HTTPException(status_code=404, detail="Color no encontrado")
                if _normalize_color_name(color.name) == "NEUTRO":
                    raise HTTPException(status_code=400, detail="No se puede eliminar el color NEUTRO.")
                neutro = models.Color.get(name="NEUTRO")
                if not neutro:
                    raise HTTPException(
                        status_code=500,
                        detail="Falta el color NEUTRO en la base de datos; ejecutá la migración o creá NEUTRO.",
                    )
                for p in list(color.products):
                    p.color = neutro
                color.delete()
                return {"message": "Color eliminado correctamente; los productos pasaron a NEUTRO."}
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al eliminar el color: {e}")
                raise HTTPException(status_code=500, detail="Error al eliminar el color.")
