// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt


frappe.ui.form.on("Frappe Sign Profile", {
    refresh(frm) {
        if (!frm.doc.__islocal && frm.doc.user === frappe.session.user) {
            frm.dashboard.set_headline(__("This is your Frappe Sign signature profile."));
        }

        if (frm.doc.active && !frm.doc.consent) {
            frm.dashboard.set_headline_alert(
                __("Signature consent has not been given."),
                "orange"
            );
        }
    },

    consent(frm) {
        if (frm.doc.consent) {
            frm.set_value("consent_on", frappe.datetime.now_datetime());
        } else {
            frm.set_value("consent_on", null);
        }
    },

    signature_type(frm) {
        frm.trigger("toggle_signature_fields");
    },

    onload(frm) {
        frm.trigger("toggle_signature_fields");
    },

    toggle_signature_fields(frm) {
        const typed = frm.doc.signature_type === "Typed";

        frm.toggle_display("signature_text", typed);
        frm.toggle_reqd("signature_text", typed);
        frm.toggle_reqd("signature_image", !typed);
    },
});