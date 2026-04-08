from collections import defaultdict

from fastapi import HTTPException, APIRouter, Depends, Query
from pony.orm import *
from src import schemas
from src.services.ventas_services import VentasServices
from src.services.cambios_venta_services import CambiosVentaServices
from src.controllers.auth_controller import get_current_user, get_sucursal_id_for_user, get_owner_user
from pydantic import BaseModel
from typing import List

# Ventas controller

router = APIRouter()
service = VentasServices()  # Servicio que contiene la lógica de negocio
cambios_service = CambiosVentaServices()

class RegisterMessage(BaseModel):
    message: str
    success: bool

@router.post("/register", response_model=RegisterMessage, status_code=201)
def register_venta(venta: schemas.VentaCreate, current_user=Depends(get_current_user)):
    if getattr(current_user, "role", None) == "OWNER":
        raise HTTPException(
            status_code=403,
            detail="El rol dueña (OWNER) no puede registrar ventas. Solo puede ver estadísticas y gestionar sucursales.",
        )
    sid = get_sucursal_id_for_user(current_user, venta.sucursal_id)
    if sid is None:
        raise HTTPException(status_code=400, detail="Debe indicar sucursal (o tener una asignada).")
    try:
        service.create_venta(venta, sucursal_id=sid)
        return {"message": "Venta registrada correctamente", "success": True}
    except HTTPException as e:
        raise e
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error inesperado al registrar la venta: {str(e)}")

@router.get("/get/{venta_id}", response_model=schemas.VentaResponse)
def get_venta(venta_id: int, current_user=Depends(get_current_user)):
    try:
        venta_data = service.get_venta_by_id(venta_id)
        return venta_data
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error inesperado al obtener la venta.")

@router.get("/all")
def get_all_ventas(
    sucursal_id: int | None = Query(None),
    current_user=Depends(get_current_user),
):
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    try:
        return service.get_all_ventas(sucursal_id=sid)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")

@router.get("/total", response_model=float)
def get_total_ventas(
    sucursal_id: int | None = Query(None),
    current_user=Depends(get_current_user),
):
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    try:
        return service.get_total_ventas(sucursal_id=sid)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error inesperado al obtener el total de ventas.")

@router.get("/total_sale", response_model=int)
def get_cantidad_ventas(
    sucursal_id: int | None = Query(None),
    current_user=Depends(get_current_user),
):
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    try:
        return service.get_cantidad_ventas(sucursal_id=sid)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error inesperado al obtener la cantidad de ventas.")

@router.get("/total_earnings", response_model=float)
def get_ganancia_total(
    sucursal_id: int | None = Query(None),
    current_user=Depends(get_current_user),
):
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    try:
        return service.get_ganancia_total(sucursal_id=sid)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error inesperado al obtener la ganancia total.")

@router.get("/stats_por_sucursal")
def get_estadisticas_por_sucursal(current_user=Depends(get_owner_user)):
    """Solo OWNER: estadísticas (total, cantidad, ganancia) por cada sucursal."""
    try:
        return service.get_estadisticas_por_sucursal()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"{type(e).__name__}: {str(e)}",
        )
    
@router.delete("/{venta_id}", status_code=200)
def delete_venta(venta_id: int, current_user=Depends(get_current_user)):
    try:
        result = service.delete_venta(venta_id)
        return {"message": result["message"], "success": True}
    except HTTPException as e:
        return {"message": e.detail, "success": False}
    except Exception as e:
        return {"message": "Error inesperado al eliminar la venta.", "success": False}


@router.post("/cambios/registrar", response_model=schemas.CambioVentaResultado)
def registrar_cambio_producto(
    body: schemas.CambioVentaRegistro,
    current_user=Depends(get_current_user),
):
    """
    Cambio de producto desde una venta: devuelve stock del artículo original, descuenta el nuevo,
    cobra diferencia en caja o genera nota de crédito. EMPLEADO / ADMIN / OWNER (con sucursal).
    """
    sid = get_sucursal_id_for_user(current_user, body.sucursal_id)
    if sid is None:
        raise HTTPException(
            status_code=400,
            detail="Debe indicar sucursal (o tener una asignada).",
        )
    try:
        r = cambios_service.registrar_cambio(
            venta_id=body.venta_id,
            venta_producto_id=body.venta_producto_id,
            cantidad_devuelta=body.cantidad_devuelta,
            producto_nuevo_id=body.producto_nuevo_id,
            cantidad_nueva=body.cantidad_nueva,
            sucursal_id=int(sid),
            metodo_pago_suplemento=body.metodo_pago_suplemento,
        )
        msg = "Cambio registrado correctamente."
        if r["diferencia_monto"] < -0.005:
            msg += f" Nota de crédito #{r['nota_credito_id']} por ${abs(r['diferencia_monto']):,.2f}."
        elif r["diferencia_monto"] > 0.005:
            msg += f" Se cobró diferencia ${r['diferencia_monto']:,.2f}."
        return schemas.CambioVentaResultado(
            success=True,
            message=msg,
            cambio_id=r["cambio_id"],
            diferencia_monto=r["diferencia_monto"],
            valor_devuelto=r["valor_devuelto"],
            valor_nuevo=r["valor_nuevo"],
            nota_credito_id=r.get("nota_credito_id"),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cambios/registrar-lote", response_model=schemas.CambioVentaResultadoLote)
def registrar_cambio_producto_lote(
    body: schemas.CambioVentaRegistroLote,
    current_user=Depends(get_current_user),
):
    """Varios reemplazos en la misma venta (p. ej. devolver dos productos distintos)."""
    sid = get_sucursal_id_for_user(current_user, body.sucursal_id)
    if sid is None:
        raise HTTPException(
            status_code=400,
            detail="Debe indicar sucursal (o tener una asignada).",
        )
    try:
        items_payload = [i.model_dump() for i in body.items]
        rs = cambios_service.registrar_cambios_lote(
            venta_id=body.venta_id,
            items=items_payload,
            sucursal_id=int(sid),
            metodo_pago_suplemento=body.metodo_pago_suplemento,
        )
        nc_por_id: dict[int, float] = defaultdict(float)
        for r in rs:
            d = float(r["diferencia_monto"])
            if d < -0.005 and r.get("nota_credito_id"):
                nc_por_id[int(r["nota_credito_id"])] += -d
        partes = [f"nota #{nid} ${monto:,.2f}" for nid, monto in sorted(nc_por_id.items())]
        for r in rs:
            d = float(r["diferencia_monto"])
            if d > 0.005:
                partes.append(f"suplemento ${d:,.2f}")
        msg = f"Se registraron {len(rs)} cambio(s)."
        if partes:
            msg += " " + "; ".join(partes) + "."
        out_items = [
            schemas.CambioVentaItemResultado(
                cambio_id=int(x["cambio_id"]),
                diferencia_monto=float(x["diferencia_monto"]),
                valor_devuelto=float(x["valor_devuelto"]),
                valor_nuevo=float(x["valor_nuevo"]),
                nota_credito_id=x.get("nota_credito_id"),
            )
            for x in rs
        ]
        return schemas.CambioVentaResultadoLote(success=True, message=msg, items=out_items)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cambios/listado")
def listado_cambios_venta(
    sucursal_id: int | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    current_user=Depends(get_current_user),
):
    sid = get_sucursal_id_for_user(current_user, sucursal_id)
    if sid is None:
        raise HTTPException(status_code=400, detail="Debe indicar sucursal (o tener una asignada).")
    try:
        return cambios_service.listar_cambios(int(sid), limit=limit)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))