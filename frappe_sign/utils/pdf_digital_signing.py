# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

from io import BytesIO
from tempfile import NamedTemporaryFile

import frappe


def digitally_sign_pdf(
    pdf_bytes,
    certificate_bytes,
    password=None,
    reason=None,
    location=None,
    field_name="FrappeSignDigitalSignature",
):
    """
    Apply a real cryptographic PDF signature using pyHanko.

    This expects a PKCS#12 / PFX certificate file.
    """

    if not pdf_bytes:
        frappe.throw("Cannot digitally sign an empty PDF.")

    if not certificate_bytes:
        frappe.throw("Certificate file is required for certificate-based PDF signing.")

    try:
        from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
        from pyhanko.sign import fields, signers
    except Exception:
        frappe.throw(
            "pyHanko is required for certificate-based PDF signing. "
            "Run bench setup requirements or reinstall the app dependencies."
        )

    passphrase = None

    if password:
        passphrase = str(password).encode("utf-8")

    try:
        with NamedTemporaryFile(suffix=".p12") as certificate_file:
            certificate_file.write(certificate_bytes)
            certificate_file.flush()

            signer = signers.SimpleSigner.load_pkcs12(
                pfx_file=certificate_file.name,
                passphrase=passphrase,
            )

            writer = IncrementalPdfFileWriter(BytesIO(pdf_bytes))

            signature_meta = signers.PdfSignatureMetadata(
                field_name=field_name,
                reason=reason or "Frappe Sign certificate-based PDF signature",
                location=location,
            )

            field_spec = fields.SigFieldSpec(
                sig_field_name=field_name,
                box=(0, 0, 0, 0),
            )

            output = signers.sign_pdf(
                writer,
                signature_meta=signature_meta,
                signer=signer,
                new_field_spec=field_spec,
            )

            return output.getvalue()

    except Exception as error:
        frappe.throw(f"Certificate-based PDF signing failed: {error}")