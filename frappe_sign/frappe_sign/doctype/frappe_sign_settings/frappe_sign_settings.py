# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import secrets
import string
from datetime import datetime, timedelta, timezone

import frappe
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
from frappe.model.document import Document
from frappe.utils import add_days, get_datetime, now_datetime

from frappe_sign.utils.files import attach_private_file, get_file_bytes


CERTIFICATE_EXPIRY_WARNING_DAYS = 30


class FrappeSignSettings(Document):
    def validate(self):
        self.validate_certificate_settings()

    def validate_certificate_settings(self):
        if not self.certificate_file:
            self.clear_certificate_metadata()
            return

        try:
            metadata = inspect_pkcs12_certificate(
                certificate_bytes=get_file_bytes(self.certificate_file),
                password=get_certificate_password(self),
            )

            apply_certificate_metadata(self, metadata)

        except Exception as error:
            self.certificate_status = "Invalid"

            if self.enable_certificate_based_pdf_signing:
                frappe.throw(
                    "Certificate-based PDF signing is enabled, but the configured certificate "
                    f"could not be inspected: {error}"
                )

        if self.enable_certificate_based_pdf_signing:
            if not self.certificate_file:
                frappe.throw(
                    "Certificate-based PDF signing is enabled, but no certificate file is configured."
                )

            if self.certificate_status not in ("Valid", "Expiring Soon"):
                frappe.throw(
                    "Certificate-based PDF signing is enabled, but the configured certificate "
                    f"status is {self.certificate_status or 'Invalid'}."
                )

    def clear_certificate_metadata(self):
        self.certificate_subject = None
        self.certificate_issuer = None
        self.certificate_serial_number = None
        self.certificate_fingerprint_sha256 = None
        self.certificate_valid_from = None
        self.certificate_valid_to = None
        self.certificate_is_self_signed = 0
        self.certificate_status = "Not Configured"


@frappe.whitelist()
def generate_self_signed_certificate(
    common_name=None,
    organisation=None,
    organisational_unit=None,
    country=None,
    validity_years=5,
    certificate_location=None,
    overwrite_existing=0,
    enable_certificate_based_pdf_signing=1,
):
    settings = get_settings_for_update()

    if settings.certificate_file and not frappe.utils.cint(overwrite_existing):
        frappe.throw(
            "A signing certificate is already configured. Enable overwrite if you want to replace it."
        )

    common_name = clean_text(common_name) or get_default_common_name()
    organisation = clean_text(organisation) or "Frappe Sign"
    organisational_unit = clean_text(organisational_unit) or "Document Signing"
    country = clean_country(country) or "ZA"
    validity_years = max(frappe.utils.cint(validity_years) or 5, 1)

    password = generate_certificate_password()

    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=3072,
    )

    now_utc = datetime.now(timezone.utc)
    valid_from = now_utc - timedelta(minutes=5)
    valid_to = now_utc + timedelta(days=365 * validity_years)

    subject = x509.Name(
        [
            x509.NameAttribute(NameOID.COUNTRY_NAME, country),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, organisation),
            x509.NameAttribute(NameOID.ORGANIZATIONAL_UNIT_NAME, organisational_unit),
            x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        ]
    )

    certificate = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(valid_from)
        .not_valid_after(valid_to)
        .add_extension(
            x509.BasicConstraints(ca=False, path_length=None),
            critical=True,
        )
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=True,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=False,
                crl_sign=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(
            x509.ExtendedKeyUsage(
                [
                    ExtendedKeyUsageOID.CODE_SIGNING,
                ]
            ),
            critical=False,
        )
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(private_key.public_key()),
            critical=False,
        )
        .sign(private_key, hashes.SHA256())
    )

    p12_bytes = pkcs12.serialize_key_and_certificates(
        name=b"Frappe Sign Document Signing Certificate",
        key=private_key,
        cert=certificate,
        cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(password.encode("utf-8")),
    )

    file_doc = attach_private_file(
        "Frappe Sign Settings",
        "Frappe Sign Settings",
        "frappe-sign-self-signed-document-signing-certificate.p12",
        p12_bytes,
    )

    settings.certificate_file = file_doc.file_url
    settings.certificate_password = password
    settings.certificate_location = certificate_location or settings.certificate_location
    settings.enable_certificate_based_pdf_signing = frappe.utils.cint(enable_certificate_based_pdf_signing)

    metadata = inspect_pkcs12_certificate(
        certificate_bytes=p12_bytes,
        password=password,
    )
    apply_certificate_metadata(settings, metadata)

    settings.save(ignore_permissions=True)

    return {
        "status": "generated",
        "certificate_file": settings.certificate_file,
        "certificate_status": settings.certificate_status,
        "certificate_subject": settings.certificate_subject,
        "certificate_issuer": settings.certificate_issuer,
        "certificate_valid_from": settings.certificate_valid_from,
        "certificate_valid_to": settings.certificate_valid_to,
        "certificate_fingerprint_sha256": settings.certificate_fingerprint_sha256,
        "certificate_is_self_signed": settings.certificate_is_self_signed,
    }


@frappe.whitelist()
def inspect_certificate():
    settings = get_settings_for_update()

    if not settings.certificate_file:
        settings.clear_certificate_metadata()
        settings.save(ignore_permissions=True)

        return {
            "status": "not_configured",
            "certificate_status": settings.certificate_status,
        }

    metadata = inspect_pkcs12_certificate(
        certificate_bytes=get_file_bytes(settings.certificate_file),
        password=get_certificate_password(settings),
    )

    apply_certificate_metadata(settings, metadata)
    settings.save(ignore_permissions=True)

    return {
        "status": "inspected",
        "certificate_file": settings.certificate_file,
        "certificate_status": settings.certificate_status,
        "certificate_subject": settings.certificate_subject,
        "certificate_issuer": settings.certificate_issuer,
        "certificate_serial_number": settings.certificate_serial_number,
        "certificate_fingerprint_sha256": settings.certificate_fingerprint_sha256,
        "certificate_valid_from": settings.certificate_valid_from,
        "certificate_valid_to": settings.certificate_valid_to,
        "certificate_is_self_signed": settings.certificate_is_self_signed,
    }


