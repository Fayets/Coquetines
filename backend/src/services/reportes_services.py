from io import BytesIO
from datetime import date, timedelta
from collections import defaultdict
from pony.orm import db_session
from fastapi import HTTPException
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.graphics.barcode import code128
from src import models, schemas


def _text_width(text: str, font_name: str, font_size: float) -> float:
    return pdfmetrics.stringWidth(text, font_name, font_size)


def _draw_right(c, text: str, x_right: float, y: float, font_name: str, font_size: float):
    c.setFont(font_name, font_size)
    c.drawString(x_right - _text_width(text, font_name, font_size), y, text)


def _truncate_to_width(text: str, font_name: str, font_size: float, max_width: float) -> str:
    """Recorta con … para que el texto no exceda max_width puntos (ReportLab)."""
    if not text:
        return ""
    if _text_width(text, font_name, font_size) <= max_width:
        return text
    ell = "…"
    t = text
    while t and _text_width(t + ell, font_name, font_size) > max_width:
        t = t[:-1]
    return (t + ell) if t else ell


def _wrap_lines(text: str, font_name: str, font_size: float, max_width: float) -> list[str]:
    """Parte texto en líneas que entran en max_width (puntos)."""
    if not text:
        return []
    words = str(text).split()
    lines: list[str] = []
    cur: list[str] = []
    for w in words:
        trial = " ".join(cur + [w])
        if _text_width(trial, font_name, font_size) <= max_width:
            cur.append(w)
        else:
            if cur:
                lines.append(" ".join(cur))
            cur = [w]
    if cur:
        lines.append(" ".join(cur))
    return lines


