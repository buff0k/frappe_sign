# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime

from frappe_sign.utils.audit import sha256_bytes
from frappe_sign.utils.files import get_file_bytes


class FrappeSignProfile(Document):
    def validate(self):
        self.populate_user_details()
        self.validate_consent()
        self.update_hashes()

    def populate_user_details(self):
        if not self.user:
            frappe.throw("User is required.")

        user = frappe.get_doc("User", self.user)
        self.full_name = user.full_name
        self.email = user.email

    def validate_consent(self):
        if self.consent and not self.consent_on:
            self.consent_on = now_datetime()

        if not self.consent:
            self.consent_on = None

    def update_hashes(self):
        if self.signature_image:
            self.signature_hash = sha256_bytes(get_file_bytes(self.signature_image))

        if self.initials_image:
            self.initials_hash = sha256_bytes(get_file_bytes(self.initials_image))