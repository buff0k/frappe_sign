// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

frappe.ui.form.on("Frappe Sign Profile", {
    refresh(frm) {
        frm.trigger("set_headline");
        frm.trigger("toggle_user_controlled_fields");
        frm.trigger("toggle_signature_fields");
    },

    onload(frm) {
        frm.trigger("toggle_user_controlled_fields");
        frm.trigger("toggle_signature_fields");
    },

    user(frm) {
        frm.trigger("pull_user_details");
        frm.trigger("toggle_user_controlled_fields");
    },

    async pull_user_details(frm) {
        if (!frm.doc.user) {
            return;
        }

        const response = await frappe.db.get_value(
            "User",
            frm.doc.user,
            ["full_name", "email"]
        );

        if (!response.message) {
            return;
        }

        await frm.set_value("full_name", response.message.full_name);
        await frm.set_value("email", response.message.email);
    },

    toggle_user_controlled_fields(frm) {
        const has_user = !!frm.doc.user;

        frm.set_df_property("full_name", "read_only", has_user ? 1 : 0);
        frm.set_df_property("email", "read_only", has_user ? 1 : 0);

        frm.toggle_reqd("full_name", true);
        frm.toggle_reqd("email", true);
    },

    set_headline(frm) {
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

    toggle_signature_fields(frm) {
        const typed = frm.doc.signature_type === "Typed";

        frm.toggle_display("signature_text", typed);
        frm.toggle_reqd("signature_text", false);

        frm.toggle_display("signature_image", !typed);
        frm.toggle_reqd("signature_image", false);

        frm.toggle_display("initials_image", !typed);
        frm.toggle_reqd("initials_image", false);
    },
});