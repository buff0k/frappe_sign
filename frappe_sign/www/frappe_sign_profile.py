# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe
from frappe import _

from frappe_sign.utils.signatures import attach_signature_png


no_cache = 1


def get_context(context):
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/login?redirect-to=/frappe-sign-profile"
        raise frappe.Redirect

    profile = get_or_create_profile_for_current_user()

    context.no_cache = 1
    context.show_sidebar = True
    context.title = _("Frappe Sign Profile")
    context.profile = profile

    return context


def get_or_create_profile_for_current_user():
    user_name = frappe.session.user

    existing = frappe.db.get_value(
        "Frappe Sign Profile",
        {
            "user": user_name,
        },
        "name",
    )

    if existing:
        return frappe.get_doc("Frappe Sign Profile", existing)

    user = frappe.get_doc("User", user_name)

    if not user.email:
        frappe.throw(_("Your User account does not have an email address."))

    profile = frappe.get_doc(
        {
            "doctype": "Frappe Sign Profile",
            "user": user.name,
            "full_name": user.full_name,
            "email": user.email,
            "signature_type": "Uploaded",
            "active": 1,
        }
    )

    profile.insert(ignore_permissions=True)

    return profile


def get_current_user_profile():
    if frappe.session.user == "Guest":
        frappe.throw(_("You must be logged in to access your Frappe Sign Profile."))

    profile_name = frappe.db.get_value(
        "Frappe Sign Profile",
        {
            "user": frappe.session.user,
        },
        "name",
    )

    if not profile_name:
        return get_or_create_profile_for_current_user()

    return frappe.get_doc("Frappe Sign Profile", profile_name)


@frappe.whitelist()
def get_profile_context():
    profile = get_current_user_profile()

    return {
        "name": profile.name,
        "user": profile.user,
        "full_name": profile.full_name,
        "email": profile.email,
        "signature_type": profile.signature_type,
        "signature_image": profile.signature_image,
        "initials_image": profile.initials_image,
        "signature_text": profile.signature_text,
        "signature_hash": profile.signature_hash,
        "initials_hash": profile.initials_hash,
        "consent": profile.consent,
        "consent_on": profile.consent_on,
        "active": profile.active,
    }


@frappe.whitelist()
def save_profile_settings(signature_type=None, signature_text=None, consent=None):
    profile = get_current_user_profile()

    if signature_type not in ("Drawn", "Uploaded", "Typed", None, ""):
        frappe.throw(_("Invalid Signature Type."))

    if signature_type:
        profile.signature_type = signature_type

    profile.signature_text = signature_text or ""

    if consent in (1, "1", True, "true", "True", "yes", "Yes"):
        profile.consent = 1
    else:
        profile.consent = 0

    profile.save(ignore_permissions=True)

    return {
        "status": "saved",
        "profile": profile.name,
        "signature_type": profile.signature_type,
        "signature_text": profile.signature_text,
        "consent": profile.consent,
        "consent_on": profile.consent_on,
    }


@frappe.whitelist()
def save_drawn_profile_image(kind, data_url):
    profile = get_current_user_profile()

    result = attach_signature_png(
        reference_doctype="Frappe Sign Profile",
        reference_name=profile.name,
        kind=kind,
        data_url=data_url,
    )

    profile.set(result["fieldname"], result["file_url"])

    if kind == "signature":
        profile.signature_type = "Drawn"

    profile.save(ignore_permissions=True)

    return {
        "status": "saved",
        "kind": kind,
        "fieldname": result["fieldname"],
        "file_url": result["file_url"],
        "signature_type": profile.signature_type,
        "signature_image": profile.signature_image,
        "initials_image": profile.initials_image,
        "signature_hash": profile.signature_hash,
        "initials_hash": profile.initials_hash,
    }


@frappe.whitelist()
def save_uploaded_profile_image(kind, data_url):
    profile = get_current_user_profile()

    result = attach_signature_png(
        reference_doctype="Frappe Sign Profile",
        reference_name=profile.name,
        kind=kind,
        data_url=data_url,
    )

    profile.set(result["fieldname"], result["file_url"])

    if kind == "signature":
        profile.signature_type = "Uploaded"

    profile.save(ignore_permissions=True)

    return {
        "status": "saved",
        "kind": kind,
        "fieldname": result["fieldname"],
        "file_url": result["file_url"],
        "signature_type": profile.signature_type,
        "signature_image": profile.signature_image,
        "initials_image": profile.initials_image,
        "signature_hash": profile.signature_hash,
        "initials_hash": profile.initials_hash,
    }


@frappe.whitelist()
def remove_profile_image(kind):
    profile = get_current_user_profile()

    if kind == "signature":
        profile.signature_image = None
        profile.signature_hash = None

        if profile.signature_type in ("Drawn", "Uploaded"):
            profile.signature_type = "Uploaded"

    elif kind == "initials":
        profile.initials_image = None
        profile.initials_hash = None

    else:
        frappe.throw(_("Invalid image type."))

    profile.save(ignore_permissions=True)

    return {
        "status": "removed",
        "kind": kind,
        "signature_type": profile.signature_type,
        "signature_image": profile.signature_image,
        "initials_image": profile.initials_image,
        "signature_hash": profile.signature_hash,
        "initials_hash": profile.initials_hash,
    }