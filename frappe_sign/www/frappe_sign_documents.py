# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe
from frappe import _


no_cache = 1


ACTIVE_REQUEST_STATUSES = ("Sent", "Viewed", "Partially Signed")
OPEN_SIGNER_STATUSES = ("Pending", "Sent", "Viewed")


def get_context(context):
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/login?redirect-to=/frappe-sign-documents"
        raise frappe.Redirect

    context.no_cache = 1
    context.show_sidebar = True
    context.title = _("Documents To Sign")
    context.documents = get_documents_for_current_user()

    return context


def get_current_user_profile_name():
    if frappe.session.user == "Guest":
        return None

    return frappe.db.get_value(
        "Frappe Sign Profile",
        {
            "user": frappe.session.user,
            "active": 1,
        },
        "name",
    )


def signer_is_current_in_sequence(request, signer):
    if request.signing_mode != "Sequential":
        return True

    current_order = request.current_signing_order or 1
    signer_order = signer.signing_order or 1

    return signer_order <= current_order


def get_documents_for_current_user():
    profile_name = get_current_user_profile_name()

    if not profile_name:
        return []

    request_names = frappe.get_all(
        "Frappe Sign Request",
        filters={
            "status": ["in", ACTIVE_REQUEST_STATUSES],
        },
        pluck="name",
        order_by="modified desc",
    )

    documents = []

    for request_name in request_names:
        request = frappe.get_doc("Frappe Sign Request", request_name)

        matching_signer = None

        for signer in request.signers:
            if signer.signer != profile_name:
                continue

            if signer.role != "Signer":
                continue

            if signer.status not in OPEN_SIGNER_STATUSES:
                continue

            matching_signer = signer
            break

        if not matching_signer:
            continue

        is_current = signer_is_current_in_sequence(request, matching_signer)

        documents.append(
            {
                "name": request.name,
                "request_title": request.request_title,
                "source_type": request.source_type,
                "source_doctype": request.source_doctype,
                "source_name": request.source_name,
                "source_title": request.source_title,
                "status": request.status,
                "signing_mode": request.signing_mode,
                "current_signing_order": request.current_signing_order,
                "signer_name": matching_signer.name,
                "signer_status": matching_signer.status,
                "signing_order": matching_signer.signing_order,
                "signing_link": matching_signer.signing_link if is_current else None,
                "is_current": is_current,
                "expires_on": request.expires_on,
                "modified": request.modified,
            }
        )

    return documents


@frappe.whitelist()
def get_documents():
    if frappe.session.user == "Guest":
        frappe.throw(_("You must be logged in to view documents for signature."))

    return get_documents_for_current_user()