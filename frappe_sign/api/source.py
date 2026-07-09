# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe

from frappe_sign.permissions import is_frappe_sign_sender


@frappe.whitelist()
def get_source_defaults(source_doctype):
    if not source_doctype:
        return {
            "default_print_format": None,
            "print_formats": [],
        }

    if not is_frappe_sign_sender():
        frappe.throw("You do not have permission to configure Frappe Sign source documents.")

    validate_source_doctype(source_doctype)

    print_formats = get_print_formats_for_doctype(source_doctype)

    return {
        "default_print_format": get_default_print_format(source_doctype, print_formats),
        "print_formats": print_formats,
    }


@frappe.whitelist()
def get_source_document_title(source_doctype, source_name):
    if not source_doctype or not source_name:
        return None

    if not is_frappe_sign_sender():
        frappe.throw("You do not have permission to access this source document.")

    validate_source_doctype(source_doctype)

    source_doc = frappe.get_doc(source_doctype, source_name)

    if not frappe.has_permission(source_doctype, "read", doc=source_doc):
        frappe.throw("You do not have permission to read the selected source document.")

    return source_doc.get_title() or source_doc.name


def validate_source_doctype(source_doctype):
    doctype_meta = frappe.db.get_value(
        "DocType",
        source_doctype,
        ["name", "issingle", "istable"],
        as_dict=True,
    )

    if not doctype_meta:
        frappe.throw(f"DocType {source_doctype} does not exist.")

    if doctype_meta.issingle:
        frappe.throw("Single DocTypes cannot be used as Frappe Sign source documents.")

    if doctype_meta.istable:
        frappe.throw("Child table DocTypes cannot be used as Frappe Sign source documents.")


def get_default_print_format(source_doctype, print_formats=None):
    settings_default = get_settings_default_print_format(source_doctype)

    if settings_default:
        return settings_default

    meta_default = getattr(frappe.get_meta(source_doctype), "default_print_format", None)

    if meta_default and print_format_matches_doctype(meta_default, source_doctype):
        return meta_default

    print_formats = print_formats if print_formats is not None else get_print_formats_for_doctype(source_doctype)

    if print_formats:
        return print_formats[0]

    return None


def get_settings_default_print_format(source_doctype):
    settings = frappe.get_single("Frappe Sign Settings")

    for row in settings.configured_doctypes:
        if not row.enabled:
            continue

        if row.source_doctype != source_doctype:
            continue

        if not row.default_print_format:
            continue

        if print_format_matches_doctype(row.default_print_format, source_doctype):
            return row.default_print_format

    return None


def print_format_matches_doctype(print_format, source_doctype):
    return bool(
        frappe.db.exists(
            "Print Format",
            {
                "name": print_format,
                "doc_type": source_doctype,
            },
        )
    )


def get_print_formats_for_doctype(source_doctype):
    return [
        row.name
        for row in frappe.get_all(
            "Print Format",
            filters={
                "doc_type": source_doctype,
                "disabled": 0,
            },
            fields=["name"],
            order_by="standard desc, name asc",
        )
    ]