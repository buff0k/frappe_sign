# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe
from frappe.utils.pdf import get_pdf


def render_source_pdf(doctype, name, print_format=None):
    html = frappe.get_print(
        doctype=doctype,
        name=name,
        print_format=print_format,
        as_pdf=False,
    )

    return get_pdf(html)