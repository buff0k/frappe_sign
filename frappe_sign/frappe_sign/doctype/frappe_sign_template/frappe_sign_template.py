# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from frappe_sign.api.source import print_format_matches_doctype, validate_source_doctype


class FrappeSignTemplate(Document):
    def autoname(self):
        if not self.template_name:
            frappe.throw("Template Name is required before naming the Frappe Sign Template.")

        self.name = make_unique_template_name(self.template_name)

    def validate(self):
        self.validate_source()
        self.validate_signers()
        self.validate_fields()

    def validate_source(self):
        if not self.source_doctype:
            frappe.throw("Source DocType is required.")

        validate_source_doctype(self.source_doctype)

        if not self.print_format:
            frappe.throw("Print Format is required.")

        if not print_format_matches_doctype(self.print_format, self.source_doctype):
            frappe.throw("The selected Print Format is not valid for the selected Source DocType.")

    def validate_signers(self):
        if not self.signers:
            frappe.throw("At least one Template Signer is required.")

        seen_labels = set()

        for signer in self.signers:
            if not signer.signer_label:
                frappe.throw("Each Template Signer requires a Signer Label.")

            normalized_label = signer.signer_label.strip().lower()

            if normalized_label in seen_labels:
                frappe.throw(f"Duplicate Template Signer Label: {signer.signer_label}")

            seen_labels.add(normalized_label)

            if not signer.role:
                signer.role = "Signer"

            if not signer.signing_order:
                signer.signing_order = 1

    def validate_fields(self):
        valid_signer_labels = {
            signer.signer_label
            for signer in self.signers
            if signer.role == "Signer"
        }

        for field in self.fields:
            if not field.signer_label:
                frappe.throw("Each template field requires a Signer Label.")

            if field.signer_label not in valid_signer_labels:
                frappe.throw(
                    f"Template field uses signer label '{field.signer_label}', "
                    "but that label is not listed in Template Signers."
                )

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


def make_unique_template_name(base_name):
    if not frappe.db.exists("Frappe Sign Template", base_name):
        return base_name

    counter = 1

    while True:
        candidate = f"{base_name} - {counter}"

        if not frappe.db.exists("Frappe Sign Template", candidate):
            return candidate

        counter += 1