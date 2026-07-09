// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

frappe.ui.form.on("Frappe Sign Template", {
    setup(frm) {
        frm.trigger("set_queries");
    },

    onload(frm) {
        frm.trigger("set_queries");
    },

    refresh(frm) {
        frm.trigger("set_queries");

        if (!frm.doc.__islocal) {
            frm.add_custom_button(__("Open Designer"), () => {
                frappe.route_options = {
                    template: frm.doc.name,
                };

                frappe.set_route("frappe-sign-designer");
            }, __("Frappe Sign"));
        }
    },

    before_save(frm) {
        normalize_missing_template_signing_orders(frm);
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

    async source_doctype(frm) {
        frm.set_value("print_format", null);
        await frm.trigger("set_default_print_format");
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

    signers_add(frm, cdt, cdn) {
        const row = locals[cdt][cdn];

        if (!row.role) {
            frappe.model.set_value(cdt, cdn, "role", "Signer");
        }

        if (!row.signing_order) {
            frappe.model.set_value(cdt, cdn, "signing_order", get_next_template_signing_order(frm, row.name));
        }
    },
});

frappe.ui.form.on("Frappe Sign Template Signer", {
    role(frm, cdt, cdn) {
        const row = locals[cdt][cdn];

        if (!row.signing_order) {
            frappe.model.set_value(cdt, cdn, "signing_order", get_next_template_signing_order(frm, row.name));
        }
    },

    signer_label(frm, cdt, cdn) {
        const row = locals[cdt][cdn];

        if (!row.signing_order) {
            frappe.model.set_value(cdt, cdn, "signing_order", get_next_template_signing_order(frm, row.name));
        }
    },
});

function get_template_signer_rows(frm) {
    return (frm.doc.signers || []).filter((row) => !row.role || row.role === "Signer");
}

function get_next_template_signing_order(frm, exclude_row_name = null) {
    const orders = get_template_signer_rows(frm)
        .filter((row) => row.name !== exclude_row_name)
        .map((row) => cint(row.signing_order || 0));

    if (!orders.length) {
        return 1;
    }

    return Math.max(...orders) + 1;
}

function normalize_missing_template_signing_orders(frm) {
    const signer_rows = get_template_signer_rows(frm);

    if (!signer_rows.length) {
        return;
    }

    let next_order = Math.max(
        ...signer_rows.map((row) => cint(row.signing_order || 0)),
        0
    ) + 1;

    signer_rows.forEach((row) => {
        if (!row.signing_order || cint(row.signing_order) < 1) {
            frappe.model.set_value(row.doctype, row.name, "signing_order", next_order);
            next_order += 1;
        }
    });

    frm.refresh_field("signers");
}