# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime

from frappe_sign.utils.audit import append_event


class FrappeSignRequest(Document):
    def before_insert(self):
        if not self.created_by:
            self.created_by = frappe.session.user

    def validate(self):
        self.validate_source()
        self.validate_status()
        self.validate_signers()
        self.validate_fields()

    def before_submit(self):
        if self.status != "Completed":
            frappe.throw("Only completed signing requests can be submitted.")

        if not self.signed_pdf and not self.certificate_signed_pdf:
            frappe.throw("A signed PDF is required before submission.")

    def on_submit(self):
        append_event(
            self.name,
            "Completed",
            details={"docstatus": self.docstatus},
            document_hash=self.signed_pdf_hash or self.certificate_signed_pdf_hash,
        )

    def validate_source(self):
        if not self.source_doctype:
            frappe.throw("Source DocType is required.")

        if not self.source_name:
            frappe.throw("Source Name is required.")

        if not frappe.db.exists(self.source_doctype, self.source_name):
            frappe.throw(f"{self.source_doctype} {self.source_name} does not exist.")

    def validate_status(self):
        valid_statuses = {
            "Draft",
            "Prepared",
            "Sent",
            "Viewed",
            "Partially Signed",
            "Completed",
            "Declined",
            "Expired",
            "Cancelled",
            "Failed",
        }

        if self.status not in valid_statuses:
            frappe.throw(f"Invalid Frappe Sign status: {self.status}")

    def validate_signers(self):
        seen_emails = set()

        for signer in self.signers:
            if not signer.signer_type:
                signer.signer_type = "User"

            if signer.signer_type == "User":
                if not signer.user:
                    frappe.throw("User signer requires a linked User.")

                user = frappe.get_doc("User", signer.user)

                signer.email = signer.email or user.email
                signer.full_name = signer.full_name or user.full_name

            if signer.signer_type == "External":
                if not signer.full_name:
                    frappe.throw("External signer requires Full Name.")

                if not signer.email:
                    frappe.throw("External signer requires Email.")

            if not signer.email:
                frappe.throw("Each signer requires an email address.")

            normalized = signer.email.strip().lower()

            if normalized in seen_emails:
                frappe.throw(f"Duplicate signer email: {signer.email}")

            seen_emails.add(normalized)

            if not signer.role:
                signer.role = "Signer"

            if not signer.status:
                signer.status = "Pending"

            if not signer.signing_order:
                signer.signing_order = 1

    def validate_fields(self):
        for field in self.fields:
            if not field.field_type:
                frappe.throw("Each signing field requires a Field Type.")

            if not field.page or field.page < 1:
                frappe.throw("Each signing field requires a valid page number.")

            for ratio_field in ("x_ratio", "y_ratio", "width_ratio", "height_ratio"):
                value = field.get(ratio_field)

                if value is None:
                    frappe.throw(f"{ratio_field} is required for each signing field.")

                if value < 0 or value > 1:
                    frappe.throw(f"{ratio_field} must be between 0 and 1.")

            if not field.signer and field.field_type in ("Signature", "Initials"):
                frappe.throw("Signature and Initials fields must be assigned to a signer.")

    def mark_failed(self, message):
        self.status = "Failed"
        self.add_comment("Comment", message)
        self.save(ignore_permissions=True)

    def mark_cancelled(self):
        self.status = "Cancelled"
        self.cancelled_on = now_datetime()
        self.save(ignore_permissions=True)

        append_event(
            self.name,
            "Cancelled",
            details={"cancelled_by": frappe.session.user},
        )