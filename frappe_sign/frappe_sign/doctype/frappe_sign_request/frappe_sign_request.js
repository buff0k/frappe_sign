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
                frappe.route_options = {
                    request: frm.doc.name,
                };

                frappe.set_route("frappe-sign-designer");
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

        if (["Draft", "Prepared", "Sent", "Viewed", "Partially Signed"].includes(frm.doc.status)) {
            frm.add_custom_button(__("Copy Signer Link"), () => {
                frm.trigger("copy_signer_link");
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

    copy_signer_link(frm) {
        if (!frm.doc.signers || !frm.doc.signers.length) {
            frappe.msgprint(__("No signers found on this request."));
            return;
        }

        const signer_options = frm.doc.signers
            .filter((row) => row.role === "Signer" && !["Signed", "Declined", "Skipped"].includes(row.status))
            .map((row) => ({
                label: `${row.full_name || row.email || row.signer} (${row.status || "Pending"})`,
                value: row.name,
            }));

        if (!signer_options.length) {
            frappe.msgprint(__("No open signers are available."));
            return;
        }

        const dialog = new frappe.ui.Dialog({
            title: __("Copy Signer Link"),
            fields: [
                {
                    fieldname: "signer_row",
                    fieldtype: "Select",
                    label: __("Signer"),
                    options: signer_options,
                    reqd: 1,
                },
                {
                    fieldname: "signing_link",
                    fieldtype: "Small Text",
                    label: __("Signing Link"),
                    read_only: 1,
                },
            ],
            primary_action_label: __("Get Link"),
            primary_action: async (values) => {
                const response = await frappe.call({
                    method: "frappe_sign.api.request.get_signer_link",
                    args: {
                        request_name: frm.doc.name,
                        signer_row_name: values.signer_row,
                    },
                    freeze: true,
                    freeze_message: __("Getting signing link..."),
                });

                const link = response.message.signing_link;

                dialog.set_value("signing_link", link);

                if (navigator.clipboard) {
                    await navigator.clipboard.writeText(link);

                    frappe.show_alert({
                        message: __("Signing link copied to clipboard."),
                        indicator: "green",
                    });
                }

                await frm.reload_doc();
            },
        });

        dialog.show();
    },

    source_doctype(frm) {
        frm.set_value("source_name", null);
    },
});

frappe.ui.form.on("Frappe Sign Signer", {
    signer(frm, cdt, cdn) {
        const row = locals[cdt][cdn];

        if (!row.signer) {
            frappe.model.set_value(cdt, cdn, "full_name", null);
            frappe.model.set_value(cdt, cdn, "email", null);
            return;
        }

        frappe.db.get_value(
            "Frappe Sign Profile",
            row.signer,
            ["full_name", "email", "active", "consent"]
        ).then((response) => {
            if (!response.message) {
                return;
            }

            const profile = response.message;

            frappe.model.set_value(cdt, cdn, "full_name", profile.full_name);
            frappe.model.set_value(cdt, cdn, "email", profile.email);

            if (!profile.active) {
                frappe.msgprint(__("The selected signer profile is not active."));
            }

            if (!profile.consent) {
                frappe.show_alert({
                    message: __("The selected signer profile has not given signature consent."),
                    indicator: "orange",
                });
            }
        });
    },
});