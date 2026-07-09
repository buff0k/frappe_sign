# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import add_days, get_url, now_datetime

from frappe_sign.permissions import is_frappe_sign_sender
from frappe_sign.utils.audit import append_event, sha256_bytes
from frappe_sign.utils.files import attach_private_file, get_file_bytes
from frappe_sign.utils.notifications import (
    get_current_notification_signers,
    send_signing_request_email,
)
from frappe_sign.utils.pdf import render_source_pdf
from frappe_sign.utils.tokens import generate_signing_token, hash_signing_token


CLOSED_SIGNER_STATUSES = ("Signed", "Declined", "Skipped")


@frappe.whitelist()
def is_enabled_for_doctype(doctype):
    if not doctype:
        return {"enabled": False}

    if not is_frappe_sign_sender():
        return {"enabled": False}

    settings = frappe.get_single("Frappe Sign Settings")

    if not settings.enabled:
        return {"enabled": False}

    source_config = get_source_config(settings, doctype)

    if not source_config:
        return {"enabled": False}

    if source_config.required_sender_role:
        if source_config.required_sender_role not in frappe.get_roles():
            return {"enabled": False}

    return {
        "enabled": True,
        "default_print_format": source_config.default_print_format,
        "require_template": source_config.require_template,
        "default_template": source_config.default_template,
    }


@frappe.whitelist()
def create_from_source(doctype, name, print_format=None):
    if not is_frappe_sign_sender():
        frappe.throw("You do not have permission to create Frappe Sign requests.")

    source_doc = frappe.get_doc(doctype, name)

    if not frappe.has_permission(doctype, "read", doc=source_doc):
        frappe.throw("You do not have permission to create a signing request for this document.")

    settings = frappe.get_single("Frappe Sign Settings")

    if not settings.enabled:
        frappe.throw("Frappe Sign is not enabled.")

    source_config = get_source_config(settings, doctype)

    if not source_config:
        frappe.throw(f"Frappe Sign is not enabled for {doctype}.")

    if source_config.required_sender_role:
        if source_config.required_sender_role not in frappe.get_roles():
            frappe.throw(
                f"You need the {source_config.required_sender_role} role to create a signing request for this document."
            )

    if not print_format:
        print_format = source_config.default_print_format

    if not print_format:
        frappe.throw("A Print Format is required.")

    pdf_bytes = render_source_pdf(doctype, name, print_format)
    pdf_hash = sha256_bytes(pdf_bytes)

    expiry_days = settings.default_expiry_days or 7

    request = frappe.get_doc(
        {
            "doctype": "Frappe Sign Request",
            "request_title": f"{doctype} - {name}",
            "created_by": frappe.session.user,
            "source_type": "Frappe Document",
            "source_doctype": doctype,
            "source_name": name,
            "source_title": source_doc.get_title(),
            "print_format": print_format,
            "status": "Prepared",
            "expires_on": add_days(now_datetime(), expiry_days),
            "source_pdf_hash": pdf_hash,
            "attach_signed_pdf_to_source": source_config.attach_signed_pdf_to_source,
            "submit_source_on_completion": source_config.allow_submit_source_on_completion,
            "tamper_status": "Not Checked",
        }
    )
    request.insert()

    file_doc = attach_private_file(
        "Frappe Sign Request",
        request.name,
        f"{frappe.scrub(doctype)}-{name}-source.pdf",
        pdf_bytes,
    )

    request.source_pdf = file_doc.file_url
    request.save(ignore_permissions=True)

    append_event(
        request.name,
        "PDF Generated",
        details={
            "source_type": "Frappe Document",
            "source_doctype": doctype,
            "source_name": name,
            "print_format": print_format,
            "source_pdf": request.source_pdf,
        },
        document_hash=pdf_hash,
    )

    append_event(request.name, "Prepared")

    create_file_hash(
        request.name,
        "Source PDF",
        request.source_pdf,
        pdf_hash,
        "Generated",
    )

    return {
        "name": request.name,
        "status": request.status,
        "source_pdf": request.source_pdf,
    }


