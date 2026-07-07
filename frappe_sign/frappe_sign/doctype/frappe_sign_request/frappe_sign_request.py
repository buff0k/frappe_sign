# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime, formatdate, today

from frappe_sign.utils.audit import append_event
from frappe_sign.utils.audit import sha256_bytes
from frappe_sign.utils.files import get_file_bytes


class FrappeSignRequest(Document):
    def autoname(self):
        if not self.request_title:
            frappe.throw("Request Title is required before naming the Frappe Sign Request.")

        formatted_date = formatdate(today(), "dd-MM-yyyy")
        base_name = f"{self.request_title} - {formatted_date}"

        self.name = make_unique_request_name(base_name)

    def before_insert(self):
        if not self.created_by:
            self.created_by = frappe.session.user

    def validate(self):
        self.validate_source()
        self.validate_status()
        self.validate_signers()
        self.validate_fields()
        self.validate_locked_request()
        self.set_uploaded_pdf_hash()

    def set_uploaded_pdf_hash(self):
        if self.source_type != "Uploaded PDF" or not self.source_pdf:
            return

        current_hash = sha256_bytes(get_file_bytes(self.source_pdf))

        if self.source_pdf_hash and self.source_pdf_hash != current_hash:
            if self.fields:
                frappe.throw(
                    "The source PDF has changed after fields were added. "
                    "Clear the signing fields before replacing the source PDF."
                )

        self.source_pdf_hash = current_hash

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
        if not self.source_type:
            self.source_type = "Frappe Document"

        if self.source_type == "Frappe Document":
            if not self.source_doctype:
                frappe.throw("Source DocType is required.")

            if not self.source_name:
                frappe.throw("Source Name is required.")

            if not frappe.db.exists(self.source_doctype, self.source_name):
                frappe.throw(f"{self.source_doctype} {self.source_name} does not exist.")

            if not self.print_format:
                frappe.throw("Print Format is required for Frappe Document signing requests.")

        elif self.source_type == "Uploaded PDF":
            if not self.source_pdf:
                frappe.throw("Source PDF is required for uploaded PDF signing requests.")

        else:
            frappe.throw(f"Invalid Source Type: {self.source_type}")

    def validate_status(self):
        if not self.status:
            self.status = "Draft"

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

                if not user.email:
                    frappe.throw(f"User {signer.user} does not have an email address.")

                signer.email = user.email
                signer.full_name = user.full_name

            if signer.signer_type == "External":
                signer.user = None

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

    def validate_locked_request(self):
        if self.is_new():
            return

        old = self.get_doc_before_save()

        if not old:
            return

        if old.status not in (
            "Sent",
            "Viewed",
            "Partially Signed",
            "Completed",
            "Declined",
            "Expired",
            "Cancelled",
            "Failed",
        ):
            return

        locked_fields = [
            "source_type",
            "source_doctype",
            "source_name",
            "print_format",
            "source_pdf",
        ]

        for fieldname in locked_fields:
            if self.get(fieldname) != old.get(fieldname):
                frappe.throw(
                    f"{frappe.unscrub(fieldname)} cannot be changed after the request has been sent."
                )

        if self.fields_have_changed(old):
            frappe.throw("Signing fields cannot be changed after the request has been sent.")

    def fields_have_changed(self, old):
        current_fields = [
            {
                "signer": row.signer,
                "signer_label": row.signer_label,
                "field_type": row.field_type,
                "page": row.page,
                "x_ratio": row.x_ratio,
                "y_ratio": row.y_ratio,
                "width_ratio": row.width_ratio,
                "height_ratio": row.height_ratio,
                "required": row.required,
                "read_only": row.read_only,
                "default_value": row.default_value,
            }
            for row in self.fields
        ]

        old_fields = [
            {
                "signer": row.signer,
                "signer_label": row.signer_label,
                "field_type": row.field_type,
                "page": row.page,
                "x_ratio": row.x_ratio,
                "y_ratio": row.y_ratio,
                "width_ratio": row.width_ratio,
                "height_ratio": row.height_ratio,
                "required": row.required,
                "read_only": row.read_only,
                "default_value": row.default_value,
            }
            for row in old.fields
        ]

        return current_fields != old_fields

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


def make_unique_request_name(base_name):
    if not frappe.db.exists("Frappe Sign Request", base_name):
        return base_name

    counter = 1

    while True:
        candidate = f"{base_name} - {counter}"

        if not frappe.db.exists("Frappe Sign Request", candidate):
            return candidate

        counter += 1