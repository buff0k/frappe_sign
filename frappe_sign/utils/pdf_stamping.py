# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

from io import BytesIO

import frappe
from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


def stamp_pdf_fields(base_pdf_bytes, stamp_items):
    """
    Stamp field values onto a PDF.

    Coordinates in stamp_items are expected as ratios from the top-left corner:
        x_ratio, y_ratio, width_ratio, height_ratio

    PDF coordinates are bottom-left, so y is converted per page.
    """
    reader = PdfReader(BytesIO(base_pdf_bytes))
    writer = PdfWriter()

    stamps_by_page = {}

    for item in stamp_items:
        page_number = int(item.get("page") or 0)

        if page_number < 1:
            continue

        stamps_by_page.setdefault(page_number, []).append(item)

    for page_index, page in enumerate(reader.pages, start=1):
        page_width = float(page.mediabox.width)
        page_height = float(page.mediabox.height)

        overlay_bytes = build_page_overlay(
            page_width=page_width,
            page_height=page_height,
            stamp_items=stamps_by_page.get(page_index, []),
        )

        if overlay_bytes:
            overlay_reader = PdfReader(BytesIO(overlay_bytes))
            page.merge_page(overlay_reader.pages[0])

        writer.add_page(page)

    output = BytesIO()
    writer.write(output)

    return output.getvalue()


def build_page_overlay(page_width, page_height, stamp_items):
    if not stamp_items:
        return None

    output = BytesIO()
    pdf_canvas = canvas.Canvas(output, pagesize=(page_width, page_height))

    for item in stamp_items:
        x = float(item.get("x_ratio") or 0) * page_width
        top_y = float(item.get("y_ratio") or 0) * page_height
        width = float(item.get("width_ratio") or 0) * page_width
        height = float(item.get("height_ratio") or 0) * page_height

        y = page_height - top_y - height

        field_type = item.get("field_type")
        value = item.get("value") or ""

        if field_type in ("Signature", "Initials"):
            image_bytes = item.get("image_bytes")

            if image_bytes:
                draw_image_contained(pdf_canvas, image_bytes, x, y, width, height)
            elif value:
                draw_text(pdf_canvas, value, x, y, width, height, font_size=14)

            continue

        if field_type == "Checkbox":
            if str(value) in ("1", "true", "True", "yes", "Yes"):
                draw_checkbox(pdf_canvas, x, y, width, height)

            continue

        draw_text(pdf_canvas, value, x, y, width, height)

    pdf_canvas.save()

    return output.getvalue()


def draw_image_contained(pdf_canvas, image_bytes, x, y, width, height):
    """
    Trim transparent whitespace from drawn PNGs and fit the remaining image
    proportionally inside the allocated signing field box.
    """
    cleaned_bytes, image_width, image_height = prepare_signature_image(image_bytes)

    if not image_width or not image_height:
        frappe.throw("Could not read signature image dimensions.")

    scale = min(width / image_width, height / image_height)

    draw_width = image_width * scale
    draw_height = image_height * scale

    draw_x = x + ((width - draw_width) / 2)
    draw_y = y + ((height - draw_height) / 2)

    try:
        image = ImageReader(BytesIO(cleaned_bytes))
    except Exception:
        frappe.throw("Could not read signature image.")

    pdf_canvas.drawImage(
        image,
        draw_x,
        draw_y,
        width=draw_width,
        height=draw_height,
        mask="auto",
    )


def prepare_signature_image(image_bytes):
    """
    Keep transparent PNG background, but crop excess transparent whitespace.
    """
    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGBA")
    except Exception:
        frappe.throw("Could not open signature image.")

    alpha = image.getchannel("A")
    bbox = alpha.getbbox()

    if bbox:
        image = image.crop(bbox)

    output = BytesIO()
    image.save(output, format="PNG")

    return output.getvalue(), image.width, image.height


def draw_text(pdf_canvas, value, x, y, width, height, font_size=10):
    if value is None:
        value = ""

    value = str(value)

    pdf_canvas.setFillColorRGB(0, 0, 0)
    pdf_canvas.setFont("Helvetica", font_size)

    text_y = y + max((height - font_size) / 2, 2)

    pdf_canvas.drawString(x + 3, text_y, value[:500])


def draw_checkbox(pdf_canvas, x, y, width, height):
    size = min(width, height, 14)
    box_x = x + 2
    box_y = y + max((height - size) / 2, 0)

    pdf_canvas.setStrokeColorRGB(0, 0, 0)
    pdf_canvas.setLineWidth(1)
    pdf_canvas.rect(box_x, box_y, size, size)

    pdf_canvas.setLineWidth(1.5)
    pdf_canvas.line(box_x + 3, box_y + size * 0.45, box_x + size * 0.42, box_y + 3)
    pdf_canvas.line(box_x + size * 0.42, box_y + 3, box_x + size - 3, box_y + size - 3)