# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import add_days, get_url, now_datetime

from frappe_sign.permissions import is_frappe_sign_sender
from frappe_sign.utils.audit import append_event, sha256_bytes
from frappe_sign.utils.files import attach_private_file, get_file_bytes
from frappe_sign.utils.pdf import render_source_pdf
from frappe_sign.utils.tokens import generate_signing_token, hash_signing_token


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
            frappe.throw(f"You need the {source_config.required_sender_role} role to send this document.")

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
            "request_title": f"{doctype} {name}",
            "created_by": frappe.session.user,
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
        f"{doctype}-{name}-source.pdf",
        pdf_bytes,
    )

    request.source_pdf = file_doc.file_url
    request.save(ignore_permissions=True)

    append_event(
        request.name,
        "PDF Generated",
        details={
            "source_doctype": doctype,
            "source_name": name,
            "print_format": print_format,
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

    if not request.signers:
        frappe.throw("At least one signer is required.")

    if not request.fields:
        frappe.throw("At least one signing field is required.")

    for signer in request.signers:
        if signer.role != "Signer":
            continue

        token = generate_signing_token()
        signer.access_token_hash = hash_signing_token(token)
        signer.last_token_generated_on = now_datetime()
        signer.token_expires_on = request.expires_on
        signer.status = "Sent"

        send_signing_email(request, signer, token)

    request.status = "Sent"
    request.save(ignore_permissions=True)

    append_event(
        request.name,
        "Sent",
        details={
            "sent_by": frappe.session.user,
            "signer_count": len([s for s in request.signers if s.role == "Signer"]),
        },
    )

    return {"status": "Sent"}


@frappe.whitelist()
def resend_request(request_name):
    request = frappe.get_doc("Frappe Sign Request", request_name)

    if not frappe.has_permission("Frappe Sign Request", "write", doc=request):
        frappe.throw("You do not have permission to resend this request.")

    if request.status not in ("Sent", "Viewed", "Partially Signed"):
        frappe.throw("Only active requests can be resent.")

    for signer in request.signers:
        if signer.role != "Signer":
            continue

        if signer.status == "Signed":
            continue

        token = generate_signing_token()
        signer.access_token_hash = hash_signing_token(token)
        signer.last_token_generated_on = now_datetime()
        signer.token_expires_on = request.expires_on

        if signer.status == "Pending":
            signer.status = "Sent"

        send_signing_email(request, signer, token)

    request.save(ignore_permissions=True)

    append_event(
        request.name,
        "Sent",
        details={
            "resent_by": frappe.session.user,
            "resend": True,
        },
    )

    return {"status": request.status}


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

    failed = False

    if request.source_pdf and request.source_pdf_hash:
        current_source_hash = sha256_bytes(get_file_bytes(request.source_pdf))
        if current_source_hash != request.source_pdf_hash:
            failed = True

    if request.signed_pdf and request.signed_pdf_hash:
        current_signed_hash = sha256_bytes(get_file_bytes(request.signed_pdf))
        if current_signed_hash != request.signed_pdf_hash:
            failed = True

    request.tamper_status = "Failed" if failed else "Passed"
    request.save(ignore_permissions=True)

    append_event(
        request.name,
        "Tamper Check Failed" if failed else "Tamper Check Passed",
    )

    return {"tamper_status": request.tamper_status}


def get_source_config(settings, doctype):
    for row in settings.configured_doctypes:
        if row.enabled and row.source_doctype == doctype:
            return row

    return None


def send_signing_email(request, signer, token):
    signing_url = get_url(f"/frappe-sign-portal?token={token}")

    subject = f"Signature requested: {request.request_title}"

    message = f"""
        <p>Hello {frappe.utils.escape_html(signer.full_name or signer.email)},</p>
        <p>You have been requested to sign the following document:</p>
        <p><strong>{frappe.utils.escape_html(request.request_title)}</strong></p>
        <p>
            <a href="{signing_url}">Open signing request</a>
        </p>
        <p>This link is unique to you and should not be shared.</p>
    """

    frappe.sendmail(
        recipients=[signer.email],
        subject=subject,
        message=message,
        now=False,
    )


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