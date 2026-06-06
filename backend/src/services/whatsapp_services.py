"""Envío de documentos por WhatsApp vía API HTTP configurable (multipart)."""

from __future__ import annotations

from typing import Optional

from decouple import config


class WhatsappServices:
    def enviar_pdf(self, pdf_bytes: bytes, nombre_archivo: str, numero: Optional[str] = None) -> dict:
        """
        POST multipart a WHATSAPP_API_URL con archivo y datos de destino.
        Si la API no está configurada, devuelve dict sin lanzar excepción.
        """
        base = (config("WHATSAPP_API_URL", default="") or "").strip()
        if not base:
            return {
                "success": False,
                "message": "WhatsApp no configurado. Agregá WHATSAPP_API_URL al .env.",
            }

        token = (config("WHATSAPP_TOKEN", default="") or "").strip()
        dest = (numero or config("WHATSAPP_NUMERO_DESTINO", default="") or "").strip()
        if not dest:
            return {
                "success": False,
                "message": "Indicá número de destino o configurá WHATSAPP_NUMERO_DESTINO en el .env.",
            }

        try:
            import httpx

            headers = {}
            if token:
                headers["Authorization"] = f"Bearer {token}"

            url = base.rstrip("/")
            files = {"file": (nombre_archivo, pdf_bytes, "application/pdf")}
            data = {"to": dest, "caption": nombre_archivo}

            with httpx.Client(timeout=60.0) as client:
                r = client.post(url, files=files, data=data, headers=headers)

            if 200 <= r.status_code < 300:
                return {"success": True, "message": "PDF enviado correctamente."}

            body = (r.text or "")[:300]
            return {
                "success": False,
                "message": f"La API de WhatsApp respondió {r.status_code}. {body}".strip(),
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"No se pudo enviar el PDF: {type(e).__name__}: {str(e)[:200]}",
            }
