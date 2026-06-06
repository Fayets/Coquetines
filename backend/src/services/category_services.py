from pony.orm import db_session
from fastapi import HTTPException
from src import models, schemas
from src.schemas import CategoryCreate


def _normalize_category_name(name: str) -> str:
    """Unifica espacios; el catálogo es único para todas las sucursales (comparación sin case)."""
    return " ".join((name or "").strip().split())


class CategoryService:

    def get_category_by_id(self, categoria_id: int):
        with db_session:
            category = models.Category.get(id=categoria_id)
            if not category:
                raise HTTPException(status_code=404, detail="Categoría no encontrada")
            return schemas.CategoryResponse(
                id=category.id,
                name=category.name,
            )

    def get_category_by_name(self, nombre: str):
        with db_session:
            return models.Category.get(name=nombre)

    def _name_taken_ci(self, name: str, exclude_id: int | None = None) -> models.Category | None:
        target = _normalize_category_name(name).lower()
        if not target:
            return None
        for c in models.Category.select():
            if exclude_id is not None and int(c.id) == int(exclude_id):
                continue
            if _normalize_category_name(c.name).lower() == target:
                return c
        return None

    def get_all_categories(self):
        """Lista el catálogo global compartido por todas las sucursales."""
        with db_session:
            try:
                categories = list(models.Category.select())
                category_list = [
                    {"id": int(category.id), "name": category.name}
                    for category in categories
                ]
                category_list.sort(key=lambda x: (x.get("name") or "").lower())
                return category_list
            except Exception as e:
                print(f"Error al obtener las categorías: {e}")
                raise HTTPException(status_code=500, detail="Error inesperado al obtener las categorías")

    def create_category(self, category_data: CategoryCreate):
        with db_session:
            try:
                normalized = _normalize_category_name(category_data.name)
                if not normalized:
                    raise HTTPException(status_code=400, detail="El nombre de la categoría no puede estar vacío.")

                if self._name_taken_ci(normalized):
                    raise HTTPException(
                        status_code=400,
                        detail="Ya existe una categoría con ese nombre (el catálogo es único para todas las sucursales).",
                    )

                models.Category(name=normalized)
                return True
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al crear la categoría: {e}")
                raise HTTPException(status_code=500, detail="Error al crear la categoría.")

    def update_category(self, categoria_id: int, category_update: CategoryCreate):
        with db_session:
            try:
                category = models.Category.get(id=categoria_id)
                if not category:
                    raise HTTPException(status_code=404, detail="Categoría no encontrada")

                normalized = _normalize_category_name(category_update.name)
                if not normalized:
                    raise HTTPException(status_code=400, detail="El nombre de la categoría no puede estar vacío.")

                other = self._name_taken_ci(normalized, exclude_id=categoria_id)
                if other:
                    raise HTTPException(
                        status_code=400,
                        detail="Ya existe otra categoría con ese nombre.",
                    )

                category.name = normalized
                return {"message": "Categoría actualizada correctamente"}
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al actualizar la categoría: {e}")
                raise HTTPException(status_code=500, detail="Error al actualizar la categoría.")

    def delete_category(self, categoria_id: int):
        with db_session:
            try:
                category = models.Category.get(id=categoria_id)
                if not category:
                    raise HTTPException(status_code=404, detail="Categoría no encontrada")

                for p in list(category.products):
                    p.categoria = None
                category.delete()
                return {"message": "Categoría eliminada correctamente"}
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al eliminar la categoría: {e}")
                raise HTTPException(status_code=500, detail="Error al eliminar la categoría.")
