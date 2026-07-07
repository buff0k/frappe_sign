# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe

from frappe_sign.utils.tokens import hash_signing_token


def get_context(context):
    token = get_token_from_request(context)

    context.no_cache = 1
    context.show_sidebar = False
    context.title = "Sign Document"

    if not token:
        context.invalid_token = True
        return context

    token_hash = hash_signing_token(token)

    signer = frappe.db.get_value(
        "Frappe Sign Signer",
        {
            "access_token_hash": token_hash,
            "status": ["in", ["Pending", "Sent", "Viewed"]],
        },
        ["name", "parent"],
        as_dict=True,
    )

    if not signer:
        context.invalid_token = True
        return context

    request = frappe.get_doc("Frappe Sign Request", signer.parent)

    if request.status in ("Completed", "Declined", "Expired", "Cancelled", "Failed"):
        context.invalid_token = False
        context.closed = True
        context.request_status = request.status
        return context

    context.invalid_token = False
    context.closed = False
    context.token = token
    context.request_name = request.name
    context.request_title = request.request_title
    context.source_pdf = request.source_pdf

    return context


def get_token_from_request(context):
    if frappe.form_dict.get("token"):
        return frappe.form_dict.get("token")

    if getattr(context, "token", None):
        return context.token

    route = frappe.local.request.path.strip("/")

    if route.startswith("sign/"):
        return route.split("sign/", 1)[1]

    return None