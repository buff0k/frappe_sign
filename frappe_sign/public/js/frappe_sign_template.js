// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt


frappe.ui.form.on("Frappe Sign Template", {
    refresh(frm) {
        if (!frm.doc.__islocal) {
            frm.add_custom_button(__("Open Designer"), () => {
                frappe.set_route("frappe-sign-designer", {
                    template: frm.doc.name,
                });
            }, __("Frappe Sign"));
        }
    },

    source_doctype(frm) {
        frm.set_value("print_format", null);
    },
});