# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import now_datetime

from frappe_sign.utils.audit import append_event, sha256_bytes
from frappe_sign.utils.files import get_file_bytes


REQUEST_FINAL_STATUSES = ("Completed", "Declined", "Expired", "Cancelled", "Failed")
TAMPER_STATUSES = ("Not Checked", "Passed", "Failed")


def run_scheduled_tamper_checks():
    settings = frappe.get_single("Frappe Sign Settings")

    if not settings.enable_tamper_detection:
        return {
            "status": "disabled",
            "request_count": 0,
            "certificate_count": 0,
        }

    request_names = frappe.get_all(
        "Frappe Sign Request",
        filters={
            "status": ["in", REQUEST_FINAL_STATUSES],
        },
        pluck="name",
        order_by="modified asc",
    )

    certificate_names = frappe.get_all(
        "Frappe Sign Certificate",
        pluck="name",
        order_by="modified asc",
    )

    request_count = 0
    certificate_count = 0

    for request_name in request_names:
        verify_request_tamper_status(
            request_name,
            triggered_by="Scheduler",
        )
        request_count += 1

    for certificate_name in certificate_names:
        verify_certificate_tamper_status(
            certificate_name,
            triggered_by="Scheduler",
        )
        certificate_count += 1

    return {
        "status": "checked",
        "request_count": request_count,
        "certificate_count": certificate_count,
    }


def verify_request_tamper_status(request_name, triggered_by="Manual"):
    settings = frappe.get_single("Frappe Sign Settings")

    if not settings.enable_tamper_detection:
        return {
            "doctype": "Frappe Sign Request",
            "name": request_name,
            "tamper_status": "Not Checked",
            "message": "Tamper detection is disabled in Frappe Sign Settings.",
        }

    request = frappe.get_doc("Frappe Sign Request", request_name)
    old_status = request.tamper_status or "Not Checked"

    failed_checks = []
    passed_checks = []

    check_request_file(
        failed_checks=failed_checks,
        passed_checks=passed_checks,
        label="Source PDF",
        file_url=request.source_pdf,
        expected_hash=request.source_pdf_hash,
    )

    check_request_file(
        failed_checks=failed_checks,
        passed_checks=passed_checks,
        label="Signed PDF",
        file_url=request.signed_pdf,
        expected_hash=request.signed_pdf_hash,
    )

    audit_certificate_hash = None

    if request.audit_certificate:
        audit_certificate_hash = get_latest_file_hash(
            request.name,
            request.audit_certificate,
            "Certificate",
        )

    check_request_file(
        failed_checks=failed_checks,
        passed_checks=passed_checks,
        label="Audit Certificate",
        file_url=request.audit_certificate,
        expected_hash=audit_certificate_hash,
    )

    check_request_file(
        failed_checks=failed_checks,
        passed_checks=passed_checks,
        label="Final Verification PDF",
        file_url=request.certificate_signed_pdf,
        expected_hash=request.certificate_signed_pdf_hash,
    )

    new_status = "Failed" if failed_checks else "Passed"

    update_tamper_status(
        doctype="Frappe Sign Request",
        name=request.name,
        old_status=old_status,
        new_status=new_status,
        triggered_by=triggered_by,
        failed_checks=failed_checks,
        passed_checks=passed_checks,
    )

    if old_status != new_status:
        append_event(
            request.name,
            "Tamper Check Failed" if new_status == "Failed" else "Tamper Check Passed",
            details={
                "triggered_by": triggered_by,
                "old_status": old_status,
                "new_status": new_status,
                "failed_checks": failed_checks,
                "passed_checks": passed_checks,
            },
        )

    if new_status == "Failed" and old_status != "Failed":
        notify_request_creator_of_tamper(
            request=request,
            source_doctype="Frappe Sign Request",
            source_name=request.name,
            failed_checks=failed_checks,
        )

    return {
        "doctype": "Frappe Sign Request",
        "name": request.name,
        "tamper_status": new_status,
        "old_status": old_status,
        "changed": old_status != new_status,
        "failed_checks": failed_checks,
        "passed_checks": passed_checks,
    }


