# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import json

import frappe
from frappe.utils import add_days, now_datetime

from frappe_sign.utils.audit import append_event
from frappe_sign.utils.files import get_file_bytes


OPEN_SIGNER_STATUSES = ("Pending", "Sent", "Viewed")
ACTIVE_REQUEST_STATUSES = ("Sent", "Viewed", "Partially Signed")
CLOSED_REQUEST_STATUSES = ("Completed", "Declined", "Expired", "Cancelled", "Failed")


def get_current_notification_signers(request):
    """
    Signers who should receive signing-link mail right now.

    Parallel:
        all open signers

    Sequential:
        only open signers at current_signing_order
    """
    signers = [
        row
        for row in request.signers
        if row.role == "Signer" and row.status in OPEN_SIGNER_STATUSES
    ]

    if request.signing_mode != "Sequential":
        return signers

    current_order = request.current_signing_order or 1

    return [
        row
        for row in signers
        if (row.signing_order or 1) == current_order
    ]


def send_signing_request_email(request, signer, signing_link, reminder=False):
    if not signer.email:
        return

    subject_prefix = "Reminder: " if reminder else ""
    subject = f"{subject_prefix}Signature requested: {request.request_title}"

    escaped_name = frappe.utils.escape_html(signer.full_name or signer.email)
    escaped_title = frappe.utils.escape_html(request.request_title or request.name)
    escaped_link = frappe.utils.escape_html(signing_link)

    intro = (
        "This is a reminder that your signature is still required."
        if reminder
        else "You have been requested to sign the following document:"
    )

    message = f"""
        <p>Hello {escaped_name},</p>
        <p>{frappe.utils.escape_html(intro)}</p>
        <p><strong>{escaped_title}</strong></p>
        <p>
            <a href="{escaped_link}">Open signing request</a>
        </p>
        <p>This link is unique to you and should not be shared.</p>
    """

    frappe.sendmail(
        recipients=[signer.email],
        subject=subject,
        message=message,
        now=False,
    )


def send_progress_notification(request, completed_signer, action, reason=None):
    """
    Notify the creator and relevant remaining signers after a signer signs or declines.

    Signed:
        creator + currently eligible remaining signers.

    Declined:
        creator + all other signers, because the request is closed.
    """
    recipients = get_progress_recipients(request, completed_signer, action)

    if not recipients:
        return

    escaped_title = frappe.utils.escape_html(request.request_title or request.name)
    escaped_signer = frappe.utils.escape_html(completed_signer.full_name or completed_signer.email)
    escaped_action = frappe.utils.escape_html(action)

    subject = f"Frappe Sign request {action.lower()}: {request.request_title}"

    reason_html = ""

    if reason:
        reason_html = f"<p><strong>Reason:</strong> {frappe.utils.escape_html(reason)}</p>"

    message = f"""
        <p>Hello,</p>
        <p><strong>{escaped_signer}</strong> has {escaped_action.lower()} the signing request:</p>
        <p><strong>{escaped_title}</strong></p>
        {reason_html}
    """

    next_links = build_next_signer_links(request)

    if next_links:
        message += """
            <p>The following signer(s) may now continue:</p>
            <ul>
        """

        for item in next_links:
            message += f"""
                <li>
                    {frappe.utils.escape_html(item["label"])}:
                    <a href="{frappe.utils.escape_html(item["link"])}">Open signing request</a>
                </li>
            """

        message += "</ul>"

    frappe.sendmail(
        recipients=list(recipients),
        subject=subject,
        message=message,
        now=False,
    )


def get_progress_recipients(request, completed_signer, action):
    recipients = set()

    add_request_creator_email(request, recipients)

    if action == "Declined":
        for signer in request.signers:
            if signer.role != "Signer":
                continue

            if signer.name == completed_signer.name:
                continue

            if signer.email:
                recipients.add(signer.email)

        return recipients

    for signer in get_current_notification_signers(request):
        if signer.name == completed_signer.name:
            continue

        if signer.email:
            recipients.add(signer.email)

    return recipients


