# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import hashlib
import secrets

import frappe


def generate_signing_token():
    return secrets.token_urlsafe(48)


def hash_signing_token(token):
    secret = frappe.conf.get("frappe_sign_token_secret") or frappe.conf.get("encryption_key")

    if not secret:
        frappe.throw("Missing encryption key for Frappe Sign token hashing.")

    value = f"{secret}:{token}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()