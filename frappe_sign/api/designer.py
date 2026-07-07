# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import json

import frappe


@frappe.whitelist()
def get_designer_context(request_name):
    request = frappe.get_doc("Frappe Sign Request", request_name)

    if not frappe.has_permission("Frappe Sign Request", "read", doc=request):
        frappe.throw("You do not have permission to access this signing request.")

    return {
        "request": {
            "name": request.name,
            "request_title": request.request_title,
            "source_doctype": request.source_doctype,
            "source_name": request.source_name,
            "source_title": request.source_title,
            "print_format": request.print_format,
            "status": request.status,
            "source_pdf": request.source_pdf,
        },
        "signers": [
            {
                "name": signer.name,
                "signer_type": signer.signer_type,
                "user": signer.user,
                "full_name": signer.full_name,
                "email": signer.email,
                "role": signer.role,
                "signing_order": signer.signing_order,
                "status": signer.status,
            }
            for signer in request.signers
        ],
        "fields": [
            {
                "name": field.name,
                "signer": field.signer,
                "signer_label": field.signer_label,
                "field_type": field.field_type,
                "page": field.page,
                "x_ratio": field.x_ratio,
                "y_ratio": field.y_ratio,
                "width_ratio": field.width_ratio,
                "height_ratio": field.height_ratio,
                "required": field.required,
                "read_only": field.read_only,
                "default_value": field.default_value,
            }
            for field in request.fields
        ],
    }


@frappe.whitelist()
def save_fields(request_name, fields_json):
    request = frappe.get_doc("Frappe Sign Request", request_name)

    if not frappe.has_permission("Frappe Sign Request", "write", doc=request):
        frappe.throw("You do not have permission to update this signing request.")

    if request.status not in ("Draft", "Prepared"):
        frappe.throw("Fields can only be edited while the request is Draft or Prepared.")

    fields = json.loads(fields_json or "[]")

    request.set("fields", [])

    valid_signer_rows = {signer.name for signer in request.signers}

    for field in fields:
        signer = field.get("signer")

        if signer and signer not in valid_signer_rows:
            frappe.throw("Invalid signer selected for a signing field.")

        request.append(
            "fields",
            {
                "signer": signer,
                "signer_label": field.get("signer_label"),
                "field_type": field.get("field_type"),
                "page": field.get("page"),
                "x_ratio": field.get("x_ratio"),
                "y_ratio": field.get("y_ratio"),
                "width_ratio": field.get("width_ratio"),
                "height_ratio": field.get("height_ratio"),
                "required": field.get("required"),
                "read_only": field.get("read_only"),
                "default_value": field.get("default_value"),
            },
        )

    request.save()

    return {
        "status": "saved",
        "field_count": len(request.fields),
    }