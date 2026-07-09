# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt


import frappe
from frappe.utils import now_datetime

from frappe_sign.utils.audit import append_event
from frappe_sign.utils.tokens import hash_signing_token
from frappe_sign.utils.files import get_file_bytes


def _get_signer_from_token(token):
    if not token:
        frappe.throw("Missing signing token.")

    token_hash = hash_signing_token(token)

    signer = frappe.db.get_value(
        "Frappe Sign Signer",
        {
            "access_token_hash": token_hash,
            "status": ["in", ["Pending", "Sent", "Viewed"]],
        },
        [
            "name",
            "parent",
            "email",
            "full_name",
            "user",
            "status",
            "signing_order",
        ],
        as_dict=True,
    )

    if not signer:
        frappe.throw("Invalid or expired signing token.")

    request = frappe.get_doc("Frappe Sign Request", signer.parent)

    if request.status in ("Completed", "Declined", "Expired", "Cancelled", "Failed"):
        frappe.throw(f"This signing request is {request.status}.")

    return signer, request


@frappe.whitelist(allow_guest=True)
def get_signing_context(token):
    signer, request = _get_signer_from_token(token)

    if signer.status in ("Pending", "Sent"):
        _mark_viewed(signer, request)

    visible_fields = []

    for field in request.fields:
        if field.signer == signer.name:
            visible_fields.append(
                {
                    "name": field.name,
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
            )

    return {
        "request": request.name,
        "title": request.request_title,
        "source_pdf": request.source_pdf,
        "signer": {
            "name": signer.name,
            "full_name": signer.full_name,
            "email": signer.email,
            "status": signer.status,
        },
        "fields": visible_fields,
    }


@frappe.whitelist(allow_guest=True)
def complete_signing(token, field_values=None):
    signer, request = _get_signer_from_token(token)

    # Placeholder for the next implementation layer:
    # - parse field_values
    # - validate required fields
    # - snapshot signature/initials
    # - stamp fields into PDF
    # - generate audit certificate
    # - run tamper checks
    # - optionally apply certificate-based PDF signing

    _update_signer_row(
        request,
        signer.name,
        {
            "status": "Signed",
            "signed_on": now_datetime(),
            "ip_address": getattr(frappe.local, "request_ip", None),
            "user_agent": frappe.get_request_header("User-Agent"),
        },
    )

    append_event(
        request.name,
        "Signed",
        signer_email=signer.email,
        details={"signer": signer.name},
    )

    _refresh_request_status(request)

    return {"status": "Signed"}


@frappe.whitelist(allow_guest=True)
def decline_signing(token, reason):
    signer, request = _get_signer_from_token(token)

    _update_signer_row(
        request,
        signer.name,
        {
            "status": "Declined",
            "declined_on": now_datetime(),
            "decline_reason": reason,
            "ip_address": getattr(frappe.local, "request_ip", None),
            "user_agent": frappe.get_request_header("User-Agent"),
        },
    )

    request.status = "Declined"
    request.declined_on = now_datetime()
    request.decline_reason = reason
    request.save(ignore_permissions=True)

    append_event(
        request.name,
        "Declined",
        signer_email=signer.email,
        details={
            "signer": signer.name,
            "reason": reason,
        },
    )

    return {"status": "Declined"}


def _mark_viewed(signer, request):
    _update_signer_row(
        request,
        signer.name,
        {
            "status": "Viewed",
            "viewed_on": now_datetime(),
            "ip_address": getattr(frappe.local, "request_ip", None),
            "user_agent": frappe.get_request_header("User-Agent"),
        },
    )

    if request.status in ("Prepared", "Sent"):
        request.status = "Viewed"
        request.save(ignore_permissions=True)

    append_event(
        request.name,
        "Viewed",
        signer_email=signer.email,
        details={"signer": signer.name},
    )


def _update_signer_row(request, signer_row_name, values):
    for row in request.signers:
        if row.name == signer_row_name:
            for key, value in values.items():
                row.set(key, value)

            request.save(ignore_permissions=True)
            return

    frappe.throw("Signer row not found.")


def _refresh_request_status(request):
    request.reload()

    signer_rows = [row for row in request.signers if row.role == "Signer"]

    if signer_rows and all(row.status == "Signed" for row in signer_rows):
        request.status = "Completed"
        request.completed_on = now_datetime()
        request.save(ignore_permissions=True)

        append_event(request.name, "Completed")

        # Next layer:
        # generate final signed PDF
        # generate audit certificate
        # append certificate if configured
        # tamper check final PDF
        # optional certificate-based signing
    else:
        request.status = "Partially Signed"
        request.save(ignore_permissions=True)


@frappe.whitelist(allow_guest=True)
def get_source_pdf(token):
    signer, request = _get_signer_from_token(token)

    if not request.source_pdf:
        frappe.throw("No source PDF is attached to this signing request.")

    pdf_bytes = get_file_bytes(request.source_pdf)

    frappe.local.response.filename = f"{request.name}.pdf"
    frappe.local.response.filecontent = pdf_bytes
    frappe.local.response.type = "download"
    frappe.local.response.display_content_as = "inline"