@frappe.whitelist()
def send_request(request_name):
    request = frappe.get_doc("Frappe Sign Request", request_name)

    if not frappe.has_permission("Frappe Sign Request", "write", doc=request):
        frappe.throw("You do not have permission to send this request.")

    if request.status not in ("Draft", "Prepared"):
        frappe.throw("Only Draft or Prepared requests can be sent.")

    validate_ready_to_send(request)

    if not request.current_signing_order:
        request.current_signing_order = 1

    notified_signers = get_current_notification_signers(request)

    if not notified_signers:
        frappe.throw("No eligible signers are available to notify.")

    for signer in notified_signers:
        signing_link = ensure_signer_link(request, signer)

        if signer.status in (None, "", "Pending"):
            signer.status = "Sent"

        send_signing_request_email(request, signer, signing_link)

    request.status = "Sent"
    request.save(ignore_permissions=True)

    append_event(
        request.name,
        "Sent",
        details={
            "sent_by": frappe.session.user,
            "signer_count": len(notified_signers),
            "signing_mode": request.signing_mode,
            "current_signing_order": request.current_signing_order,
        },
    )

    return {
        "status": request.status,
        "signer_count": len(notified_signers),
    }


@frappe.whitelist()
def resend_request(request_name):
    request = frappe.get_doc("Frappe Sign Request", request_name)

    if not frappe.has_permission("Frappe Sign Request", "write", doc=request):
        frappe.throw("You do not have permission to resend this request.")

    if request.status not in ("Sent", "Viewed", "Partially Signed"):
        frappe.throw("Only active requests can be resent.")

    resent_count = 0

    for signer in get_current_notification_signers(request):
        if signer.status in CLOSED_SIGNER_STATUSES:
            continue

        signing_link = ensure_signer_link(request, signer)

        if signer.status in (None, "", "Pending"):
            signer.status = "Sent"

        send_signing_request_email(request, signer, signing_link)
        resent_count += 1

    request.save(ignore_permissions=True)

    append_event(
        request.name,
        "Sent",
        details={
            "resent_by": frappe.session.user,
            "resend": True,
            "signer_count": resent_count,
            "signing_mode": request.signing_mode,
            "current_signing_order": request.current_signing_order,
        },
    )

    return {
        "status": request.status,
        "signer_count": resent_count,
    }


@frappe.whitelist()
def cancel_request(request_name):
    request = frappe.get_doc("Frappe Sign Request", request_name)

    if not frappe.has_permission("Frappe Sign Request", "write", doc=request):
        frappe.throw("You do not have permission to cancel this request.")

    if request.status in ("Completed", "Cancelled", "Declined", "Expired"):
        frappe.throw(f"Cannot cancel a request with status {request.status}.")

    request.status = "Cancelled"
    request.cancelled_on = now_datetime()

    for signer in request.signers:
        if signer.status not in ("Signed", "Declined"):
            signer.status = "Skipped"

    request.save(ignore_permissions=True)

    append_event(
        request.name,
        "Cancelled",
        details={"cancelled_by": frappe.session.user},
    )

    return {"status": "Cancelled"}


@frappe.whitelist()
def verify_tamper_status(request_name):
    request = frappe.get_doc("Frappe Sign Request", request_name)

    if not frappe.has_permission("Frappe Sign Request", "read", doc=request):
        frappe.throw("You do not have permission to verify this request.")

    from frappe_sign.utils.tamper import verify_request_tamper_status

    return verify_request_tamper_status(
        request_name=request.name,
        triggered_by="Manual",
    )


def get_latest_file_hash(request_name, file_url, hash_purpose=None):
    filters = {
        "frappe_sign_request": request_name,
        "file_url": file_url,
    }

    if hash_purpose:
        filters["hash_purpose"] = hash_purpose

    return frappe.db.get_value(
        "Frappe Sign File Hash",
        filters,
        "sha256_hash",
        order_by="creation desc",
    )


