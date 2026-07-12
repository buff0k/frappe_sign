# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt


import hashlib
import json

import frappe
from frappe.utils import now_datetime


def sha256_bytes(data):
	return hashlib.sha256(data).hexdigest()


def sha256_text(value):
	return hashlib.sha256(value.encode("utf-8")).hexdigest()


def get_last_event_hash(request_name):
	if not frappe.db.has_column("Frappe Sign Event", "event_hash"):
		frappe.throw(
			"Frappe Sign Event is missing required field 'event_hash'. "
			"Please add the Event Hash field and run bench migrate."
		)

	return frappe.db.get_value(
		"Frappe Sign Event",
		{"frappe_sign_request": request_name},
		"event_hash",
		order_by="creation desc",
	)


def append_event(
	request_name,
	event_type,
	signer_email=None,
	user=None,
	details=None,
	document_hash=None,
	ip_address=None,
	user_agent=None,
):
	user = user or get_current_user()
	details = details or {}

	previous_hash = get_last_event_hash(request_name)
	timestamp = now_datetime()

	payload = {
		"request": request_name,
		"event_type": event_type,
		"signer_email": signer_email,
		"user": user,
		"details": details,
		"document_hash": document_hash,
		"previous_hash": previous_hash,
		"timestamp": str(timestamp),
	}

	event_hash = sha256_text(json.dumps(payload, sort_keys=True, default=str))

	event = frappe.get_doc(
		{
			"doctype": "Frappe Sign Event",
			"frappe_sign_request": request_name,
			"event_type": event_type,
			"signer_email": signer_email,
			"user": user if user and user != "Guest" else None,
			"ip_address": ip_address if ip_address is not None else get_request_ip(),
			"user_agent": user_agent if user_agent is not None else get_request_user_agent(),
			"details_json": json.dumps(details, indent=2, default=str),
			"previous_hash": previous_hash,
			"event_hash": event_hash,
			"document_hash": document_hash,
			"timestamp": timestamp,
		}
	)

	event.flags.ignore_permissions = True
	event.insert()

	frappe.db.set_value(
		"Frappe Sign Request",
		request_name,
		"audit_chain_hash",
		event_hash,
		update_modified=False,
	)

	return event_hash


def get_current_user():
	try:
		user = frappe.session.user
	except Exception:
		return "Administrator"

	if not user:
		return "Administrator"

	return user


def get_request_ip():
	try:
		return getattr(frappe.local, "request_ip", None)
	except Exception:
		return None


def get_request_user_agent():
	try:
		request = getattr(frappe.local, "request", None)
	except Exception:
		return None

	if not request:
		return None

	try:
		headers = getattr(request, "headers", None)
	except Exception:
		return None

	if not headers:
		return None

	try:
		return headers.get("User-Agent")
	except Exception:
		return None