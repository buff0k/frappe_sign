# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt


import frappe


ADMIN_ROLES = {"System Manager", "Frappe Sign Manager"}
SENDER_ROLES = {"Frappe Sign Sender"}
SIGNER_ROLES = {"Frappe Sign User"}


def get_roles(user=None):
    user = user or frappe.session.user
    return set(frappe.get_roles(user))


def is_frappe_sign_admin(user=None):
    return bool(get_roles(user) & ADMIN_ROLES)


def is_frappe_sign_sender(user=None):
    return bool(get_roles(user) & (ADMIN_ROLES | SENDER_ROLES))


def is_frappe_sign_user(user=None):
    return bool(get_roles(user) & (ADMIN_ROLES | SENDER_ROLES | SIGNER_ROLES))


def is_request_signer(request_name, user):
    if not request_name or not user or user == "Guest":
        return False

    return bool(
        frappe.db.exists(
            "Frappe Sign Signer",
            {
                "parenttype": "Frappe Sign Request",
                "parent": request_name,
                "user": user,
            },
        )
    )


def frappe_sign_request_query(user=None):
    user = user or frappe.session.user

    if not user or user == "Guest":
        return "1 = 0"

    if is_frappe_sign_admin(user):
        return None

    escaped_user = frappe.db.escape(user)

    return f"""
        (
            `tabFrappe Sign Request`.`owner` = {escaped_user}
            OR `tabFrappe Sign Request`.`created_by` = {escaped_user}
            OR EXISTS (
                SELECT 1
                FROM `tabFrappe Sign Signer`
                WHERE `tabFrappe Sign Signer`.`parenttype` = 'Frappe Sign Request'
                AND `tabFrappe Sign Signer`.`parent` = `tabFrappe Sign Request`.`name`
                AND `tabFrappe Sign Signer`.`user` = {escaped_user}
            )
        )
    """


def has_frappe_sign_request_permission(doc, user=None, permission_type=None):
    user = user or frappe.session.user

    if not user or user == "Guest":
        return False

    if is_frappe_sign_admin(user):
        return True

    if doc.owner == user or doc.get("created_by") == user:
        return permission_type in (None, "read", "write", "create", "submit")

    if is_request_signer(doc.name, user):
        return permission_type in (None, "read", "write")

    return False


def frappe_sign_event_query(user=None):
    return _linked_to_visible_request_query("Frappe Sign Event", "frappe_sign_request", user)


def has_frappe_sign_event_permission(doc, user=None, permission_type=None):
    return _has_linked_request_permission(doc, "frappe_sign_request", user, permission_type)


def frappe_sign_certificate_query(user=None):
    return _linked_to_visible_request_query("Frappe Sign Certificate", "frappe_sign_request", user)


def has_frappe_sign_certificate_permission(doc, user=None, permission_type=None):
    return _has_linked_request_permission(doc, "frappe_sign_request", user, permission_type)


def frappe_sign_file_hash_query(user=None):
    return _linked_to_visible_request_query("Frappe Sign File Hash", "frappe_sign_request", user)


def has_frappe_sign_file_hash_permission(doc, user=None, permission_type=None):
    return _has_linked_request_permission(doc, "frappe_sign_request", user, permission_type)


def frappe_sign_profile_query(user=None):
    user = user or frappe.session.user

    if not user or user == "Guest":
        return "1 = 0"

    if is_frappe_sign_admin(user):
        return None

    escaped_user = frappe.db.escape(user)

    return f"""
        `tabFrappe Sign Profile`.`user` = {escaped_user}
    """


def has_frappe_sign_profile_permission(doc, user=None, permission_type=None):
    user = user or frappe.session.user

    if not user or user == "Guest":
        return False

    if is_frappe_sign_admin(user):
        return True

    return doc.user == user


def _linked_to_visible_request_query(child_doctype, link_field, user=None):
    user = user or frappe.session.user

    if not user or user == "Guest":
        return "1 = 0"

    if is_frappe_sign_admin(user):
        return None

    escaped_user = frappe.db.escape(user)

    return f"""
        EXISTS (
            SELECT 1
            FROM `tabFrappe Sign Request`
            WHERE `tabFrappe Sign Request`.`name` = `tab{child_doctype}`.`{link_field}`
            AND (
                `tabFrappe Sign Request`.`owner` = {escaped_user}
                OR `tabFrappe Sign Request`.`created_by` = {escaped_user}
                OR EXISTS (
                    SELECT 1
                    FROM `tabFrappe Sign Signer`
                    WHERE `tabFrappe Sign Signer`.`parenttype` = 'Frappe Sign Request'
                    AND `tabFrappe Sign Signer`.`parent` = `tabFrappe Sign Request`.`name`
                    AND `tabFrappe Sign Signer`.`user` = {escaped_user}
                )
            )
        )
    """


def _has_linked_request_permission(doc, link_field, user=None, permission_type=None):
    user = user or frappe.session.user

    if permission_type not in (None, "read"):
        return is_frappe_sign_admin(user)

    request_name = doc.get(link_field)

    if not request_name:
        return False

    request = frappe.get_doc("Frappe Sign Request", request_name)
    return has_frappe_sign_request_permission(request, user=user, permission_type="read")


def has_app_permission():
    roles = set(frappe.get_roles())
    return bool(
        roles
        & {
            "System Manager",
            "Frappe Sign Manager",
            "Frappe Sign Sender",
            "Frappe Sign User",
        }
    )