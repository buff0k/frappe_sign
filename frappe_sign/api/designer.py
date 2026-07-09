# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import base64
import json

import frappe

from frappe_sign.utils.audit import append_event, sha256_bytes
from frappe_sign.utils.files import get_file_bytes
from frappe_sign.utils.pdf import render_source_pdf


@frappe.whitelist()
def ensure_designer_pdf(request_name):
    request = frappe.get_doc("Frappe Sign Request", request_name)

    if not frappe.has_permission("Frappe Sign Request", "write", doc=request):
        frappe.throw("You do not have permission to prepare this signing request.")

    if request.docstatus != 0:
        frappe.throw("Designer can only be used before the signing request is submitted.")

    if request.status not in ("Draft", "Prepared"):
        frappe.throw("Designer can only be used while the request is Draft or Prepared.")

    if request.source_pdf:
        return {
            "status": "ready",
            "source_pdf": request.source_pdf,
        }

    if request.source_type == "Frappe Document":
        return generate_designer_source_pdf(request)

    if request.source_type == "Uploaded PDF":
        return {
            "status": "upload_required",
            "message": "Please upload a PDF before designing the signing request.",
        }

    frappe.throw("Unsupported Source Type.")


def generate_designer_source_pdf(request):
    if not request.source_doctype:
        frappe.throw("Please select a Source DocType before opening the Designer.")

    if not request.source_name:
        frappe.throw("Please select a Source Name before opening the Designer.")

    if not request.print_format:
        frappe.throw("Please select a Print Format before opening the Designer.")

    source_doc = frappe.get_doc(request.source_doctype, request.source_name)

    if not frappe.has_permission(request.source_doctype, "read", doc=source_doc):
        frappe.throw("You do not have permission to read the source document.")

    pdf_bytes = render_source_pdf(
        request.source_doctype,
        request.source_name,
        request.print_format,
    )

    pdf_hash = sha256_bytes(pdf_bytes)

    file_doc = frappe.get_doc(
        {
            "doctype": "File",
            "file_name": f"{frappe.scrub(request.source_doctype)}-{request.source_name}-source.pdf",
            "attached_to_doctype": "Frappe Sign Request",
            "attached_to_name": request.name,
            "is_private": 1,
            "content": pdf_bytes,
        }
    )
    file_doc.save(ignore_permissions=True)

    request.source_title = source_doc.get_title()
    request.source_pdf = file_doc.file_url
    request.source_pdf_hash = pdf_hash
    request.tamper_status = "Not Checked"

    if request.status == "Draft":
        request.status = "Prepared"

    request.save(ignore_permissions=True)

    append_event(
        request.name,
        "PDF Generated",
        details={
            "source_type": "Frappe Document",
            "source_doctype": request.source_doctype,
            "source_name": request.source_name,
            "print_format": request.print_format,
            "source_pdf": request.source_pdf,
            "triggered_from": "Designer",
        },
        document_hash=pdf_hash,
    )

    create_designer_file_hash(
        request.name,
        "Source PDF",
        request.source_pdf,
        pdf_hash,
        "Generated",
    )

    return {
        "status": "ready",
        "source_pdf": request.source_pdf,
        "source_pdf_hash": request.source_pdf_hash,
        "source_title": request.source_title,
    }


@frappe.whitelist()
def upload_designer_source_pdf_from_file_url(request_name, file_url):
    request = frappe.get_doc("Frappe Sign Request", request_name)

    if not frappe.has_permission("Frappe Sign Request", "write", doc=request):
        frappe.throw("You do not have permission to upload a source PDF for this request.")

    if request.docstatus != 0:
        frappe.throw("Source PDF can only be uploaded before the request is submitted.")

    if request.status not in ("Draft", "Prepared"):
        frappe.throw("Source PDF can only be uploaded while the request is Draft or Prepared.")

    if request.source_type != "Uploaded PDF":
        frappe.throw("Manual PDF upload is only available for Uploaded PDF source type.")

    if not file_url:
        frappe.throw("Missing uploaded PDF.")

    file_doc = frappe.get_doc("File", {"file_url": file_url})

    if not file_doc.file_url.lower().endswith(".pdf") and not file_doc.file_name.lower().endswith(".pdf"):
        frappe.throw("Only PDF files are supported.")

    pdf_bytes = get_file_bytes(file_doc.file_url)

    if not pdf_bytes.startswith(b"%PDF"):
        frappe.throw("Uploaded file does not appear to be a valid PDF.")

    pdf_hash = sha256_bytes(pdf_bytes)

    file_doc.attached_to_doctype = "Frappe Sign Request"
    file_doc.attached_to_name = request.name
    file_doc.is_private = 1
    file_doc.save(ignore_permissions=True)

    request.source_pdf = file_doc.file_url
    request.source_pdf_hash = pdf_hash
    request.tamper_status = "Not Checked"

    if request.status == "Draft":
        request.status = "Prepared"

    request.save(ignore_permissions=True)

    append_event(
        request.name,
        "PDF Generated",
        details={
            "source_type": "Uploaded PDF",
            "source_pdf": request.source_pdf,
            "filename": file_doc.file_name,
            "triggered_from": "Designer",
        },
        document_hash=pdf_hash,
    )

    create_designer_file_hash(
        request.name,
        "Source PDF",
        request.source_pdf,
        pdf_hash,
        "Generated",
    )

    return {
        "status": "ready",
        "source_pdf": request.source_pdf,
        "source_pdf_hash": request.source_pdf_hash,
    }


