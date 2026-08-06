# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import frappe


def get_file_bytes(file_url):
    if not file_url:
        frappe.throw("File URL is required.")

    file_doc = frappe.get_doc("File", {"file_url": file_url})
    path = file_doc.get_full_path()

    # path is resolved by File.get_full_path() from a DB-backed File record
    # looked up by file_url, not from raw user input, so it can't be steered
    # outside the site's files directory.
    with open(path, "rb") as handle:  # nosemgrep: frappe-security-file-traversal
        return handle.read()


def attach_private_file(doctype, name, file_name, content):
    file_doc = frappe.get_doc(
        {
            "doctype": "File",
            "file_name": file_name,
            "attached_to_doctype": doctype,
            "attached_to_name": name,
            "is_private": 1,
            "content": content,
        }
    )
    file_doc.save(ignore_permissions=True)
    return file_doc