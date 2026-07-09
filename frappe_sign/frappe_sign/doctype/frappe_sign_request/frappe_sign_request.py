# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import formatdate, now_datetime, today

from frappe_sign.api.source import print_format_matches_doctype, validate_source_doctype
from frappe_sign.utils.audit import append_event, sha256_bytes
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
        existing_completed_event = frappe.db.exists(
            "Frappe Sign Event",
            {
                "frappe_sign_request": self.name,
                "event_type": "Completed",
            },
        )

        if existing_completed_event:
            return

        append_event(
            self.name,
            "Completed",
            details={"docstatus": self.docstatus},
            document_hash=self.signed_pdf_hash or self.certificate_signed_pdf_hash,
        )

    def validate_source(self):
        if not self.source_type:
            self.source_type = "Uploaded PDF"

        if self.source_type == "Frappe Document":
            self.validate_frappe_document_source()
            return

        if self.source_type == "Uploaded PDF":
            self.validate_uploaded_pdf_source()
            return

        frappe.throw(f"Invalid Source Type: {self.source_type}")

    def validate_frappe_document_source(self):
        if not self.source_doctype:
            frappe.throw("Source DocType is required.")

        validate_source_doctype(self.source_doctype)

        if not self.source_name:
            frappe.throw("Source Name is required.")

        if not frappe.db.exists(self.source_doctype, self.source_name):
            frappe.throw(f"{self.source_doctype} {self.source_name} does not exist.")

        if not self.print_format:
            frappe.throw("Print Format is required for Frappe Document signing requests.")

        if not print_format_matches_doctype(self.print_format, self.source_doctype):
            frappe.throw("The selected Print Format is not valid for the selected Source DocType.")

    def validate_uploaded_pdf_source(self):
        if not self.source_pdf:
            frappe.throw("Source PDF is required for uploaded PDF signing requests.")

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
        seen_profiles = set()
        seen_emails = set()

        for signer in self.signers:
            if not signer.signer:
                frappe.throw("Each signer row requires a Frappe Sign Profile.")

            profile = frappe.get_doc("Frappe Sign Profile", signer.signer)

            if not profile.active:
                frappe.throw(f"Signer profile {profile.name} is not active.")

            if not profile.full_name:
                frappe.throw(f"Signer profile {profile.name} does not have a Full Name.")

            if not profile.email:
                frappe.throw(f"Signer profile {profile.name} does not have an Email.")

            if signer.signer in seen_profiles:
                frappe.throw(f"Duplicate signer profile: {profile.name}")

            seen_profiles.add(signer.signer)

            normalized_email = profile.email.strip().lower()

            if normalized_email in seen_emails:
                frappe.throw(f"Duplicate signer email: {profile.email}")

            seen_emails.add(normalized_email)

            signer.full_name = profile.full_name
            signer.email = profile.email

            if not signer.role:
                signer.role = "Signer"

            if not signer.status:
                signer.status = "Pending"

            if not signer.signing_order:
                signer.signing_order = 1

        self.normalize_signing_order()

    def normalize_signing_order(self):
        signer_rows = [
            row for row in self.signers
            if not row.role or row.role == "Signer"
        ]

        if not signer_rows:
            return

        if self.signing_mode == "Parallel":
            for signer in signer_rows:
                signer.signing_order = 1

            return

        all_default = all(
            not row.signing_order or int(row.signing_order) == 1
            for row in signer_rows
        )

        if all_default and len(signer_rows) > 1:
            order = 1

            for signer in signer_rows:
                signer.signing_order = order
                order += 1

            return

        max_order = max([int(row.signing_order or 0) for row in signer_rows])

        for signer in signer_rows:
            if not signer.signing_order or int(signer.signing_order) < 1:
                max_order += 1
                signer.signing_order = max_order

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