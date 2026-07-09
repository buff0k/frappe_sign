# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class FrappeSignCertificate(Document):
    def autoname(self):
        if not self.frappe_sign_request:
            frappe.throw("Frappe Sign Request is required.")

        suffix = "AUDIT" if self.certificate_type == "Audit Certificate" else "FINAL"

        base_name = f"{self.frappe_sign_request}-{suffix}"
        self.name = make_unique_certificate_name(base_name)

    def validate(self):
        self.validate_read_only_evidence_record()

    def validate_read_only_evidence_record(self):
        if not self.frappe_sign_request:
            frappe.throw("Frappe Sign Request is required.")

        if self.certificate_type not in ("Audit Certificate", "Final Verification Package"):
            frappe.throw("Invalid Certificate Type.")

        if self.certificate_type == "Audit Certificate":
            if not self.audit_certificate_url:
                frappe.throw("Audit Certificate URL is required.")

            if not self.audit_certificate_hash:
                frappe.throw("Audit Certificate Hash is required.")

        if self.certificate_type == "Final Verification Package":
            if not self.final_pdf_url:
                frappe.throw("Final Verification PDF URL is required.")

            if not self.final_pdf_hash:
                frappe.throw("Final Verification PDF Hash is required.")


def make_unique_certificate_name(base_name):
    if not frappe.db.exists("Frappe Sign Certificate", base_name):
        return base_name

    counter = 1

    while True:
        candidate = f"{base_name}-{counter}"

        if not frappe.db.exists("Frappe Sign Certificate", candidate):
            return candidate

        counter += 1


@frappe.whitelist()
def verify_tamper_status(certificate_name):
    certificate = frappe.get_doc("Frappe Sign Certificate", certificate_name)

    if not frappe.has_permission("Frappe Sign Certificate", "read", doc=certificate):
        frappe.throw("You do not have permission to verify this certificate.")

    from frappe_sign.utils.tamper import verify_certificate_tamper_status

    return verify_certificate_tamper_status(
        certificate_name=certificate.name,
        triggered_by="Manual",
    )