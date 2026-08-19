# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

"""Protects the PDFs a sent Frappe Sign Request depends on from being pulled
out from under it via the generic Frappe File attachment UI/API.

Frappe Sign Request.validate_locked_request() already blocks source_pdf (and
the other Attach fields) from being *reassigned* once a request has left
Draft/Prepared - but that only covers edits made by saving the Frappe Sign
Request form itself. The Attach field just stores a file_url string pointing
at a separate `File` document; removing an attachment (the trash icon in the
sidebar), deleting the File from the Files list, or toggling its Private/
Public visibility all act directly on that File doctype, with File's own
permissions, and never touch Frappe Sign Request.validate() at all. Once the
File is gone (or its path changes), every signer's link breaks with a raw
"File ... not found" error - this is what closes that gap.

Two layers, deliberately not redundant:

- has_locked_file_permission() (registered as a `has_permission` hook) is the
  real fix: `frappe.permissions.has_permission()` is checked before
  delete_doc()/save() call ANY controller method, so it's the only layer
  that runs early enough to stop File's own on_trash/validate from ever
  physically deleting or moving the bytes on disk in the first place.
  Verified: File.on_trash() unconditionally unlinks the file, and
  File.validate() -> handle_is_private_changed() unconditionally moves it,
  and both run *before* doc_events hooks like guard_file_delete() below get
  a turn - so a doc_events-only guard is too late to prevent the disk
  damage, even though it can still stop the DB row from vanishing too.
  (Like any permission hook, this doesn't apply to Administrator or to
  calls made with ignore_permissions=True - both are trusted call sites by
  Frappe convention.)
- guard_file_delete()/guard_file_changes() (doc_events on_trash/validate)
  are the secondary net for exactly that gap: an Administrator or a script
  using ignore_permissions=True. They can't always save the bytes at that
  point, but they still stop the operation from completing and reporting
  success, and keep the File row itself intact rather than silently
  vanishing alongside data that's already gone.
"""

import frappe

GUARDED_FIELDS = ("source_pdf", "signed_pdf", "audit_certificate", "certificate_signed_pdf")


def _locked_requests_referencing(file_url):
    if not file_url:
        return []

    from frappe_sign.frappe_sign.doctype.frappe_sign_request.frappe_sign_request import LOCKED_STATUSES

    conditions = " or ".join(f"`{field}` = %(file_url)s" for field in GUARDED_FIELDS)
    return frappe.db.sql(
        f"""
        select name
        from `tabFrappe Sign Request`
        where ({conditions}) and status in %(statuses)s
        """,  # nosemgrep: frappe-semgrep-rules.rules.frappe-sql-injection
        {"file_url": file_url, "statuses": LOCKED_STATUSES},
        as_dict=True,
    )


def _throw_locked(requests, action):
    names = ", ".join(sorted(r.name for r in requests))
    frappe.throw(
        f"This file is attached to a signing request already sent for signing ({names}) and "
        f"cannot be {action} - doing so would break the link every signer received. Cancel the "
        f"signing request first if the document needs to be replaced."
    )


def has_locked_file_permission(doc=None, ptype=None, user=None, debug=False):
    """File.has_permission - see module docstring. Controller permission
    hooks can only take permission away, never grant it, so returning True
    here just means "no objection from us", deferring to Frappe's normal
    File permission logic underneath."""
    if frappe.flags.get("frappe_sign_allow_file_change"):
        return True

    if not doc or ptype not in ("write", "delete") or doc.is_new():
        return True

    current_file_url = frappe.db.get_value("File", doc.name, "file_url")
    if _locked_requests_referencing(current_file_url):
        return False

    return True


def guard_file_delete(doc, method=None):
    """File.on_trash - secondary net, see module docstring."""
    if frappe.flags.get("frappe_sign_allow_file_change"):
        return

    requests = _locked_requests_referencing(doc.file_url)
    if requests:
        _throw_locked(requests, "deleted")


def guard_file_changes(doc, method=None):
    """File.validate - secondary net, see module docstring. Catches both a
    straight rename (file_url changes) and a Private/Public toggle (Frappe
    moves the file and rewrites file_url to match)."""
    if frappe.flags.get("frappe_sign_allow_file_change") or doc.is_new():
        return

    old = doc.get_doc_before_save()
    if not old:
        return

    if old.file_url == doc.file_url and int(old.is_private or 0) == int(doc.is_private or 0):
        return

    requests = _locked_requests_referencing(old.file_url)
    if requests:
        _throw_locked(requests, "changed")
