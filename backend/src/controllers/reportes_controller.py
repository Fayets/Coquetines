from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from src import schemas
from src.services.reportes_services import ReportService
from src.controllers.auth_controller import get_current_user, get_owner_user

router = APIRouter()
report_service = ReportService()


@router.get("/generate_inventory_pdf")
def generate_inventory_pdf(current_user=Depends(get_current_user)):
    try:
        pdf_bytes = report_service.generate_inventory_pdf()
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=inventario_coquetines.pdf"},
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar el reporte: {str(e)}")


@router.get("/generate_invoice/{venta_id}")
def generate_invoice(venta_id: int, current_user=Depends(get_current_user)):
    try:
        pdf_bytes = report_service.generate_invoice_pdf(venta_id)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=recibo_{venta_id}.pdf"},
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar el recibo: {str(e)}")


@router.post("/generate_barcodes")
def generate_barcodes(data: schemas.CodigoBarraRequest, current_user=Depends(get_current_user)):
    try:
        pdf_bytes = report_service.generate_barcode_pdf(data)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=codigos_barra.pdf"},
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar códigos de barra: {str(e)}")


@router.get("/ranking-productos-vendidos", response_model=List[schemas.RankingProductoVendidoItem])
def ranking_productos_vendidos(
    periodo: Literal["todo", "dia", "semana", "mes"] = Query(
        "todo",
        description="todo=histórico; dia=ventas con fecha de hoy; semana=últimos 7 días; mes=mes calendario actual",
    ),
    current_user=Depends(get_owner_user),
):
    """Solo OWNER: ranking por cantidad vendida según período (Venta + VentaProducto)."""
    try:
        rows = report_service.ranking_productos_vendidos(periodo)
        return [schemas.RankingProductoVendidoItem(**r) for r in rows]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener el ranking: {type(e).__name__}")
