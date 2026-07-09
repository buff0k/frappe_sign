# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import re

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime

from frappe_sign.utils.audit import sha256_bytes
from frappe_sign.utils.files import get_file_bytes
from frappe_sign.utils.signatures import attach_signature_png


class FrappeSignProfile(Document):
    def autoname(self):
        self.populate_user_details()
        self.normalize_email()
        self.validate_identity()

        base_name = make_profile_name(self.full_name, self.email)
        self.name = make_unique_profile_name(base_name)

    def validate(self):
        self.populate_user_details()
        self.normalize_email()
        self.validate_identity()
        self.validate_unique_email()
        self.validate_consent()
        self.update_hashes()

    def populate_user_details(self):
        """
        If linked to a Frappe User, Full Name and Email are authoritative from User.
        If no User is linked, this is an external signer profile and Full Name / Email
        must be manually supplied.
        """
        if not self.user:
            return

        user = frappe.get_doc("User", self.user)

        if not user.email:
            frappe.throw(f"Linked User {self.user} does not have an email address.")

        self.full_name = user.full_name
        self.email = user.email

    def normalize_email(self):
        if self.email:
            self.email = self.email.strip().lower()

    def validate_identity(self):
        if not self.full_name:
            frappe.throw("Full Name is required.")

        if not self.email:
            frappe.throw("Email is required.")

    def validate_unique_email(self):
        if not self.email:
            return

        existing = frappe.get_all(
            "Frappe Sign Profile",
            filters={
                "email": self.email,
                "name": ["!=", self.name],
            },
            pluck="name",
            limit=1,
        )

        if existing:
            frappe.throw(
                f"A Frappe Sign Profile already exists for email address {self.email}: {existing[0]}"
            )

    def validate_consent(self):
        if self.consent and not self.consent_on:
            self.consent_on = now_datetime()

        if not self.consent:
            self.consent_on = None

    def update_hashes(self):
        if self.signature_image:
            self.signature_hash = sha256_bytes(get_file_bytes(self.signature_image))
        else:
            self.signature_hash = None

        if self.initials_image:
            self.initials_hash = sha256_bytes(get_file_bytes(self.initials_image))
        else:
            self.initials_hash = None


def make_profile_name(full_name, email):
    full_name = (full_name or "").strip()
    email = (email or "").strip().lower()

    base_name = f"{full_name} - {email}"

    base_name = re.sub(r"[\r\n\t/\\]+", " ", base_name)
    base_name = re.sub(r"\s+", " ", base_name).strip()

    return base_name


def make_unique_profile_name(base_name):
    if not frappe.db.exists("Frappe Sign Profile", base_name):
        return base_name

    counter = 1

    while True:
        candidate = f"{base_name} - {counter}"

        if not frappe.db.exists("Frappe Sign Profile", candidate):
            return candidate

        counter += 1


@frappe.whitelist()
def save_drawn_signature(profile_name, kind, data_url):
    profile = frappe.get_doc("Frappe Sign Profile", profile_name)

    if not frappe.has_permission("Frappe Sign Profile", "write", doc=profile):
        frappe.throw("You do not have permission to update this Frappe Sign Profile.")

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
        "signature_hash": profile.signature_hash,
        "initials_hash": profile.initials_hash,
    }