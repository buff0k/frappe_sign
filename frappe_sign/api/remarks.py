# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import cint, flt, now_datetime

from frappe_sign.api.signing import (
    _get_signer_from_token,
    _get_signer_row,
    ensure_signer_can_act,
    lock_request,
)
from frappe_sign.utils.audit import append_event
from frappe_sign.utils.notifications import (
    CLOSED_REQUEST_STATUSES,
    OPEN_SIGNER_STATUSES,
    send_remark_added_notifications,
)


@frappe.whitelist(allow_guest=True)
def add_remark(token, page, x_ratio, y_ratio, remark_text):
    signer, request = _get_signer_from_token(token)

    lock_request(request.name)
    request.reload()

    signer_row = _get_signer_row(request, signer.name)

    if not signer_row:
        frappe.throw("Signer row not found.")

    ensure_signer_can_act(request, signer_row)

    if signer_row.role != "Signer":
        frappe.throw("Only signers can add remarks.")

    if signer_row.status not in OPEN_SIGNER_STATUSES:
        frappe.throw("This signing request has already been completed or is no longer available.")

    if request.status in CLOSED_REQUEST_STATUSES:
        frappe.throw(f"This signing request is {request.status}.")

    if not request.allow_remarks:
        frappe.throw("Remarks are not enabled for this signing request.")

    remark_text = (remark_text or "").strip()

    if not remark_text:
        frappe.throw("Please enter remark text.")

    page = cint(page)

    if page < 1:
        frappe.throw("A valid page number is required.")

    x_ratio = flt(x_ratio)
    y_ratio = flt(y_ratio)

    for ratio_name, value in (("x_ratio", x_ratio), ("y_ratio", y_ratio)):
        if value < 0 or value > 1:
            frappe.throw(f"{ratio_name} must be between 0 and 1.")

    remark_row = request.append(
        "remarks",
        {
            "signer": signer_row.name,
            "signer_label": signer_row.full_name or signer_row.email,
            "page": page,
            "x_ratio": x_ratio,
            "y_ratio": y_ratio,
            "remark_text": remark_text,
            "added_by_email": signer_row.email,
            "added_on": now_datetime(),
        },
    )

    # Already-signed signers must re-sign once the document has changed -
    # the still-open ones just see the new remark the next time they load
    # the signing page, so they need no status change at all.
    reset_signers = [
        row for row in request.signers if row.role == "Signer" and row.status == "Signed"
    ]

    for row in reset_signers:
        row.status = "Needs Re-Sign"

    if reset_signers:
        request.status = "Changes Added"

        if request.signing_mode == "Sequential":
            # Rewinding to the earliest reset signer's own order lets
            # ensure_signer_can_act's existing sequential-mode gating cascade
            # the re-sign requirement to later signers too, with no changes
            # needed to that function.
            min_reset_order = min((row.signing_order or 1) for row in reset_signers)

            if not request.current_signing_order or min_reset_order < request.current_signing_order:
                request.current_signing_order = min_reset_order

    request.save(ignore_permissions=True)

    append_event(
        request.name,
        "Remark Added",
        signer_email=signer_row.email,
        details={
            "signer": signer_row.name,
            "page": page,
            "remark": remark_row.name,
            "reset_signers": [row.name for row in reset_signers],
        },
    )

    if reset_signers:
        send_remark_added_notifications(request, reset_signers, remark_row)

    return {
        "status": "added",
        "remark": remark_row.name,
        "request_status": request.status,
    }
