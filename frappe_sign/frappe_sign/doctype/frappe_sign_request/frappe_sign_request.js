// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

frappe.ui.form.on("Frappe Sign Request", {
    setup(frm) {
        frm.trigger("set_queries");
    },

    onload(frm) {
        frm.trigger("set_queries");
    },

    refresh(frm) {
        frm.trigger("set_queries");
        frm.trigger("set_indicators");
        frm.trigger("add_actions");
        frm.trigger("lock_completed_request");
        if (frm.doc.status === "Completed") {
            frm.add_custom_button(__("Evidence Certificates"), () => {
                frappe.set_route("List", "Frappe Sign Certificate", {
                    frappe_sign_request: frm.doc.name,
                });
            }, __("View"));
        }
    },

    before_save(frm) {
        if (frm.doc.signing_mode === "Parallel") {
            set_parallel_signing_order(frm);
        }

        if (frm.doc.signing_mode === "Sequential") {
            normalize_missing_sequential_orders(frm);
        }
    },

    set_queries(frm) {
        frm.set_query("source_doctype", () => {
            return {
                filters: {
                    issingle: 0,
                    istable: 0,
                },
            };
        });

        frm.set_query("print_format", () => {
            if (!frm.doc.source_doctype) {
                return {
                    filters: {
                        disabled: 0,
                    },
                };
            }

            return {
                filters: {
                    doc_type: frm.doc.source_doctype,
                    disabled: 0,
                },
            };
        });
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
            `<div class="frappe-sign-status">Frappe Sign Status: <strong>${frappe.utils.escape_html(frm.doc.status)}</strong></div>`,
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
                if (frm.doc.signing_mode === "Parallel") {
                    set_parallel_signing_order(frm);
                }

                if (frm.doc.signing_mode === "Sequential") {
                    normalize_missing_sequential_orders(frm);
                }

                if (frm.is_dirty()) {
                    await frm.save();
                }

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

    source_type(frm) {
        if (frm.doc.source_type === "Uploaded PDF") {
            frm.set_value("source_doctype", null);
            frm.set_value("source_name", null);
            frm.set_value("source_title", null);
            frm.set_value("print_format", null);
        }

        if (frm.doc.source_type === "Frappe Document") {
            frm.set_value("source_pdf", null);
            frm.set_value("source_pdf_hash", null);
        }
    },

    async source_doctype(frm) {
        frm.set_value("source_name", null);
        frm.set_value("source_title", null);
        frm.set_value("print_format", null);

        await frm.trigger("set_default_print_format");
    },

    async source_name(frm) {
        await frm.trigger("set_source_title");
        await frm.trigger("set_default_print_format");
    },

    async set_source_title(frm) {
        if (!frm.doc.source_doctype || !frm.doc.source_name) {
            frm.set_value("source_title", null);
            return;
        }

        const response = await frappe.call({
            method: "frappe_sign.api.source.get_source_document_title",
            args: {
                source_doctype: frm.doc.source_doctype,
                source_name: frm.doc.source_name,
            },
        });

        if (response.message) {
            frm.set_value("source_title", response.message);
        }
    },

    async set_default_print_format(frm) {
        if (!frm.doc.source_doctype) {
            return;
        }

        const response = await frappe.call({
            method: "frappe_sign.api.source.get_source_defaults",
            args: {
                source_doctype: frm.doc.source_doctype,
            },
        });

        const defaults = response.message || {};

        if (defaults.default_print_format && !frm.doc.print_format) {
            frm.set_value("print_format", defaults.default_print_format);
        }
    },

    signing_mode(frm) {
        if (frm.doc.signing_mode === "Parallel") {
            set_parallel_signing_order(frm);
            return;
        }

        if (frm.doc.signing_mode === "Sequential") {
            auto_sequence_if_all_default(frm);
        }
    },

    signers_add(frm, cdt, cdn) {
        const row = locals[cdt][cdn];

        if (frm.doc.signing_mode === "Parallel") {
            frappe.model.set_value(cdt, cdn, "signing_order", 1);
            return;
        }

        if (frm.doc.signing_mode === "Sequential") {
            frappe.model.set_value(cdt, cdn, "signing_order", get_next_sequential_order(frm, row.name));
        }
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

        if (frm.doc.signing_mode === "Sequential" && is_new_default_order_row(frm, row)) {
            frappe.model.set_value(cdt, cdn, "signing_order", get_next_sequential_order(frm, row.name));
        }

        if (frm.doc.signing_mode === "Parallel") {
            frappe.model.set_value(cdt, cdn, "signing_order", 1);
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

    role(frm, cdt, cdn) {
        const row = locals[cdt][cdn];

        if (frm.doc.signing_mode === "Parallel") {
            frappe.model.set_value(cdt, cdn, "signing_order", 1);
            return;
        }

        if (frm.doc.signing_mode === "Sequential" && row.role === "Signer" && is_new_default_order_row(frm, row)) {
            frappe.model.set_value(cdt, cdn, "signing_order", get_next_sequential_order(frm, row.name));
        }
    },
});

function get_signer_rows(frm) {
    return (frm.doc.signers || []).filter((row) => !row.role || row.role === "Signer");
}

function set_parallel_signing_order(frm) {
    get_signer_rows(frm).forEach((row) => {
        if (cint(row.signing_order) !== 1) {
            frappe.model.set_value(row.doctype, row.name, "signing_order", 1);
        }
    });

    frm.refresh_field("signers");
}

function auto_sequence_if_all_default(frm) {
    const signer_rows = get_signer_rows(frm);

    if (!signer_rows.length) {
        return;
    }

    const all_default = signer_rows.every((row) => !row.signing_order || cint(row.signing_order) === 1);

    if (!all_default) {
        return;
    }

    let order = 1;

    signer_rows.forEach((row) => {
        frappe.model.set_value(row.doctype, row.name, "signing_order", order);
        order += 1;
    });

    frm.refresh_field("signers");
}

function normalize_missing_sequential_orders(frm) {
    const signer_rows = get_signer_rows(frm);

    if (!signer_rows.length) {
        return;
    }

    const all_default = signer_rows.every((row) => !row.signing_order || cint(row.signing_order) === 1);

    if (all_default && signer_rows.length > 1) {
        auto_sequence_if_all_default(frm);
        return;
    }

    let next_order = get_highest_signing_order(frm) + 1;

    signer_rows.forEach((row) => {
        if (!row.signing_order || cint(row.signing_order) < 1) {
            frappe.model.set_value(row.doctype, row.name, "signing_order", next_order);
            next_order += 1;
        }
    });

    frm.refresh_field("signers");
}

function get_highest_signing_order(frm, exclude_row_name = null) {
    const orders = get_signer_rows(frm)
        .filter((row) => row.name !== exclude_row_name)
        .map((row) => cint(row.signing_order || 0));

    if (!orders.length) {
        return 0;
    }

    return Math.max(...orders);
}

function get_next_sequential_order(frm, exclude_row_name = null) {
    const highest = get_highest_signing_order(frm, exclude_row_name);

    if (!highest) {
        return 1;
    }

    return highest + 1;
}

function is_new_default_order_row(frm, row) {
    if (!row) {
        return false;
    }

    const signer_rows = get_signer_rows(frm);

    if (!signer_rows.length) {
        return false;
    }

    const is_last_row = signer_rows[signer_rows.length - 1].name === row.name;
    const has_default_order = !row.signing_order || cint(row.signing_order) === 1;
    const has_other_rows = signer_rows.some((candidate) => candidate.name !== row.name);

    return is_last_row && has_default_order && has_other_rows;
}