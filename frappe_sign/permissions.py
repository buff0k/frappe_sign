# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe


ADMIN_ROLES = {
	"System Manager",
	"Frappe Sign Manager",
}

SENDER_ROLES = {
	"Frappe Sign Sender",
}

SIGNER_ROLES = {
	"Frappe Sign User",
	"Frappe Sign Signer",
}


def get_roles(user=None):
	user = user or frappe.session.user

	if not user or user == "Guest":
		return set()

	return set(frappe.get_roles(user))


def get_user_email(user=None):
	user = user or frappe.session.user

	if not user or user == "Guest":
		return None

	return frappe.db.get_value("User", user, "email")


def is_frappe_sign_admin(user=None):
	return bool(get_roles(user) & ADMIN_ROLES)


def is_frappe_sign_sender(user=None):
	return bool(get_roles(user) & SENDER_ROLES)


def is_frappe_sign_signer(user=None):
	return bool(get_roles(user) & SIGNER_ROLES)


def has_any_frappe_sign_role(user=None):
	return bool(get_roles(user) & (ADMIN_ROLES | SENDER_ROLES | SIGNER_ROLES))


def is_request_creator(doc, user=None):
	user = user or frappe.session.user

	if not doc or not user or user == "Guest":
		return False

	return bool(doc.get("owner") == user or doc.get("created_by") == user)


def is_request_signer(request_name, user=None):
	user = user or frappe.session.user

	if not request_name or not user or user == "Guest":
		return False

	user_email = get_user_email(user)

	filters = [
		"`tabFrappe Sign Signer`.`parenttype` = 'Frappe Sign Request'",
		"`tabFrappe Sign Signer`.`parent` = %s",
		"`tabFrappe Sign Profile`.`name` = `tabFrappe Sign Signer`.`signer`",
		"`tabFrappe Sign Profile`.`active` = 1",
	]

	values = [request_name]

	user_clauses = [
		"`tabFrappe Sign Profile`.`user` = %s",
	]
	values.append(user)

	if user_email:
		user_clauses.append("`tabFrappe Sign Profile`.`email` = %s")
		values.append(user_email)

	return bool(
		frappe.db.sql(
			f"""
			SELECT 1
			FROM `tabFrappe Sign Signer`
			INNER JOIN `tabFrappe Sign Profile`
				ON `tabFrappe Sign Profile`.`name` = `tabFrappe Sign Signer`.`signer`
			WHERE {" AND ".join(filters)}
			AND ({" OR ".join(user_clauses)})
			LIMIT 1
			""",
			values,
		)
	)


def frappe_sign_request_query(user=None):
	user = user or frappe.session.user

	if not user or user == "Guest":
		return "1 = 0"

	if is_frappe_sign_admin(user):
		return None

	if not has_any_frappe_sign_role(user):
		return "1 = 0"

	escaped_user = frappe.db.escape(user)
	user_email = get_user_email(user)
	escaped_email = frappe.db.escape(user_email) if user_email else None

	signer_match = f"""
		EXISTS (
			SELECT 1
			FROM `tabFrappe Sign Signer`
			INNER JOIN `tabFrappe Sign Profile`
				ON `tabFrappe Sign Profile`.`name` = `tabFrappe Sign Signer`.`signer`
			WHERE `tabFrappe Sign Signer`.`parenttype` = 'Frappe Sign Request'
			AND `tabFrappe Sign Signer`.`parent` = `tabFrappe Sign Request`.`name`
			AND `tabFrappe Sign Profile`.`active` = 1
			AND (
				`tabFrappe Sign Profile`.`user` = {escaped_user}
				{f"OR `tabFrappe Sign Profile`.`email` = {escaped_email}" if escaped_email else ""}
			)
		)
	"""

	if is_frappe_sign_sender(user):
		return f"""
			(
				`tabFrappe Sign Request`.`owner` = {escaped_user}
				OR `tabFrappe Sign Request`.`created_by` = {escaped_user}
				OR {signer_match}
			)
		"""

	if is_frappe_sign_signer(user):
		return signer_match

	return "1 = 0"


