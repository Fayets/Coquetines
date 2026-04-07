from fastapi import APIRouter, Depends, HTTPException, Response
from src import schemas
from src.services.reportes_services import ReportService
from src.controllers.auth_controller import get_current_user

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