def build_next_signer_links(request):
    if request.status in CLOSED_REQUEST_STATUSES:
        return []

    items = []

    for signer in get_current_notification_signers(request):
        if not signer.signing_link:
            continue

        items.append(
            {
                "label": signer.full_name or signer.email,
                "link": signer.signing_link,
            }
        )

    return items


def send_completion_notification(request):
    """
    Send final signed PDF and audit certificate to creator and all signers.
    """
    recipients = get_completion_recipients(request)

    if not recipients:
        return

    attachments = []

    if request.signed_pdf:
        attachments.append(get_email_attachment(request.signed_pdf, "signed-document.pdf"))

    if request.audit_certificate:
        attachments.append(get_email_attachment(request.audit_certificate, "audit-certificate.pdf"))

    escaped_title = frappe.utils.escape_html(request.request_title or request.name)

    message = f"""
        <p>Hello,</p>
        <p>The following Frappe Sign request has been fully signed:</p>
        <p><strong>{escaped_title}</strong></p>
        <p>The signed PDF and audit certificate are attached.</p>
    """

    frappe.sendmail(
        recipients=list(recipients),
        subject=f"Completed signing request: {request.request_title}",
        message=message,
        attachments=attachments,
        now=False,
    )


def get_completion_recipients(request):
    recipients = set()

    add_request_creator_email(request, recipients)

    for signer in request.signers:
        if signer.role != "Signer":
            continue

        if signer.email:
            recipients.add(signer.email)

    return recipients


def add_request_creator_email(request, recipients):
    if not request.created_by:
        return

    creator_email = frappe.db.get_value("User", request.created_by, "email")

    if creator_email:
        recipients.add(creator_email)


def get_email_attachment(file_url, fallback_filename):
    file_doc = frappe.get_doc("File", {"file_url": file_url})

    return {
        "fname": file_doc.file_name or fallback_filename,
        "fcontent": get_file_bytes(file_url),
    }


def send_daily_signing_reminders():
    """
    Scheduled daily reminder mailer.

    Uses Frappe Sign Settings.default_reminder_days as the minimum number of days
    between reminder emails for the same signer on the same request.
    """
    settings = frappe.get_single("Frappe Sign Settings")

    if not settings.enabled:
        return

    reminder_days = settings.default_reminder_days or 1

    requests = frappe.get_all(
        "Frappe Sign Request",
        filters={
            "status": ["in", ACTIVE_REQUEST_STATUSES],
        },
        pluck="name",
        order_by="modified asc",
    )

    sent_count = 0

    for request_name in requests:
        request = frappe.get_doc("Frappe Sign Request", request_name)

        if request.expires_on and request.expires_on < now_datetime():
            continue

        for signer in get_current_notification_signers(request):
            if not signer.signing_link:
                continue

            if reminder_recently_sent(request.name, signer.name, reminder_days):
                continue

            send_signing_request_email(
                request,
                signer,
                signer.signing_link,
                reminder=True,
            )

            append_event(
                request.name,
                "Sent",
                signer_email=signer.email,
                details={
                    "signer": signer.name,
                    "reminder": True,
                    "reminder_days": reminder_days,
                },
            )

            sent_count += 1

    return {
        "sent_count": sent_count,
    }


def reminder_recently_sent(request_name, signer_name, reminder_days):
    cutoff = add_days(now_datetime(), -1 * reminder_days)

    events = frappe.get_all(
        "Frappe Sign Event",
        filters={
            "frappe_sign_request": request_name,
            "event_type": "Sent",
            "timestamp": [">=", cutoff],
        },
        fields=[
            "details_json",
            "timestamp",
        ],
        order_by="timestamp desc",
        limit=50,
    )

    for event in events:
        details = parse_details_json(event.details_json)

        if not details:
            continue

        if details.get("reminder") and details.get("signer") == signer_name:
            return True

    return False


def parse_details_json(value):
    if not value:
        return {}

    try:
        return json.loads(value)
    except Exception:
        return {}