def create_designer_file_hash(request_name, file_type, file_url, sha256_hash, hash_purpose):
    doc = frappe.get_doc(
        {
            "doctype": "Frappe Sign File Hash",
            "frappe_sign_request": request_name,
            "file_type": file_type,
            "file_url": file_url,
            "sha256_hash": sha256_hash,
            "hash_purpose": hash_purpose,
            "created_on": frappe.utils.now_datetime(),
            "created_by": frappe.session.user,
            "verification_status": "Not Checked",
        }
    )
    doc.flags.ignore_permissions = True
    doc.insert()

    return doc


@frappe.whitelist()
def get_designer_context(request_name):
    request = frappe.get_doc("Frappe Sign Request", request_name)

    if not frappe.has_permission("Frappe Sign Request", "read", doc=request):
        frappe.throw("You do not have permission to access this signing request.")

    if not request.source_pdf:
        ensure_result = ensure_designer_pdf(request_name)

        if ensure_result.get("status") != "ready":
            frappe.throw("This signing request does not have a source PDF.")

        request.reload()

    return {
        "mode": "request",
        "request": {
            "name": request.name,
            "request_title": request.request_title,
            "source_type": request.source_type,
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
                "signer": signer.signer,
                "full_name": signer.full_name,
                "email": signer.email,
                "role": signer.role,
                "signing_order": signer.signing_order,
                "status": signer.status,
            }
            for signer in request.signers
            if signer.role == "Signer"
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
def get_template_designer_context(template_name, sample_source_name):
    template = frappe.get_doc("Frappe Sign Template", template_name)

    if not frappe.has_permission("Frappe Sign Template", "read", doc=template):
        frappe.throw("You do not have permission to access this signing template.")

    if not template.source_doctype:
        frappe.throw("Please select a Source DocType before opening the Designer.")

    if not template.print_format:
        frappe.throw("Please select a Print Format before opening the Designer.")

    if not sample_source_name:
        frappe.throw("Please select a sample Source Name before opening the Designer.")

    if not frappe.db.exists(template.source_doctype, sample_source_name):
        frappe.throw(f"{template.source_doctype} {sample_source_name} does not exist.")

    source_doc = frappe.get_doc(template.source_doctype, sample_source_name)

    if not frappe.has_permission(template.source_doctype, "read", doc=source_doc):
        frappe.throw("You do not have permission to read the selected sample source document.")

    pdf_bytes = render_source_pdf(
        template.source_doctype,
        sample_source_name,
        template.print_format,
    )

    pdf_data_url = "data:application/pdf;base64," + base64.b64encode(pdf_bytes).decode("utf-8")

    signer_labels = [
        {
            "name": signer.signer_label,
            "signer": signer.signer_label,
            "full_name": signer.signer_label,
            "email": "",
            "role": signer.role,
            "signing_order": signer.signing_order,
            "status": "",
        }
        for signer in template.signers
        if signer.role == "Signer"
    ]

    if not signer_labels:
        frappe.throw("Please add at least one Template Signer before opening the Designer.")

    return {
        "mode": "template",
        "template": {
            "name": template.name,
            "template_name": template.template_name,
            "source_doctype": template.source_doctype,
            "sample_source_name": sample_source_name,
            "sample_source_title": source_doc.get_title() or source_doc.name,
            "print_format": template.print_format,
            "enabled": template.enabled,
            "source_pdf_data_url": pdf_data_url,
        },
        "signers": signer_labels,
        "fields": [
            {
                "name": field.name,
                "signer": field.signer_label,
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
            for field in template.fields
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
    valid_signer_rows = {signer.name for signer in request.signers if signer.role == "Signer"}

    request.set("fields", [])

    for field in fields:
        signer = field.get("signer")
        field_type = field.get("field_type")

        if signer and signer not in valid_signer_rows:
            frappe.throw("Invalid signer selected for a signing field.")

        if field_type in ("Signature", "Initials") and not signer:
            frappe.throw("Signature and Initials fields must be assigned to a signer.")

        request.append(
            "fields",
            {
                "signer": signer,
                "signer_label": field.get("signer_label"),
                "field_type": field_type,
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


@frappe.whitelist()
def save_template_fields(template_name, fields_json):
    template = frappe.get_doc("Frappe Sign Template", template_name)

    if not frappe.has_permission("Frappe Sign Template", "write", doc=template):
        frappe.throw("You do not have permission to update this signing template.")

    fields = json.loads(fields_json or "[]")

    valid_signer_labels = {
        signer.signer_label
        for signer in template.signers
        if signer.role == "Signer"
    }

    if not valid_signer_labels:
        frappe.throw("Please add at least one Template Signer before saving fields.")

    template.set("fields", [])

    for field in fields:
        signer_label = field.get("signer_label") or field.get("signer")
        field_type = field.get("field_type")

        if not signer_label:
            frappe.throw("Each template field requires a Signer Label.")

        if signer_label not in valid_signer_labels:
            frappe.throw(f"Invalid Template Signer Label: {signer_label}")

        template.append(
            "fields",
            {
                "signer_label": signer_label,
                "field_type": field_type,
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

    template.save()

    return {
        "status": "saved",
        "field_count": len(template.fields),
    }