class ReportService:
    def __init__(self):
        pass

    def truncate_text(text, max_length):
        return (text[:max_length] + "…") if len(text) > max_length else text

    @db_session
    def generate_inventory_pdf(self) -> bytes:
        try:
            products = list(models.Product.select())
            if not products:
                raise HTTPException(status_code=404, detail="No hay productos en el inventario.")

            buf = BytesIO()
            c = canvas.Canvas(buf, pagesize=letter)
            width, height = letter

            margin_x = 40
            num_cols = 9
            column_width = (width - 2 * margin_x) / num_cols

            c.setFont("Helvetica-Bold", 16)
            c.drawCentredString(width / 2, height - 40, "Reporte de Inventario")

            y_position = height - 80
            headers = ["Código", "Nombre", "Categoría", "Color", "Talle", "Stock", "P. Venta", "P. Costo", "P. E/T"]
            c.setFont("Helvetica-Bold", 9)

            for i, header in enumerate(headers):
                c.drawString(margin_x + i * column_width, y_position, header)
            c.line(margin_x, y_position - 5, width - margin_x, y_position - 5)

            c.setFont("Helvetica", 9)
            y_position -= 20

            for product in products:
                if y_position < 50:
                    c.showPage()
                    y_position = height - 80
                    c.setFont("Helvetica-Bold", 9)
                    for i, header in enumerate(headers):
                        c.drawString(margin_x + i * column_width, y_position, header)
                    c.line(margin_x, y_position - 5, width - margin_x, y_position - 5)
                    c.setFont("Helvetica", 9)
                    y_position -= 20

                categoria_nombre = product.categoria.name if product.categoria else "Sin categoría"
                color_nombre = product.color.name if getattr(product, "color", None) else "NEUTRO"

                c.drawString(margin_x + 0 * column_width, y_position, ReportService.truncate_text(product.codigo, 10))
                c.drawString(margin_x + 1 * column_width, y_position, ReportService.truncate_text(product.nombre, 10))
                c.drawString(margin_x + 2 * column_width, y_position, ReportService.truncate_text(categoria_nombre, 12))
                c.drawString(margin_x + 3 * column_width, y_position, ReportService.truncate_text(color_nombre, 10))
                c.drawString(margin_x + 4 * column_width, y_position, ReportService.truncate_text(product.talle, 5))
                c.drawString(margin_x + 5 * column_width, y_position, str(product.stock))
                c.drawString(margin_x + 6 * column_width, y_position, f"${product.precio_venta}")
                c.drawString(margin_x + 7 * column_width, y_position, f"${product.precio_costo}")
                c.drawString(margin_x + 8 * column_width, y_position, f"${product.precio_et}")
                y_position -= 20

            c.save()
            return buf.getvalue()

        except HTTPException:
            raise
        except Exception as e:
            print(f"Error al generar el reporte en PDF: {e}")
            raise HTTPException(status_code=500, detail="Error al generar el reporte en PDF.")

    @db_session
    def generate_invoice_pdf(self, venta_id: int) -> bytes:
        try:
            venta = models.Venta.get(id=venta_id)
            if not venta:
                raise HTTPException(status_code=404, detail="Venta no encontrada")

            buf = BytesIO()
            c = canvas.Canvas(buf, pagesize=letter)
            width, height = letter
            margin = 50
            usable = width - 2 * margin
            # Columnas: código y nombre con hueco entre medias; números a la derecha. Anchos suman `usable`.
            col_gap = 12  # separación entre columna Código y Nombre
            w_qty = 56
            w_unit = 86
            w_sub = 92
            w_code = 148
            w_name = usable - w_code - col_gap - w_qty - w_unit - w_sub
            if w_name < 100:
                w_name = 100
                w_code = max(120, usable - col_gap - w_qty - w_unit - w_sub - w_name)
            x_code = margin
            x_name = x_code + w_code + col_gap
            x_qty = x_name + w_name
            x_unit = x_qty + w_qty
            x_sub = x_unit + w_unit
            x_right_qty = x_qty + w_qty
            x_right_unit = x_unit + w_unit
            x_right_sub = x_sub + w_sub

            def fmt_money(v) -> str:
                try:
                    return f"${float(v):,.2f}"
                except (TypeError, ValueError):
                    return "$0.00"

            # Encabezado centrado (marca + título)
            y_head = height - 40
            c.setFont("Helvetica-Bold", 18)
            t1 = "COQUETINES"
            c.drawString((width - _text_width(t1, "Helvetica-Bold", 18)) / 2, y_head, t1)
            c.setFont("Helvetica-Bold", 16)
            t2 = "RECIBO DE VENTA"
            c.drawString((width - _text_width(t2, "Helvetica-Bold", 16)) / 2, y_head - 22, t2)

            c.setFont("Helvetica", 10)
            y_meta = y_head - 48
            c.drawString(margin, y_meta, f"Fecha: {venta.fecha}")
            c.drawString(margin, y_meta - 14, f"Cliente: {venta.cliente}")
            pl = list(venta.pagos)
            if pl:
                pagos_txt = " | ".join(
                    f"{p.metodo_pago}: {fmt_money(p.monto)}"
                    for p in sorted(pl, key=lambda x: int(x.id))
                )
            else:
                pagos_txt = str(venta.metodo_pago or "")
            c.drawString(margin, y_meta - 28, f"Método de Pago: {pagos_txt}")
            line_y = y_meta - 38
            c.line(margin, line_y, width - margin, line_y)

            y_position = line_y - 22
            font_h = "Helvetica-Bold"
            fs = 10

            def draw_table_header(y: float) -> float:
                c.setFont(font_h, fs)
                c.drawString(x_code, y, "Código")
                c.drawString(x_name, y, "Nombre")
                _draw_right(c, "Cantidad", x_right_qty, y, font_h, fs)
                _draw_right(c, "P. Unitario", x_right_unit, y, font_h, fs)
                _draw_right(c, "Subtotal", x_right_sub, y, font_h, fs)
                c.line(margin, y - 5, width - margin, y - 5)
                return y - 20

            y_position = draw_table_header(y_position)
            c.setFont("Helvetica", fs)

            for vp in venta.productos:
                if y_position < 72:
                    c.showPage()
                    y_position = height - 72
                    y_position = draw_table_header(y_position)
                    c.setFont("Helvetica", fs)

                codigo = _truncate_to_width(str(vp.producto.codigo or ""), "Helvetica", fs, w_code)
                nombre = _truncate_to_width(str(vp.producto.nombre or ""), "Helvetica", fs, w_name)
                c.drawString(x_code, y_position, codigo)
                c.drawString(x_name, y_position, nombre)
                qty_s = str(int(vp.cantidad) if vp.cantidad == int(vp.cantidad) else vp.cantidad)
                _draw_right(c, qty_s, x_right_qty, y_position, "Helvetica", fs)
                unit = vp.subtotal / vp.cantidad if vp.cantidad else (vp.producto.precio_venta or 0)
                _draw_right(c, fmt_money(unit), x_right_unit, y_position, "Helvetica", fs)
                _draw_right(c, fmt_money(vp.subtotal), x_right_sub, y_position, "Helvetica", fs)
                y_position -= 18

            # Sin línea separadora bajo la tabla de productos; solo la que va debajo del total
            total_str = fmt_money(venta.total)
            total_label = f"Total: {total_str}"
            total_y = y_position - 8
            c.setFont("Helvetica-Bold", 12)
            _draw_right(c, total_label, width - margin, total_y, "Helvetica-Bold", 12)

            foot_line_y = total_y - 16
            c.setLineWidth(1)
            c.line(margin, foot_line_y, width - margin, foot_line_y)

            c.setFont("Helvetica-Oblique", 8)
            c.drawString(margin, foot_line_y - 16, "Este recibo es válido solo como comprobante de pago. No tiene validez fiscal.")

            c.save()
            return buf.getvalue()

        except HTTPException:
            raise
        except Exception as e:
            print(f"Error al generar el recibo en PDF: {e}")
            raise HTTPException(status_code=500, detail="Error al generar el recibo en PDF.")

    @db_session
    def generate_nota_credito_pdf(self, nota_id: int) -> bytes:
        try:
            nc = models.NotaCredito.get(id=nota_id)
            if not nc:
                raise HTTPException(status_code=404, detail="Nota de crédito no encontrada")

            buf = BytesIO()
            c = canvas.Canvas(buf, pagesize=letter)
            width, height = letter
            margin = 50

            def _u(s: object) -> str:
                return str(s).upper()

            def fmt_money(v) -> str:
                try:
                    return f"${float(v):,.2f}"
                except (TypeError, ValueError):
                    return "$0.00"

            y = height - 48
            text_w = width - 2 * margin
            floor_y = margin + 52

            def ensure_space(need_pts: int):
                nonlocal y
                if y < floor_y + need_pts:
                    c.showPage()
                    y = height - 48

            c.setFont("Helvetica-Bold", 18)
            t1 = _u("COQUETINES")
            c.drawString((width - _text_width(t1, "Helvetica-Bold", 18)) / 2, y, t1)
            c.setFont("Helvetica-Bold", 15)
            t2 = _u("NOTA DE CRÉDITO")
            y -= 26
            c.drawString((width - _text_width(t2, "Helvetica-Bold", 15)) / 2, y, t2)

            c.setFont("Helvetica", 10)
            y -= 36
            c.drawString(margin, y, f"Nº nota: {nc.id}")
            y -= 14
            c.drawString(margin, y, f"Fecha: {nc.fecha}")
            y -= 14
            c.drawString(margin, y, f"Cliente: {nc.cliente_nombre}")
            y -= 14
            if nc.motivo:
                for ln in _wrap_lines(f"Motivo: {nc.motivo}", "Helvetica", 10, text_w):
                    ensure_space(16)
                    c.drawString(margin, y, ln)
                    y -= 14

            cambio = nc.cambio
            if cambio:
                venta = cambio.venta_original
                uid = getattr(cambio, "grupo_lote_uid", None)
                if uid:
                    chops = sorted(
                        [ch for ch in venta.cambios if getattr(ch, "grupo_lote_uid", None) == uid],
                        key=lambda x: int(x.id),
                    )
                    if not chops:
                        chops = [cambio]
                else:
                    chops = [cambio]

                y -= 12
                ensure_space(90)
                c.setFont("Helvetica-Bold", 10)
                c.drawString(margin, y, "Venta original")
                y -= 15
                c.setFont("Helvetica", 10)
                vps = sorted(list(venta.productos), key=lambda vp: int(vp.id))
                sale_bits = []
                for vp in vps:
                    pr = vp.producto
                    nom = pr.nombre if pr else "—"
                    sale_bits.append(f"{nom} ×{int(vp.cantidad)} ({fmt_money(vp.subtotal)})")
                sale_body = f"N.º {venta.id} — Total {fmt_money(venta.total)} — " + " — ".join(sale_bits)
                for ln in _wrap_lines(sale_body, "Helvetica", 10, text_w):
                    ensure_space(14)
                    c.drawString(margin, y, ln)
                    y -= 13

                y -= 6
                ensure_space(70)
                c.setFont("Helvetica-Bold", 10)
                c.drawString(margin, y, "Cambio")
                y -= 15
                c.setFont("Helvetica", 10)
                for ch in chops:
                    pd = ch.producto_devuelto
                    pn = ch.producto_nuevo
                    one = (
                        f"Devolvió {pd.nombre} ×{int(ch.cantidad_devuelta)} ({fmt_money(ch.valor_devuelto)}) — "
                        f"se llevó {pn.nombre} ×{int(ch.cantidad_nueva)} ({fmt_money(ch.valor_nuevo)})"
                    )
                    for ln in _wrap_lines(one, "Helvetica", 10, text_w):
                        ensure_space(14)
                        c.drawString(margin, y, ln)
                        y -= 13

                y -= 8

            ensure_space(48)
            y -= 4
            c.setFont("Helvetica-Bold", 13)
            c.drawString(margin, y, f"Crédito a favor: {fmt_money(nc.monto)}")
            y -= 28
            c.setLineWidth(1)
            c.line(margin, y, width - margin, y)
            y -= 18
            c.setFont("Helvetica-Oblique", 8)
            c.drawString(
                margin,
                y,
                "Documento interno. No reemplaza factura fiscal.",
            )

            c.save()
            return buf.getvalue()
        except HTTPException:
            raise
        except Exception as e:
            print(f"Error al generar nota de crédito PDF: {e}")
            raise HTTPException(status_code=500, detail="Error al generar la nota de crédito en PDF.")

    def generate_cierre_caja_pdf(self, resumen: dict) -> bytes:
        try:
            def fmt_money(v) -> str:
                try:
                    return f"${float(v):,.2f}"
                except (TypeError, ValueError):
                    return "$0,00"

            def turno_label(t: str) -> str:
                u = str(t or "").strip().upper()
                return "Tarde" if u == "TARDE" else "Mañana"

            def fmt_hora_corta(s) -> str:
                if not s:
                    return "—"
                t = str(s).replace("T", " ")
                return t[:19] if len(t) > 19 else t

            fecha = resumen.get("fecha", "")
            turno_raw = str(resumen.get("turno") or "MAÑANA")
            sucursal_nombre = str(resumen.get("sucursal_nombre") or "Sucursal")
            movimientos = resumen.get("movimientos") or []

            resumen_metodos: dict[str, float] = {}
            for mov in movimientos:
                if mov.get("medios_pago"):
                    for mp in mov["medios_pago"]:
                        key = str(mp.get("metodo_pago") or "Sin nombre").strip() or "Sin nombre"
                        resumen_metodos[key] = resumen_metodos.get(key, 0.0) + float(mp.get("monto") or 0)
                elif mov.get("origen") == "VENTA":
                    key = "Sin desglose"
                    resumen_metodos[key] = resumen_metodos.get(key, 0.0) + float(mov.get("monto") or 0)

            buf = BytesIO()
            c = canvas.Canvas(buf, pagesize=letter)
            W, H = letter
            mx = 48
            body_w = W - 2 * mx
            pad = 6
            lh = 10
            y = H - 42

            def page_break_if(need_bottom: float) -> None:
                nonlocal y
                if y < need_bottom + 56:
                    c.showPage()
                    y = H - 52

            # Cabecera
            band_h = 36
            band_y = y - band_h + 8
            c.setFillColorRGB(0.11, 0.42, 0.40)
            c.roundRect(mx, band_y, body_w, band_h, 4, stroke=0, fill=1)
            c.setFillColorRGB(1, 1, 1)
            c.setFont("Helvetica-Bold", 16)
            c.drawCentredString(W / 2, band_y + 23, "Coquetines")
            c.setFont("Helvetica", 10)
            c.drawCentredString(W / 2, band_y + 8, "Cierre de caja")
            c.setFillColorRGB(0.18, 0.2, 0.24)
            y = band_y - 18

            c.setFont("Helvetica", 10)
            c.drawString(mx, y, f"Sucursal: {sucursal_nombre}")
            y -= 13
            c.drawString(mx, y, f"Fecha: {fecha}")
            y -= 16

            chip_w = 128
            chip_h = 22
            chip_y = y - chip_h + 5
            c.setFillColorRGB(0.94, 0.95, 0.97)
            c.setStrokeColorRGB(0.78, 0.8, 0.85)
            c.setLineWidth(0.6)
            c.roundRect(mx, chip_y, chip_w, chip_h, 4, stroke=1, fill=1)
            c.setFillColorRGB(0.2, 0.22, 0.26)
            c.setFont("Helvetica-Bold", 10)
            c.drawString(mx + 10, chip_y + 7, f"Turno: {turno_label(turno_raw)}")
            y = chip_y - 20

            c.setFont("Helvetica-Bold", 10)
            c.drawString(mx, y, f"Saldo inicial: {fmt_money(resumen.get('saldo_inicial', 0))}")
            y -= 26

            # Grilla: x0..x4 = mx .. mx+body_w. Más espacio a detalle y a Total; medios más angosto.
            w_tot = 96
            w_hora = 74
            w_med = 100
            w_det = body_w - w_hora - w_med - w_tot
            x0 = mx
            x1 = x0 + w_hora
            x2 = x1 + w_det
            x3 = x2 + w_med
            x4 = x3 + w_tot
            line_w_grid = 0.4
            stroke_hdr = (0.72, 0.75, 0.8)
            stroke_soft = (0.86, 0.88, 0.91)

            def draw_section_title(title: str) -> None:
                nonlocal y
                page_break_if(90)
                c.setFillColorRGB(0.93, 0.94, 0.96)
                c.rect(mx, y - 2, body_w, 16, stroke=0, fill=1)
                c.setFillColorRGB(0.16, 0.18, 0.22)
                c.setFont("Helvetica-Bold", 11)
                c.drawString(mx + pad, y + 2, title)
                y -= 22

            draw_section_title("Ventas del turno")

            hdr_h = 18
            page_break_if(100)
            hdr_bottom = y - hdr_h
            hdr_top = hdr_bottom + hdr_h
            c.setFillColorRGB(0.86, 0.89, 0.92)
            c.setStrokeColorRGB(*stroke_hdr)
            c.setLineWidth(line_w_grid)
            c.rect(mx, hdr_bottom, body_w, hdr_h, stroke=1, fill=1)
            hdr_bl = hdr_bottom + 5.5
            c.setFillColorRGB(0.28, 0.3, 0.35)
            c.setFont("Helvetica-Bold", 8)
            c.drawString(x0 + pad, hdr_bl, "Hora")
            c.drawString(x1 + pad, hdr_bl, "Cliente / detalle")
            c.drawString(x2 + pad, hdr_bl, "Medios de pago")
            _draw_right(c, "Total", x4 - pad, hdr_bl, "Helvetica-Bold", 8)
            c.setStrokeColorRGB(*stroke_hdr)
            c.setLineWidth(line_w_grid)
            for xv in (x1, x2, x3):
                c.line(xv, hdr_bottom, xv, hdr_top)

            pad_v = 5
            inter_row = 6
            y = hdr_bottom - inter_row

            ventas = [m for m in movimientos if m.get("origen") == "VENTA"]
            row_idx = 0
            for m in ventas:
                page_break_if(110)
                hora = fmt_hora_corta(m.get("fecha_hora"))
                desc = (str(m.get("descripcion") or "—")).strip()
                medios_txt = "—"
                if m.get("medios_pago"):
                    parts = [
                        f"{p.get('metodo_pago', '')}: {fmt_money(p.get('monto', 0))}"
                        for p in m["medios_pago"]
                    ]
                    medios_txt = " · ".join(parts)
                total_v = float(m.get("monto") or 0)

                ls0 = _wrap_lines(hora, "Helvetica", 8, max(20.0, w_hora - 2 * pad)) or ["—"]
                ls1 = _wrap_lines(desc, "Helvetica", 8, max(20.0, w_det - 2 * pad)) or ["—"]
                ls2 = _wrap_lines(medios_txt, "Helvetica", 8, max(20.0, w_med - 2 * pad)) or ["—"]
                nlines = max(len(ls0), len(ls1), len(ls2), 1)
                row_top_bl = y
                y_cell_bottom = row_top_bl - (nlines - 1) * lh - lh - pad_v
                y_cell_top = row_top_bl + 8
                rh = y_cell_top - y_cell_bottom

                fill_rgb = (0.99, 0.995, 1.0) if row_idx % 2 == 0 else (0.97, 0.98, 0.99)
                c.setFillColorRGB(*fill_rgb)
                c.setStrokeColorRGB(*stroke_soft)
                c.setLineWidth(line_w_grid)
                c.rect(mx, y_cell_bottom, body_w, rh, stroke=1, fill=1)

                for i in range(nlines):
                    yy = row_top_bl - i * lh
                    c.setFillColorRGB(0.2, 0.2, 0.23)
                    c.setFont("Helvetica", 8)
                    if i < len(ls0):
                        c.drawString(x0 + pad, yy, ls0[i])
                    if i < len(ls1):
                        c.drawString(x1 + pad, yy, ls1[i])
                    if i < len(ls2):
                        c.drawString(x2 + pad, yy, ls2[i])
                    if i == 0:
                        c.setFont("Helvetica-Bold", 8.5)
                        _draw_right(c, fmt_money(total_v), x4 - pad, yy, "Helvetica-Bold", 8.5)

                c.setStrokeColorRGB(*stroke_soft)
                c.setLineWidth(line_w_grid)
                for xv in (x1, x2, x3):
                    c.line(xv, y_cell_bottom, xv, y_cell_top)

                y = y_cell_bottom - inter_row
                row_idx += 1

            if not ventas:
                page_break_if(80)
                c.setFont("Helvetica-Oblique", 9)
                c.setFillColorRGB(0.45, 0.47, 0.5)
                c.drawString(mx + pad, y, "No hay ventas registradas en este turno.")
                y -= 20

            y -= 10
            draw_section_title("Resumen por método de pago (ventas)")

            w_method_wrap = max(48.0, x3 - x0 - 2 * pad)
            hdr2_h = 16
            page_break_if(100)
            h2_bottom = y - hdr2_h
            h2_top = h2_bottom + hdr2_h
            c.setFillColorRGB(0.86, 0.89, 0.92)
            c.setStrokeColorRGB(*stroke_hdr)
            c.setLineWidth(line_w_grid)
            c.rect(mx, h2_bottom, body_w, hdr2_h, stroke=1, fill=1)
            h2_bl = h2_bottom + 5
            c.setFillColorRGB(0.28, 0.3, 0.35)
            c.setFont("Helvetica-Bold", 8)
            c.drawString(x0 + pad, h2_bl, "Método")
            _draw_right(c, "Total", x4 - pad, h2_bl, "Helvetica-Bold", 8)
            c.setStrokeColorRGB(*stroke_hdr)
            c.setLineWidth(line_w_grid)
            c.line(x3, h2_bottom, x3, h2_top)

            y = h2_bottom - inter_row

            for met, tot in sorted(resumen_metodos.items()):
                page_break_if(72)
                met_lines = _wrap_lines(str(met), "Helvetica", 9.5, w_method_wrap) or ["—"]
                fila_y = y
                c.setFillColorRGB(0.2, 0.2, 0.23)
                for ln in met_lines:
                    c.setFont("Helvetica", 9.5)
                    c.drawString(x0 + pad, y, ln)
                    y -= lh
                c.setFont("Helvetica-Bold", 9.5)
                _draw_right(c, fmt_money(tot), x4 - pad, fila_y, "Helvetica-Bold", 9.5)
                y -= 4

            y -= 8
            page_break_if(100)
            c.setStrokeColorRGB(0.55, 0.58, 0.62)
            c.setLineWidth(0.5)
            c.line(mx, y, x4, y)
            y -= 14
            c.setFont("Helvetica-Bold", 10)
            c.setFillColorRGB(0.12, 0.14, 0.18)
            c.drawString(mx, y, "Total general ingresos (caja)")
            _draw_right(c, fmt_money(resumen.get("total_ingresos", 0)), x4 - pad, y, "Helvetica-Bold", 10)
            y -= 15
            c.setFont("Helvetica", 10)
            c.setFillColorRGB(0.12, 0.14, 0.18)
            c.drawString(mx, y, "Total egresos")
            _draw_right(c, fmt_money(resumen.get("total_egresos", 0)), x4 - pad, y, "Helvetica", 10)
            y -= 14
            c.setFont("Helvetica-Bold", 11)
            c.setFillColorRGB(0.08, 0.38, 0.35)
            c.drawString(mx, y, "Saldo final")
            _draw_right(c, fmt_money(resumen.get("saldo_final", 0)), x4 - pad, y, "Helvetica-Bold", 11)
            y -= 28
            c.setFont("Helvetica-Oblique", 8)
            c.setFillColorRGB(0.45, 0.47, 0.5)
            c.drawString(mx, y, "Documento interno. No reemplaza factura fiscal.")

            c.save()
            return buf.getvalue()

        except HTTPException:
            raise
        except Exception as e:
            print(f"Error al generar PDF cierre de caja: {e}")
            raise HTTPException(status_code=500, detail="Error al generar el PDF de cierre de caja.")

    @db_session
    def generate_barcode_pdf(self, data: schemas.CodigoBarraRequest) -> bytes:
        try:
            if not data.productos:
                raise HTTPException(status_code=400, detail="Debe seleccionar al menos un producto.")

            labels = []
            for item in data.productos:
                producto = models.Product.get(id=item.producto_id)
                if not producto:
                    raise HTTPException(status_code=404, detail=f"Producto con ID {item.producto_id} no encontrado")
                for _ in range(item.cantidad):
                    labels.append({
                        "codigo": producto.codigo,
                        "nombre": producto.nombre,
                        "talle": (producto.talle or "").strip(),
                    })

            if not labels:
                raise HTTPException(status_code=400, detail="No hay etiquetas para generar.")

            buf = BytesIO()
            c = canvas.Canvas(buf, pagesize=A4)
            page_w, page_h = A4

            margin_x = 12 * mm
            margin_top = 10 * mm
            margin_bottom = 10 * mm
            h_gap = 2.5 * mm
            v_gap = 2.5 * mm

            usable_w = page_w - 2 * margin_x
            usable_h = page_h - margin_top - margin_bottom

            # Ancho fijo de etiqueta 4 cm (antes ~5,5 cm al usar 3 columnas en A4)
            label_w = 40 * mm
            cols = max(1, int((usable_w + h_gap) / (label_w + h_gap)))
            total_row_w = cols * label_w + (cols - 1) * h_gap
            start_x = margin_x + (usable_w - total_row_w) / 2

            # Filas: alto de celda según espacio vertical disponible
            target_label_h = 28 * mm
            rows = max(1, int((usable_h + v_gap) / (target_label_h + v_gap)))
            label_h = (usable_h - (rows - 1) * v_gap) / rows

            idx = 0
            inner_pad = 2 * mm
            max_bc_w = label_w - 2 * inner_pad
            # Altura de barras ~ proporcional al nuevo tamaño (antes 14 mm; ~4/5.5 del largo anterior)
            bar_height = min(11 * mm, max(6 * mm, label_h * 0.36))

            while idx < len(labels):
                for row in range(rows):
                    for col in range(cols):
                        if idx >= len(labels):
                            break
                        lbl = labels[idx]
                        idx += 1

                        x = start_x + col * (label_w + h_gap)
                        y = page_h - margin_top - (row + 1) * label_h - row * v_gap

                        c.saveState()
                        c.setStrokeColorRGB(0.85, 0.85, 0.85)
                        c.setLineWidth(0.4)
                        c.roundRect(x, y, label_w, label_h, 2 * mm)

                        nombre_display = _truncate_to_width(
                            str(lbl["nombre"] or ""),
                            "Helvetica-Bold",
                            6.5,
                            label_w - 2 * inner_pad,
                        )
                        c.setFont("Helvetica-Bold", 6.5)
                        c.drawCentredString(x + label_w / 2, y + label_h - 9, nombre_display)

                        line_y = y + label_h - 17
                        if lbl["talle"]:
                            c.setFont("Helvetica", 5.5)
                            c.drawCentredString(x + label_w / 2, line_y, f"Talle: {lbl['talle']}")

                        barcode_value = str(lbl["codigo"] or "")
                        # Números abajo, barras arriba; separación clara entre base del Code128 y el texto
                        text_baseline = y + 2 * mm
                        gap_bar_to_text = 2.2 * mm
                        text_cap_pt = 5.8  # altura aprox. de dígitos Helvetica 6 sobre la línea base
                        bc_y = text_baseline + text_cap_pt + gap_bar_to_text
                        max_bar_top = y + label_h - 11
                        bar_h = bar_height
                        if bc_y + bar_h > max_bar_top:
                            bar_h = max(6 * mm, max_bar_top - bc_y)

                        try:
                            bc = code128.Code128(
                                barcode_value,
                                barWidth=0.7,
                                barHeight=bar_h,
                                humanReadable=False,
                            )
                            scale_x = 1.0
                            if bc.width > 0 and bc.width > max_bc_w:
                                scale_x = max_bc_w / bc.width
                            vis_w = bc.width * scale_x
                            bc_x = x + (label_w - vis_w) / 2
                            c.saveState()
                            c.translate(bc_x, bc_y)
                            c.scale(scale_x, 1)
                            bc.drawOn(c, 0, 0)
                            c.restoreState()
                        except Exception:
                            c.setFont("Helvetica", 7)
                            c.drawCentredString(x + label_w / 2, y + label_h / 2 - 5, barcode_value)

                        c.setFont("Helvetica", 6)
                        c.drawCentredString(x + label_w / 2, text_baseline, barcode_value)

                        c.restoreState()

                if idx < len(labels):
                    c.showPage()

            c.save()
            return buf.getvalue()

        except HTTPException:
            raise
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Error al generar PDF de códigos de barra: {str(e)}")

    @db_session
    def ranking_productos_vendidos(self, periodo: str) -> list[dict]:
        """
        Suma cantidades de VentaProducto filtradas por fecha de la venta (Venta.fecha).
        periodo: todo | dia | semana | mes
        """
        try:
            today = date.today()
            p = (periodo or "todo").lower().strip()
            if p == "dia":

                def fecha_ok(d):
                    return d == today

            elif p == "semana":
                start = today - timedelta(days=6)

                def fecha_ok(d):
                    return start <= d <= today

            elif p == "mes":

                def fecha_ok(d):
                    return d.year == today.year and d.month == today.month

            elif p == "todo":
                fecha_ok = None
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Período inválido. Use: todo, dia, semana, mes.",
                )

            totals = defaultdict(int)
            for vp in models.VentaProducto.select():
                if fecha_ok is not None and not fecha_ok(vp.venta.fecha):
                    continue
                totals[int(vp.producto.id)] += int(vp.cantidad)

            sorted_ids = sorted(totals.keys(), key=lambda k: totals[k], reverse=True)
            result = []
            for pos, pid in enumerate(sorted_ids, start=1):
                prod = models.Product.get(id=pid)
                if not prod:
                    continue
                suc = prod.sucursal
                result.append(
                    {
                        "posicion": pos,
                        "producto_id": pid,
                        "codigo": str(prod.codigo or ""),
                        "nombre": str(prod.nombre or ""),
                        "marca": str(prod.marca or "Generico"),
                        "sucursal_id": int(suc.id) if suc else None,
                        "sucursal_nombre": str(suc.nombre) if suc else None,
                        "cantidad_vendida": int(totals[pid]),
                    }
                )
            return result
        except HTTPException:
            raise
        except Exception as e:
            import traceback

            traceback.print_exc()
            raise HTTPException(
                status_code=500,
                detail=f"Error al armar el ranking de productos: {str(e)}",
            )
