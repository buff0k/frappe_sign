# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class FrappeSignFileHash(Document):
    def before_save(self):
        if not getattr(self.flags, "ignore_permissions", False):
            frappe.throw("Frappe Sign File Hash records are system generated and cannot be edited manually.")

    def on_trash(self):
        if not getattr(self.flags, "ignore_permissions", False):
            frappe.throw("Frappe Sign File Hash records cannot be deleted.")