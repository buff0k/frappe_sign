// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

frappe.ui.form.on("Frappe Sign Certificate", {
    refresh(frm) {
        frm.add_custom_button(__("Verify Tamper Status"), async () => {
            await frappe.call({
                method: "frappe_sign.frappe_sign.doctype.frappe_sign_certificate.frappe_sign_certificate.verify_tamper_status",
                args: {
                    certificate_name: frm.doc.name,
                },
                freeze: true,
                freeze_message: __("Verifying tamper status..."),
            });

            frappe.show_alert({
                message: __("Tamper status verified."),
                indicator: "green",
            });

            await frm.reload_doc();
        });
    },
});