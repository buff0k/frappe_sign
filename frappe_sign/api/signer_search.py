# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe
from frappe.desk.search import sanitize_searchfield


SEARCH_ROLES = {
	"System Manager",
	"Frappe Sign Manager",
	"Frappe Sign Sender",
}


def can_search_signer_profiles():
	roles = set(frappe.get_roles())
	return bool(roles & SEARCH_ROLES)


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def search_signer_profiles(doctype, txt, searchfield, start, page_len, filters):
	if not can_search_signer_profiles():
		return []

	searchfield = sanitize_searchfield(searchfield)

	if searchfield not in {"name", "full_name", "email"}:
		searchfield = "full_name"

	search_text = f"%{txt}%"
	starts_with = f"{txt}%"

	return frappe.db.sql(
		"""
		SELECT
			name,
			CONCAT_WS(' - ', full_name, email) AS description
		FROM `tabFrappe Sign Profile`
		WHERE active = 1
		AND (
			name LIKE %(search_text)s
			OR full_name LIKE %(search_text)s
			OR email LIKE %(search_text)s
		)
		ORDER BY
			CASE
				WHEN full_name LIKE %(starts_with)s THEN 0
				WHEN email LIKE %(starts_with)s THEN 1
				WHEN name LIKE %(starts_with)s THEN 2
				ELSE 3
			END,
			full_name ASC,
			email ASC,
			name ASC
		LIMIT %(start)s, %(page_len)s
		""",
		{
			"search_text": search_text,
			"starts_with": starts_with,
			"start": start,
			"page_len": page_len,
		},
	)


@frappe.whitelist()
def get_signer_profile_snapshot(profile_name):
	if not can_search_signer_profiles():
		frappe.throw("You do not have permission to select signer profiles.")

	if not profile_name:
		frappe.throw("Signer profile is required.")

	profile = frappe.db.get_value(
		"Frappe Sign Profile",
		{
			"name": profile_name,
			"active": 1,
		},
		[
			"name",
			"full_name",
			"email",
			"active",
			"consent",
		],
		as_dict=True,
	)

	if not profile:
		frappe.throw("Signer profile was not found or is inactive.")

	return profile