def get_source_config(settings, doctype):
    for row in settings.configured_doctypes:
        if row.enabled and row.source_doctype == doctype:
            return row

    return None


def create_file_hash(request_name, file_type, file_url, sha256_hash, hash_purpose):
    doc = frappe.get_doc(
        {
            "doctype": "Frappe Sign File Hash",
            "frappe_sign_request": request_name,
            "file_type": file_type,
            "file_url": file_url,
            "sha256_hash": sha256_hash,
            "hash_purpose": hash_purpose,
            "created_on": now_datetime(),
            "created_by": frappe.session.user,
            "verification_status": "Not Checked",
        }
    )
    doc.flags.ignore_permissions = True
    doc.insert()

    return doc


def validate_ready_to_send(request):
    if not request.source_pdf:
        frappe.throw("A source PDF is required before sending.")

    if not request.source_pdf_hash:
        frappe.throw("The source PDF hash is required before sending.")

    signer_rows = [row for row in request.signers if row.role == "Signer"]

    if not signer_rows:
        frappe.throw("At least one signer is required before sending.")

    signer_names = {row.name for row in signer_rows}

    for signer in signer_rows:
        if not signer.signer:
            frappe.throw("Each signer must have a Frappe Sign Profile.")

        if not signer.full_name:
            frappe.throw("Each signer must have a Full Name.")

        if not signer.email:
            frappe.throw("Each signer must have an Email.")

        if not signer.signing_order:
            signer.signing_order = 1

        if not signer.status:
            signer.status = "Pending"

    field_rows = list(request.fields or [])

    if not field_rows:
        frappe.throw("At least one signing field is required before sending.")

    for field in field_rows:
        if field.field_type in ("Signature", "Initials"):
            if not field.signer:
                frappe.throw("Each Signature and Initials field must be assigned to a signer.")

            if field.signer not in signer_names:
                frappe.throw("One or more signing fields are assigned to an invalid signer.")

        if not field.page or field.page < 1:
            frappe.throw("Each signing field must have a valid page number.")

        for ratio_field in ("x_ratio", "y_ratio", "width_ratio", "height_ratio"):
            value = field.get(ratio_field)

            if value is None:
                frappe.throw(f"{ratio_field} is required for each signing field.")

            if value < 0 or value > 1:
                frappe.throw(f"{ratio_field} must be between 0 and 1.")


def get_signing_url(token):
    return get_url(f"/sign/{token}")


def ensure_signer_link(request, signer):
    """
    Ensures a signer has one stable active signing link.

    This does not rotate the token if a signing_link and access_token_hash
    already exist.
    """
    if signer.signing_link and signer.access_token_hash:
        return signer.signing_link

    token = generate_signing_token()

    signer.access_token_hash = hash_signing_token(token)
    signer.signing_link = get_signing_url(token)
    signer.last_token_generated_on = now_datetime()
    signer.token_expires_on = request.expires_on

    if signer.status in (None, "", "Pending"):
        signer.status = "Sent"

    return signer.signing_link


@frappe.whitelist()
def get_signer_link(request_name, signer_row_name):
    request = frappe.get_doc("Frappe Sign Request", request_name)

    if not frappe.has_permission("Frappe Sign Request", "write", doc=request):
        frappe.throw("You do not have permission to access this signing request.")

    signer = None

    for row in request.signers:
        if row.name == signer_row_name:
            signer = row
            break

    if not signer:
        frappe.throw("Signer row not found.")

    if signer.role != "Signer":
        frappe.throw("Only signer rows have signing links.")

    if signer.status in CLOSED_SIGNER_STATUSES:
        frappe.throw(f"Cannot copy a signing link for a signer with status {signer.status}.")

    if request.status in ("Completed", "Declined", "Expired", "Cancelled", "Failed"):
        frappe.throw(f"Cannot copy a signing link for a request with status {request.status}.")

    signing_link = ensure_signer_link(request, signer)

    request.save(ignore_permissions=True)

    return {
        "signer": signer.name,
        "email": signer.email,
        "full_name": signer.full_name,
        "signing_link": signing_link,
    }