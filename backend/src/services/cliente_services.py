from pony.orm import db_session, select
from fastapi import HTTPException
from typing import Optional
from uuid import UUID
from pony.orm.core import TransactionIntegrityError
from src import models, schemas


class ClienteService:
    def __init__(self):
        pass

    def create_cliente(self, cliente: schemas.ClienteCreate, sucursal_id: int) -> dict:
        with db_session:
            try:
                sucursal = models.Sucursal.get(id=sucursal_id)
                if not sucursal:
                    raise HTTPException(status_code=400, detail="Sucursal no encontrada")
                # Mismo DNI en la misma sucursal = ya existe (get() acepta sucursal=entidad)
                existente = models.Cliente.get(dni=cliente.dni, sucursal=sucursal)
                if existente:
                    raise HTTPException(status_code=400, detail="Ya existe un cliente con ese DNI en esta sucursal")
                nuevo = models.Cliente(
                    nombre=cliente.nombre,
                    apellido=cliente.apellido,
                    dni=cliente.dni,
                    celular=cliente.celular,
                    email=cliente.email,
                    direccion=cliente.direccion,
                    ciudad=cliente.ciudad,
                    provincia=cliente.provincia,
                    sucursal=sucursal,
                )
                return nuevo.to_dict()
            except HTTPException:
                raise
            except TransactionIntegrityError:
                raise HTTPException(status_code=400, detail="El cliente ya existe")
            except Exception as e:
                print(f"Error al crear cliente: {e}")
                raise HTTPException(status_code=500, detail="Error inesperado al registrar el cliente.")

    def get_all_clientes(self, sucursal_id: Optional[int] = None):
        with db_session:
            try:
                if sucursal_id is not None:
                    # Pony no compara bien entidades en lambdas; filtrar por id en Python
                    todos = list(models.Cliente.select())
                    clientes = [c for c in todos if c.sucursal is not None and c.sucursal.id == sucursal_id]
                else:
                    clientes = list(models.Cliente.select())
                cliente_list = []
                for c in clientes:
                    cliente_list.append({
                        "id": c.id,
                        "dni": c.dni,
                        "nombre": c.nombre,
                        "apellido": c.apellido,
                        "celular": c.celular,
                        "email": c.email,
                        "direccion": c.direccion,
                        "ciudad": c.ciudad,
                        "provincia": c.provincia,
                        "sucursal_id": c.sucursal.id if c.sucursal else None,
                        "sucursal_nombre": c.sucursal.nombre if c.sucursal else None,
                    })
                return cliente_list
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al obtener clientes: {e}")
                raise HTTPException(status_code=500, detail="Error inesperado al obtener clientes")

    def get_cliente_by_dni(self, dni: str, sucursal_id: Optional[int] = None) -> dict:
        with db_session:
            if sucursal_id is not None:
                sucursal = models.Sucursal.get(id=sucursal_id)
                cliente = models.Cliente.get(dni=dni, sucursal=sucursal)
            else:
                cliente = models.Cliente.get(dni=dni)
            if not cliente:
                raise HTTPException(status_code=404, detail="Cliente no encontrado")
            return {
                "id": cliente.id,
                "dni": cliente.dni,
                "nombre": cliente.nombre,
                "apellido": cliente.apellido,
                "celular": cliente.celular,
                "email": cliente.email,
                "direccion": cliente.direccion,
                "ciudad": cliente.ciudad,
                "provincia": cliente.provincia,
            }

    def update_cliente(self, id: int, cliente_update: schemas.ClienteCreate, sucursal_id: Optional[int] = None) -> dict:
        with db_session:
            try:
                cliente = models.Cliente.get(id=id)
                if not cliente:
                    raise HTTPException(status_code=404, detail="Cliente no encontrado")
                if sucursal_id is not None:
                    if getattr(cliente.sucursal, "id", None) != sucursal_id:
                        raise HTTPException(status_code=403, detail="No podés editar un cliente de otra sucursal.")
                cliente.nombre = cliente_update.nombre
                cliente.apellido = cliente_update.apellido
                cliente.dni = cliente_update.dni
                cliente.celular = cliente_update.celular
                cliente.email = cliente_update.email
                cliente.direccion = cliente_update.direccion
                cliente.ciudad = cliente_update.ciudad
                cliente.provincia = cliente_update.provincia
                return {"message": "Cliente actualizado correctamente"}
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al actualizar el cliente: {e}")
                raise HTTPException(status_code=500, detail="Error inesperado al actualizar el cliente.")

    def delete_cliente(self, id: int, sucursal_id: Optional[int] = None) -> dict:
        with db_session:
            try:
                cliente = models.Cliente.get(id=id)
                if not cliente:
                    raise HTTPException(status_code=404, detail="Cliente no encontrado")
                if sucursal_id is not None:
                    if getattr(cliente.sucursal, "id", None) != sucursal_id:
                        raise HTTPException(status_code=403, detail="No podés eliminar un cliente de otra sucursal.")
                cliente.delete()
                return {"message": "Cliente eliminado correctamente"}
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error al eliminar el cliente: {e}")
                raise HTTPException(status_code=500, detail="Error inesperado al eliminar el cliente.")

    def get_cantidad_clientes_por_sucursal(self) -> list:
        """Cantidad total de clientes registrados en cada sucursal (para OWNER)."""
        with db_session:
            try:
                sucursales = list(models.Sucursal.select())
                resultado = []
                for s in sucursales:
                    if (s.nombre or "").strip() == "Sucursal Principal":
                        continue
                    todos = list(models.Cliente.select())
                    cantidad = sum(1 for c in todos if c.sucursal is not None and c.sucursal.id == s.id)
                    resultado.append({
                        "sucursal_id": s.id,
                        "sucursal_nombre": s.nombre,
                        "cantidad_clientes": cantidad,
                    })
                return resultado
            except Exception as e:
                print(f"Error al obtener cantidad de clientes por sucursal: {e}")
                raise HTTPException(status_code=500, detail="Error inesperado al obtener cantidad por sucursal.")

    def get_estadisticas_clientes_por_sucursal(self) -> list:
        """Cantidad de clientes únicos con al menos un crédito en cada sucursal (para OWNER)."""
        with db_session:
            try:
                from src.services.sucursal_services import SucursalServices
                sucursal_svc = SucursalServices()
                sucursales = list(models.Sucursal.select())
                default_id = sucursal_svc.get_or_create_default_sucursal_id()
                resultado = []
                for s in sucursales:
                    sid = s.id
                    if sid == default_id:
                        creditos = list(models.CreditoPersonal.select(lambda c: c.sucursal.id == sid or c.sucursal is None))
                    else:
                        creditos = list(models.CreditoPersonal.select(lambda c: c.sucursal.id == sid))
                    clientes_ids = {c.cliente.id for c in creditos if c.cliente}
                    resultado.append({
                        "sucursal_id": s.id,
                        "sucursal_nombre": s.nombre,
                        "cantidad_clientes": len(clientes_ids),
                    })
                return resultado
            except Exception as e:
                print(f"Error al obtener estadísticas de clientes por sucursal: {e}")
                raise HTTPException(status_code=500, detail="Error inesperado al obtener estadísticas.")