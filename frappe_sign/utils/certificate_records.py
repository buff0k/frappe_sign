# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import json

import frappe
from frappe.utils import now_datetime


def create_audit_certificate_record(request_name, audit_certificate_hash=None):
    request = frappe.get_doc("Frappe Sign Request", request_name)

    if not request.audit_certificate:
        frappe.throw("Cannot create audit certificate record without an audit certificate.")

    audit_certificate_hash = audit_certificate_hash or get_file_hash(
        request.name,
        request.audit_certificate,
        "Certificate",
    )

    if not audit_certificate_hash:
        frappe.throw("Cannot create audit certificate record without an audit certificate hash.")

    doc = frappe.get_doc(
        {
            "doctype": "Frappe Sign Certificate",
            "frappe_sign_request": request.name,
            "certificate_type": "Audit Certificate",
            "source_pdf_url": request.source_pdf,
            "source_pdf_hash": request.source_pdf_hash,
            "signed_pdf_url": request.signed_pdf,
            "signed_pdf_hash": request.signed_pdf_hash,
            "audit_certificate_url": request.audit_certificate,
            "audit_certificate_hash": audit_certificate_hash,
            "event_chain_hash": request.audit_chain_hash,
            "tamper_status": request.tamper_status or "Not Checked",
            "digitally_signed": 0,
            "generated_on": now_datetime(),
            "generated_by": frappe.session.user,
            "summary_json": build_certificate_summary_json(
                request=request,
                certificate_type="Audit Certificate",
                audit_certificate_hash=audit_certificate_hash,
            ),
        }
    )

    doc.flags.ignore_permissions = True
    doc.insert()

    return doc


def create_final_verification_package_record(
    request_name,
    audit_appended=False,
    digitally_signed=False,
):
    request = frappe.get_doc("Frappe Sign Request", request_name)

    if not request.certificate_signed_pdf:
        return None

    if not request.certificate_signed_pdf_hash:
        frappe.throw("Cannot create final verification package record without a final PDF hash.")

    settings = frappe.get_single("Frappe Sign Settings")

    audit_certificate_hash = None

    if request.audit_certificate:
        audit_certificate_hash = get_file_hash(
            request.name,
            request.audit_certificate,
            "Certificate",
        )

    doc = frappe.get_doc(
        {
            "doctype": "Frappe Sign Certificate",
            "frappe_sign_request": request.name,
            "certificate_type": "Final Verification Package",
            "source_pdf_url": request.source_pdf,
            "source_pdf_hash": request.source_pdf_hash,
            "signed_pdf_url": request.signed_pdf,
            "signed_pdf_hash": request.signed_pdf_hash,
            "final_pdf_url": request.certificate_signed_pdf,
            "final_pdf_hash": request.certificate_signed_pdf_hash,
            "audit_certificate_url": request.audit_certificate,
            "audit_certificate_hash": audit_certificate_hash,
            "event_chain_hash": request.audit_chain_hash,
            "tamper_status": request.tamper_status or "Not Checked",
            "digitally_signed": 1 if digitally_signed else 0,
            "signing_certificate_fingerprint_sha256": (
                settings.certificate_fingerprint_sha256 if digitally_signed else None
            ),
            "signing_certificate_subject": (
                settings.certificate_subject if digitally_signed else None
            ),
            "signing_certificate_issuer": (
                settings.certificate_issuer if digitally_signed else None
            ),
            "signing_certificate_valid_from": (
                settings.certificate_valid_from if digitally_signed else None
            ),
            "signing_certificate_valid_to": (
                settings.certificate_valid_to if digitally_signed else None
            ),
            "generated_on": now_datetime(),
            "generated_by": frappe.session.user,
            "summary_json": build_certificate_summary_json(
                request=request,
                certificate_type="Final Verification Package",
                audit_certificate_hash=audit_certificate_hash,
                final_pdf_hash=request.certificate_signed_pdf_hash,
                audit_appended=audit_appended,
                digitally_signed=digitally_signed,
                settings=settings,
            ),
        }
    )

    doc.flags.ignore_permissions = True
    doc.insert()

    return doc


def get_file_hash(request_name, file_url, hash_purpose=None):
    if not file_url:
        return None

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


def build_certificate_summary_json(
    request,
    certificate_type,
    audit_certificate_hash=None,
    final_pdf_hash=None,
    audit_appended=False,
    digitally_signed=False,
    settings=None,
):
    payload = {
        "certificate_type": certificate_type,
        "frappe_sign_request": request.name,
        "request_title": request.request_title,
        "source_type": request.source_type,
        "source_doctype": request.source_doctype,
        "source_name": request.source_name,
        "source_title": request.source_title,
        "status": request.status,
        "docstatus": request.docstatus,
        "completed_on": str(request.completed_on) if request.completed_on else None,
        "source_pdf": request.source_pdf,
        "source_pdf_hash": request.source_pdf_hash,
        "signed_pdf": request.signed_pdf,
        "signed_pdf_hash": request.signed_pdf_hash,
        "audit_certificate": request.audit_certificate,
        "audit_certificate_hash": audit_certificate_hash,
        "final_pdf": request.certificate_signed_pdf,
        "final_pdf_hash": final_pdf_hash,
        "audit_chain_hash": request.audit_chain_hash,
        "tamper_status": request.tamper_status,
        "audit_appended": bool(audit_appended),
        "digitally_signed": bool(digitally_signed),
    }

    if digitally_signed and settings:
        payload["signing_certificate"] = {
            "fingerprint_sha256": settings.certificate_fingerprint_sha256,
            "subject": settings.certificate_subject,
            "issuer": settings.certificate_issuer,
            "valid_from": str(settings.certificate_valid_from)
            if settings.certificate_valid_from
            else None,
            "valid_to": str(settings.certificate_valid_to)
            if settings.certificate_valid_to
            else None,
            "status": settings.certificate_status,
            "is_self_signed": bool(settings.certificate_is_self_signed),
        }

    return json.dumps(
        payload,
        sort_keys=True,
        default=str,
        indent=2,
    )