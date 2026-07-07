// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

frappe.ui.form.on("Frappe Sign Request", {
    refresh(frm) {
        frm.trigger("set_indicators");
        frm.trigger("add_actions");
        frm.trigger("lock_completed_request");
    },

    set_indicators(frm) {
        if (!frm.doc.status) {
            return;
        }

        const colors = {
            Draft: "gray",
            Prepared: "blue",
            Sent: "orange",
            Viewed: "orange",
            "Partially Signed": "orange",
            Completed: "green",
            Declined: "red",
            Expired: "red",
            Cancelled: "gray",
            Failed: "red",
        };

        frm.dashboard.set_headline_alert(
            `<div class="frappe-sign-status">Frappe Sign Status: <strong>${frm.doc.status}</strong></div>`,
            colors[frm.doc.status] || "gray"
        );
    },

    add_actions(frm) {
        if (frm.doc.__islocal) {
            return;
        }

        if (["Draft", "Prepared"].includes(frm.doc.status)) {
            frm.add_custom_button(__("Open Designer"), () => {
                frappe.set_route("frappe-sign-designer", {
                    request: frm.doc.name,
                });
            }, __("Frappe Sign"));

            frm.add_custom_button(__("Send Request"), async () => {
                await frappe.call({
                    method: "frappe_sign.api.request.send_request",
                    args: {
                        request_name: frm.doc.name,
                    },
                    freeze: true,
                    freeze_message: __("Sending signing request..."),
                });

                await frm.reload_doc();
            }, __("Frappe Sign"));
        }

        if (["Sent", "Viewed", "Partially Signed"].includes(frm.doc.status)) {
            frm.add_custom_button(__("Resend Links"), async () => {
                await frappe.call({
                    method: "frappe_sign.api.request.resend_request",
                    args: {
                        request_name: frm.doc.name,
                    },
                    freeze: true,
                    freeze_message: __("Resending signing links..."),
                });

                await frm.reload_doc();
            }, __("Frappe Sign"));

            frm.add_custom_button(__("Cancel Request"), async () => {
                frappe.confirm(
                    __("Cancel this signing request?"),
                    async () => {
                        await frappe.call({
                            method: "frappe_sign.api.request.cancel_request",
                            args: {
                                request_name: frm.doc.name,
                            },
                        });

                        await frm.reload_doc();
                    }
                );
            }, __("Frappe Sign"));
        }

        if (frm.doc.status === "Completed") {
            frm.add_custom_button(__("Verify Tamper Status"), async () => {
                await frappe.call({
                    method: "frappe_sign.api.request.verify_tamper_status",
                    args: {
                        request_name: frm.doc.name,
                    },
                    freeze: true,
                });

                await frm.reload_doc();
            }, __("Frappe Sign"));
        }
    },

    lock_completed_request(frm) {
        if (["Completed", "Cancelled", "Declined", "Expired"].includes(frm.doc.status)) {
            frm.set_read_only();
        }
    },

    source_doctype(frm) {
        frm.set_value("source_name", null);
    },
});

frappe.ui.form.on("Frappe Sign Signer", {
    signer_type(frm, cdt, cdn) {
        const row = locals[cdt][cdn];

        if (row.signer_type === "External") {
            frappe.model.set_value(cdt, cdn, "user", null);
            frappe.model.set_value(cdt, cdn, "full_name", null);
            frappe.model.set_value(cdt, cdn, "email", null);
        }

        frm.refresh_field("signers");
    },

    user(frm, cdt, cdn) {
        const row = locals[cdt][cdn];

        if (!row.user) {
            return;
        }

        frappe.db.get_value("User", row.user, ["full_name", "email"])
            .then((response) => {
                if (!response.message) {
                    return;
                }

                frappe.model.set_value(cdt, cdn, "full_name", response.message.full_name);
                frappe.model.set_value(cdt, cdn, "email", response.message.email);
            });
    },
});