@frappe.whitelist()
def clear_certificate():
    settings = get_settings_for_update()

    settings.certificate_file = None
    settings.certificate_password = None
    settings.certificate_location = None
    settings.clear_certificate_metadata()
    settings.enable_certificate_based_pdf_signing = 0

    settings.save(ignore_permissions=True)

    return {
        "status": "cleared",
        "certificate_status": settings.certificate_status,
    }


def get_settings_for_update():
    settings = frappe.get_single("Frappe Sign Settings")

    if not frappe.has_permission("Frappe Sign Settings", "write", doc=settings):
        frappe.throw("You do not have permission to update Frappe Sign Settings.")

    return settings


def get_certificate_password(settings):
    if not settings.certificate_password:
        return None

    try:
        return settings.get_password("certificate_password")
    except Exception:
        return settings.certificate_password


def inspect_pkcs12_certificate(certificate_bytes, password=None):
    if not certificate_bytes:
        frappe.throw("Certificate file is empty.")

    password_bytes = password.encode("utf-8") if password else None

    try:
        private_key, certificate, additional_certificates = pkcs12.load_key_and_certificates(
            certificate_bytes,
            password_bytes,
        )
    except Exception as error:
        frappe.throw(
            "Could not read the certificate file. Confirm that it is a valid .p12/.pfx "
            f"file and that the password is correct. Details: {error}"
        )

    if not private_key:
        frappe.throw("The certificate file does not contain a private key.")

    if not certificate:
        frappe.throw("The certificate file does not contain a certificate.")

    valid_from = get_certificate_not_valid_before(certificate)
    valid_to = get_certificate_not_valid_after(certificate)

    return {
        "subject": certificate_name_to_text(certificate.subject),
        "issuer": certificate_name_to_text(certificate.issuer),
        "serial_number": str(certificate.serial_number),
        "fingerprint_sha256": format_fingerprint(
            certificate.fingerprint(hashes.SHA256()).hex()
        ),
        "valid_from": valid_from,
        "valid_to": valid_to,
        "is_self_signed": is_self_signed_certificate(certificate),
        "status": get_certificate_status(valid_from, valid_to),
        "additional_certificate_count": len(additional_certificates or []),
    }


def apply_certificate_metadata(settings, metadata):
    settings.certificate_subject = metadata.get("subject")
    settings.certificate_issuer = metadata.get("issuer")
    settings.certificate_serial_number = metadata.get("serial_number")
    settings.certificate_fingerprint_sha256 = metadata.get("fingerprint_sha256")
    settings.certificate_valid_from = metadata.get("valid_from")
    settings.certificate_valid_to = metadata.get("valid_to")
    settings.certificate_is_self_signed = 1 if metadata.get("is_self_signed") else 0
    settings.certificate_status = metadata.get("status") or "Invalid"


def get_certificate_not_valid_before(certificate):
    value = getattr(certificate, "not_valid_before_utc", None)

    if value:
        return value.replace(tzinfo=None)

    return certificate.not_valid_before


def get_certificate_not_valid_after(certificate):
    value = getattr(certificate, "not_valid_after_utc", None)

    if value:
        return value.replace(tzinfo=None)

    return certificate.not_valid_after


def get_certificate_status(valid_from, valid_to):
    now_value = get_datetime(now_datetime())

    if not valid_from or not valid_to:
        return "Invalid"

    valid_from = get_datetime(valid_from)
    valid_to = get_datetime(valid_to)

    if now_value < valid_from:
        return "Invalid"

    if now_value > valid_to:
        return "Expired"

    if valid_to <= get_datetime(add_days(now_value, CERTIFICATE_EXPIRY_WARNING_DAYS)):
        return "Expiring Soon"

    return "Valid"


def certificate_name_to_text(name):
    parts = []

    for attribute in name:
        key = getattr(attribute.oid, "_name", None) or attribute.oid.dotted_string
        parts.append(f"{key}={attribute.value}")

    return ", ".join(parts)


def format_fingerprint(value):
    value = (value or "").replace(":", "").upper()
    return ":".join(value[index : index + 2] for index in range(0, len(value), 2))


def is_self_signed_certificate(certificate):
    if certificate.subject != certificate.issuer:
        return False

    public_key = certificate.public_key()

    try:
        if isinstance(public_key, rsa.RSAPublicKey):
            public_key.verify(
                certificate.signature,
                certificate.tbs_certificate_bytes,
                padding.PKCS1v15(),
                certificate.signature_hash_algorithm,
            )
            return True

        if isinstance(public_key, ec.EllipticCurvePublicKey):
            public_key.verify(
                certificate.signature,
                certificate.tbs_certificate_bytes,
                ec.ECDSA(certificate.signature_hash_algorithm),
            )
            return True

    except Exception:
        return False

    return False


def generate_certificate_password(length=32):
    alphabet = string.ascii_letters + string.digits + "-_@#%+=!"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def clean_text(value):
    value = str(value or "").strip()
    return value or None


def clean_country(value):
    value = str(value or "").strip().upper()

    if not value:
        return None

    if len(value) != 2:
        frappe.throw("Country must be a two-letter ISO country code, for example ZA.")

    return value


def get_default_common_name():
    site_name = getattr(frappe.local, "site", None)

    if site_name:
        return f"Frappe Sign - {site_name}"

    return "Frappe Sign Document Signing Certificate"