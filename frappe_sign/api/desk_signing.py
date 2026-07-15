# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

from urllib.parse import urlparse

import frappe


OPEN_SIGNER_STATUSES = ("Pending", "Sent", "Viewed")
ACTIVE_REQUEST_STATUSES = ("Sent", "Viewed", "Partially Signed")
CLOSED_REQUEST_STATUSES = ("Completed", "Declined", "Expired", "Cancelled", "Failed")


@frappe.whitelist()
def get_my_signing_page_context():
	user = frappe.session.user

	if not user or user == "Guest":
		return {
			"status": "not_logged_in",
			"message": "Please log in before signing documents.",
			"profiles": [],
			"requests": [],
		}

	profiles = get_current_user_profiles(user)

	if not profiles:
		return {
			"status": "no_profile",
			"message": "No active Frappe Sign Profile is linked to your user or email address.",
			"profiles": [],
			"requests": [],
		}

	requests = get_outstanding_signing_requests_for_profiles(profiles)

	return {
		"status": "ok",
		"message": None,
		"profiles": profiles,
		"requests": requests,
	}


@frappe.whitelist()
def get_desk_signing_token(signer_row_name):
	user = frappe.session.user

	if not user or user == "Guest":
		frappe.throw("Please log in before signing documents.")

	if not signer_row_name:
		frappe.throw("Signer row is required.")

	profiles = get_current_user_profiles(user)

	if not profiles:
		frappe.throw("No active Frappe Sign Profile is linked to your user or email address.")

	profile_names = {profile["name"] for profile in profiles}

	signer = frappe.db.get_value(
		"Frappe Sign Signer",
		{
			"name": signer_row_name,
			"parenttype": "Frappe Sign Request",
		},
		[
			"name",
			"parent",
			"signer",
			"role",
			"status",
			"signing_order",
			"signing_link",
		],
		as_dict=True,
	)

	if not signer:
		frappe.throw("Signing request was not found.")

	if signer.signer not in profile_names:
		frappe.throw("You are not the signer for this signing request.")

	if signer.role != "Signer":
		frappe.throw("This row is not a signer row.")

	if signer.status not in OPEN_SIGNER_STATUSES:
		frappe.throw("This signing request has already been signed or is no longer available.")

	request = frappe.db.get_value(
		"Frappe Sign Request",
		signer.parent,
		[
			"name",
			"status",
			"signing_mode",
			"current_signing_order",
		],
		as_dict=True,
	)

	if not request:
		frappe.throw("Signing request was not found.")

	if request.status in CLOSED_REQUEST_STATUSES or request.status not in ACTIVE_REQUEST_STATUSES:
		frappe.throw(f"This signing request is {request.status}.")

	if request.signing_mode == "Sequential":
		current_order = request.current_signing_order or 1
		signer_order = signer.signing_order or 1

		if signer_order > current_order:
			frappe.throw("This signing request is waiting for an earlier signer.")

		if signer_order < current_order:
			frappe.throw("This signing request is no longer available for this signer.")

	if not signer.signing_link:
		frappe.throw("No signing link has been generated for this signer.")

	token = extract_token_from_signing_link(signer.signing_link)

	if not token:
		frappe.throw("Could not read the signing token for this signer.")

	return {
		"request": request.name,
		"signer": signer.name,
		"token": token,
	}


def get_current_user_profiles(user):
	user_email = frappe.db.get_value("User", user, "email")

	if user_email:
		return frappe.db.sql(
			"""
			SELECT
				name,
				user,
				full_name,
				email
			FROM `tabFrappe Sign Profile`
			WHERE `active` = 1
			AND (
				`user` = %(user)s
				OR `email` = %(email)s
			)
			ORDER BY
				COALESCE(full_name, email, name) ASC,
				name ASC
			""",
			{
				"user": user,
				"email": user_email,
			},
			as_dict=True,
		)

	return frappe.db.sql(
		"""
		SELECT
			name,
			user,
			full_name,
			email
		FROM `tabFrappe Sign Profile`
		WHERE `active` = 1
		AND `user` = %(user)s
		ORDER BY
			COALESCE(full_name, email, name) ASC,
			name ASC
		""",
		{
			"user": user,
		},
		as_dict=True,
	)


def get_outstanding_signing_requests_for_profiles(profiles):
	if not profiles:
		return []

	profile_names = tuple(profile["name"] for profile in profiles)

	if not profile_names:
		return []

	rows = frappe.db.sql(
		"""
		SELECT
			signer.name AS signer_row,
			signer.parent AS request_name,
			signer.signer AS profile,
			signer.full_name AS signer_full_name,
			signer.email AS signer_email,
			signer.status AS signer_status,
			signer.signing_order AS signing_order,
			request.request_title AS request_title,
			request.status AS request_status,
			request.signing_mode AS signing_mode,
			request.current_signing_order AS current_signing_order,
			request.expires_on AS expires_on,
			request.modified AS modified
		FROM `tabFrappe Sign Signer` signer
		INNER JOIN `tabFrappe Sign Request` request
			ON request.name = signer.parent
		WHERE signer.parenttype = 'Frappe Sign Request'
		AND signer.role = 'Signer'
		AND signer.status IN %(open_signer_statuses)s
		AND signer.signer IN %(profile_names)s
		AND request.status IN %(active_request_statuses)s
		ORDER BY
			request.modified DESC,
			request.creation DESC,
			request.name ASC
		""",
		{
			"open_signer_statuses": OPEN_SIGNER_STATUSES,
			"profile_names": profile_names,
			"active_request_statuses": ACTIVE_REQUEST_STATUSES,
		},
		as_dict=True,
	)

	requests = []

	for row in rows:
		signing_order = row.signing_order or 1
		current_order = row.current_signing_order or 1
		can_sign_now = True
		waiting_message = None

		if row.signing_mode == "Sequential":
			if signing_order > current_order:
				can_sign_now = False
				waiting_message = f"Waiting for signing order {current_order} to complete."

			if signing_order < current_order:
				can_sign_now = False
				waiting_message = "This signing step has already passed."

		requests.append(
			{
				"request": row.request_name,
				"title": row.request_title or row.request_name,
				"status": row.request_status,
				"signer_row": row.signer_row,
				"signer_status": row.signer_status,
				"signer_full_name": row.signer_full_name,
				"signer_email": row.signer_email,
				"profile": row.profile,
				"signing_mode": row.signing_mode,
				"signing_order": signing_order,
				"current_signing_order": current_order,
				"can_sign_now": can_sign_now,
				"waiting_message": waiting_message,
				"expires_on": row.expires_on,
				"modified": row.modified,
			}
		)

	return requests


def extract_token_from_signing_link(signing_link):
	if not signing_link:
		return None

	value = str(signing_link).strip()

	if not value:
		return None

	if "/sign/" in value:
		parsed = urlparse(value)
		path = parsed.path or value
		token = path.rsplit("/sign/", 1)[-1]
		return token.strip("/") or None

	return value.strip("/") or None