def verify_certificate_tamper_status(certificate_name, triggered_by="Manual"):
    settings = frappe.get_single("Frappe Sign Settings")

    if not settings.enable_tamper_detection:
        return {
            "doctype": "Frappe Sign Certificate",
            "name": certificate_name,
            "tamper_status": "Not Checked",
            "message": "Tamper detection is disabled in Frappe Sign Settings.",
        }

    certificate = frappe.get_doc("Frappe Sign Certificate", certificate_name)
    old_status = certificate.tamper_status or "Not Checked"

    failed_checks = []
    passed_checks = []

    check_request_file(
        failed_checks=failed_checks,
        passed_checks=passed_checks,
        label="Source PDF",
        file_url=certificate.source_pdf_url,
        expected_hash=certificate.source_pdf_hash,
    )

    check_request_file(
        failed_checks=failed_checks,
        passed_checks=passed_checks,
        label="Signed PDF",
        file_url=certificate.signed_pdf_url,
        expected_hash=certificate.signed_pdf_hash,
    )

    check_request_file(
        failed_checks=failed_checks,
        passed_checks=passed_checks,
        label="Audit Certificate",
        file_url=certificate.audit_certificate_url,
        expected_hash=certificate.audit_certificate_hash,
    )

    check_request_file(
        failed_checks=failed_checks,
        passed_checks=passed_checks,
        label="Final Verification PDF",
        file_url=certificate.final_pdf_url,
        expected_hash=certificate.final_pdf_hash,
    )

    new_status = "Failed" if failed_checks else "Passed"

    update_tamper_status(
        doctype="Frappe Sign Certificate",
        name=certificate.name,
        old_status=old_status,
        new_status=new_status,
        triggered_by=triggered_by,
        failed_checks=failed_checks,
        passed_checks=passed_checks,
    )

    if new_status == "Failed" and old_status != "Failed":
        request = frappe.get_doc("Frappe Sign Request", certificate.frappe_sign_request)

        notify_request_creator_of_tamper(
            request=request,
            source_doctype="Frappe Sign Certificate",
            source_name=certificate.name,
            failed_checks=failed_checks,
        )

    return {
        "doctype": "Frappe Sign Certificate",
        "name": certificate.name,
        "tamper_status": new_status,
        "old_status": old_status,
        "changed": old_status != new_status,
        "failed_checks": failed_checks,
        "passed_checks": passed_checks,
    }


def check_request_file(failed_checks, passed_checks, label, file_url, expected_hash):
    if not file_url and not expected_hash:
        return

    if not file_url:
        failed_checks.append(
            {
                "label": label,
                "reason": "Missing file URL",
                "expected_hash": expected_hash,
            }
        )
        return

    if not expected_hash:
        failed_checks.append(
            {
                "label": label,
                "file_url": file_url,
                "reason": "Missing expected hash",
            }
        )
        return

    try:
        current_hash = sha256_bytes(get_file_bytes(file_url))
    except Exception as error:
        failed_checks.append(
            {
                "label": label,
                "file_url": file_url,
                "expected_hash": expected_hash,
                "reason": f"Could not read file: {error}",
            }
        )
        return

    if current_hash != expected_hash:
        failed_checks.append(
            {
                "label": label,
                "file_url": file_url,
                "expected_hash": expected_hash,
                "current_hash": current_hash,
                "reason": "Hash mismatch",
            }
        )
        return

    passed_checks.append(
        {
            "label": label,
            "file_url": file_url,
            "hash": current_hash,
        }
    )


def update_tamper_status(
    doctype,
    name,
    old_status,
    new_status,
    triggered_by,
    failed_checks,
    passed_checks,
):
    if old_status == new_status:
        return

    if new_status not in TAMPER_STATUSES:
        frappe.throw(f"Invalid Tamper Status: {new_status}")

    frappe.db.set_value(
        doctype,
        name,
        "tamper_status",
        new_status,
        update_modified=True,
    )

    doc = frappe.get_doc(doctype, name)

    indicator = "red" if new_status == "Failed" else "green"

    doc.add_comment(
        "Info",
        text=(
            f"Tamper Status changed from <strong>{frappe.utils.escape_html(old_status)}</strong> "
            f"to <strong>{frappe.utils.escape_html(new_status)}</strong> "
            f"via {frappe.utils.escape_html(triggered_by)} tamper check."
            f"<br><br><strong>Failed checks:</strong> {len(failed_checks)}"
            f"<br><strong>Passed checks:</strong> {len(passed_checks)}"
        ),
    )

    frappe.publish_realtime(
        "msgprint",
        {
            "message": f"{doctype} {name} Tamper Status changed to {new_status}.",
            "indicator": indicator,
        },
        user=frappe.session.user,
    )


def notify_request_creator_of_tamper(request, source_doctype, source_name, failed_checks):
    if not request.created_by:
        return

    recipient = frappe.db.get_value("User", request.created_by, "email")

    if not recipient:
        return

    escaped_request = frappe.utils.escape_html(request.name)
    escaped_title = frappe.utils.escape_html(request.request_title or request.name)
    escaped_source_doctype = frappe.utils.escape_html(source_doctype)
    escaped_source_name = frappe.utils.escape_html(source_name)

    failed_rows = ""

    for check in failed_checks:
        failed_rows += f"""
            <li>
                <strong>{frappe.utils.escape_html(check.get("label") or "")}</strong>:
                {frappe.utils.escape_html(check.get("reason") or "Failed")}
            </li>
        """

    message = f"""
        <p>Hello,</p>

        <p>
            Tampering or integrity failure was detected on a Frappe Sign record linked to:
        </p>

        <p>
            <strong>{escaped_title}</strong><br>
            Request: <strong>{escaped_request}</strong>
        </p>

        <p>
            Source record checked:<br>
            <strong>{escaped_source_doctype}</strong>: {escaped_source_name}
        </p>

        <p>Failed checks:</p>
        <ul>
            {failed_rows}
        </ul>

        <p>
            Please review the signing request, certificate evidence records, and stored files urgently.
        </p>
    """

    frappe.sendmail(
        recipients=[recipient],
        subject=f"Tamper detected on Frappe Sign request: {request.request_title or request.name}",
        message=message,
        now=False,
    )


def get_latest_file_hash(request_name, file_url, hash_purpose=None):
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