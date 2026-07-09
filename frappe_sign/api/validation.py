# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe

from frappe_sign.utils.validation import (
    decode_pdf_data_url,
    validate_signed_pdf_and_certificate_bytes,
    validate_signed_pdf_bytes,
)


@frappe.whitelist()
def validate_signed_pdf(pdf_data_url, certificate_data_url=None):
    if not frappe.has_permission("Frappe Sign Request", "read"):
        frappe.throw("You do not have permission to validate Frappe Sign documents.")

    pdf_bytes = decode_pdf_data_url(pdf_data_url)

    if certificate_data_url:
        certificate_bytes = decode_pdf_data_url(certificate_data_url)
        return validate_signed_pdf_and_certificate_bytes(pdf_bytes, certificate_bytes)

    return validate_signed_pdf_bytes(pdf_bytes)