// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt


frappe.provide("frappe_sign");

frappe_sign.source_button_added = {};

frappe_sign.setup_source_button = async function (frm) {
    if (!frm || !frm.doctype || !frm.doc || frm.doc.__islocal) {
        return;
    }

    if (frm.doctype.startsWith("Frappe Sign")) {
        return;
    }

    const key = `${frm.doctype}:${frm.doc.name}`;

    if (frappe_sign.source_button_added[key]) {
        return;
    }

    let response;

    try {
        response = await frappe.call({
            method: "frappe_sign.api.request.is_enabled_for_doctype",
            args: {
                doctype: frm.doctype,
            },
        });
    } catch (error) {
        return;
    }

    const config = response.message;

    if (!config || !config.enabled) {
        return;
    }

    frappe_sign.source_button_added[key] = true;

    frm.add_custom_button(
        __("Create Signing Request"),
        async () => {
            await frappe_sign.create_request_from_form(frm, config);
        },
        __("Frappe Sign")
    );
};


frappe_sign.create_request_from_form = async function (frm, config) {
    let print_format = config.default_print_format;

    if (!print_format) {
        print_format = await frappe_sign.prompt_for_print_format(frm.doctype);
    }

    if (!print_format) {
        frappe.msgprint(__("A Print Format is required."));
        return;
    }

    const response = await frappe.call({
        method: "frappe_sign.api.request.create_from_source",
        args: {
            doctype: frm.doctype,
            name: frm.doc.name,
            print_format: print_format,
        },
        freeze: true,
        freeze_message: __("Creating signing request..."),
    });

    if (response.message && response.message.name) {
        frappe.show_alert({
            message: __("Signing request created."),
            indicator: "green",
        });

        frappe.set_route("Form", "Frappe Sign Request", response.message.name);
    }
};


frappe_sign.prompt_for_print_format = async function (doctype) {
    const formats = await frappe.db.get_list("Print Format", {
        filters: {
            doc_type: doctype,
            disabled: 0,
        },
        fields: ["name"],
        limit: 100,
        order_by: "name asc",
    });

    if (!formats.length) {
        frappe.msgprint(__("No enabled Print Formats found for this DocType."));
        return null;
    }

    return new Promise((resolve) => {
        const dialog = new frappe.ui.Dialog({
            title: __("Select Print Format"),
            fields: [
                {
                    fieldname: "print_format",
                    fieldtype: "Select",
                    label: __("Print Format"),
                    options: formats.map((row) => row.name).join("\n"),
                    reqd: 1,
                },
            ],
            primary_action_label: __("Create Signing Request"),
            primary_action(values) {
                dialog.hide();
                resolve(values.print_format);
            },
        });

        dialog.show();
    });
};


/*
    Dynamic source DocTypes cannot be handled cleanly through doctype_js,
    because they are configured in Frappe Sign Settings at runtime.

    This safely hooks into Form refresh globally and then checks server-side
    whether the current DocType is enabled for Frappe Sign.
*/
frappe.after_ajax(() => {
    if (!frappe.ui || !frappe.ui.form || !frappe.ui.form.Form) {
        return;
    }

    if (frappe_sign.__form_refresh_patched) {
        return;
    }

    frappe_sign.__form_refresh_patched = true;

    const original_refresh = frappe.ui.form.Form.prototype.refresh;

    frappe.ui.form.Form.prototype.refresh = function () {
        const result = original_refresh.apply(this, arguments);

        setTimeout(() => {
            frappe_sign.setup_source_button(this);
        }, 300);

        return result;
    };
});