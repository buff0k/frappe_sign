# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import base64
import re

import frappe
from frappe.utils.file_manager import save_file


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def get_signature_fieldname(kind):
    if kind == "signature":
        return "signature_image"

    if kind == "initials":
        return "initials_image"

    frappe.throw("Invalid signature image type.")


def data_url_to_png_bytes(data_url):
    if not data_url:
        frappe.throw("No image data received.")

    match = re.match(r"^data:image/png;base64,(.+)$", data_url)

    if not match:
        frappe.throw("Only PNG signature images are supported.")

    try:
        content = base64.b64decode(match.group(1), validate=True)
    except Exception:
        frappe.throw("Invalid PNG image data.")

    if not content.startswith(PNG_SIGNATURE):
        frappe.throw("Invalid PNG file.")

    return content


def attach_signature_png(reference_doctype, reference_name, kind, data_url):
    fieldname = get_signature_fieldname(kind)
    content = data_url_to_png_bytes(data_url)

    filename = f"{frappe.scrub(reference_name)}-{kind}.png"

    file_doc = save_file(
        fname=filename,
        content=content,
        dt=reference_doctype,
        dn=reference_name,
        is_private=1,
    )

    return {
        "fieldname": fieldname,
        "file_url": file_doc.file_url,
    }