def has_frappe_sign_request_permission(doc, user=None, permission_type=None):
	user = user or frappe.session.user
	permission_type = permission_type or "read"

	if not user or user == "Guest":
		return False

	if is_frappe_sign_admin(user):
		return True

	if not has_any_frappe_sign_role(user):
		return False

	if permission_type == "create":
		return is_frappe_sign_sender(user)

	if is_frappe_sign_sender(user) and is_request_creator(doc, user):
		return permission_type in {
			"read",
			"write",
			"submit",
			"email",
			"print",
			"share",
			"report",
			"export",
		}

	if is_request_signer(doc.name, user):
		return permission_type in {
			"read",
			"email",
			"print",
			"export",
		}

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

	if not has_any_frappe_sign_role(user):
		return "1 = 0"

	escaped_user = frappe.db.escape(user)
	user_email = get_user_email(user)
	escaped_email = frappe.db.escape(user_email) if user_email else None

	return f"""
		(
			`tabFrappe Sign Profile`.`user` = {escaped_user}
			{f"OR `tabFrappe Sign Profile`.`email` = {escaped_email}" if escaped_email else ""}
		)
	"""


def has_frappe_sign_profile_permission(doc, user=None, permission_type=None):
	user = user or frappe.session.user
	permission_type = permission_type or "read"

	if not user or user == "Guest":
		return False

	if is_frappe_sign_admin(user):
		return True

	if not has_any_frappe_sign_role(user):
		return False

	user_email = get_user_email(user)

	is_own_profile = bool(
		doc.get("user") == user
		or (user_email and doc.get("email") == user_email)
	)

	if is_own_profile:
		return permission_type in {
			"read",
			"write",
			"create",
			"email",
			"print",
			"export",
		}

	return False


def _linked_to_visible_request_query(child_doctype, link_field, user=None):
	user = user or frappe.session.user

	if not user or user == "Guest":
		return "1 = 0"

	if is_frappe_sign_admin(user):
		return None

	if not has_any_frappe_sign_role(user):
		return "1 = 0"

	escaped_user = frappe.db.escape(user)
	user_email = get_user_email(user)
	escaped_email = frappe.db.escape(user_email) if user_email else None

	signer_match = f"""
		EXISTS (
			SELECT 1
			FROM `tabFrappe Sign Signer`
			INNER JOIN `tabFrappe Sign Profile`
				ON `tabFrappe Sign Profile`.`name` = `tabFrappe Sign Signer`.`signer`
			WHERE `tabFrappe Sign Signer`.`parenttype` = 'Frappe Sign Request'
			AND `tabFrappe Sign Signer`.`parent` = `tabFrappe Sign Request`.`name`
			AND `tabFrappe Sign Profile`.`active` = 1
			AND (
				`tabFrappe Sign Profile`.`user` = {escaped_user}
				{f"OR `tabFrappe Sign Profile`.`email` = {escaped_email}" if escaped_email else ""}
			)
		)
	"""

	if is_frappe_sign_sender(user):
		request_scope = f"""
			(
				`tabFrappe Sign Request`.`owner` = {escaped_user}
				OR `tabFrappe Sign Request`.`created_by` = {escaped_user}
				OR {signer_match}
			)
		"""
	else:
		request_scope = signer_match

	return f"""
		EXISTS (
			SELECT 1
			FROM `tabFrappe Sign Request`
			WHERE `tabFrappe Sign Request`.`name` = `tab{child_doctype}`.`{link_field}`
			AND {request_scope}
		)
	"""


def _has_linked_request_permission(doc, link_field, user=None, permission_type=None):
	user = user or frappe.session.user
	permission_type = permission_type or "read"

	if not user or user == "Guest":
		return False

	if is_frappe_sign_admin(user):
		return True

	if permission_type not in {
		"read",
		"email",
		"print",
		"export",
		"report",
	}:
		return False

	request_name = doc.get(link_field)

	if not request_name:
		return False

	request = frappe.get_doc("Frappe Sign Request", request_name)

	return has_frappe_sign_request_permission(
		request,
		user=user,
		permission_type="read",
	)


def has_app_permission():
	return has_any_frappe_sign_role()