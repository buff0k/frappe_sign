# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class FrappeSignTemplate(Document):
    def validate(self):
        self.validate_source()
        self.validate_fields()

    def validate_source(self):
        if not self.source_doctype:
            frappe.throw("Source DocType is required.")

        if not self.print_format:
            frappe.throw("Print Format is required.")

    def validate_fields(self):
        for field in self.fields:
            if not field.signer_label:
                frappe.throw("Each template field requires a Signer Label.")

            if not field.field_type:
                frappe.throw("Each template field requires a Field Type.")

            if not field.page or field.page < 1:
                frappe.throw("Each template field requires a valid page number.")

            for ratio_field in ("x_ratio", "y_ratio", "width_ratio", "height_ratio"):
                value = field.get(ratio_field)

                if value is None:
                    frappe.throw(f"{ratio_field} is required for each template field.")

                if value < 0 or value > 1:
                    frappe.throw(f"{ratio_field} must be between 0 and 1.")