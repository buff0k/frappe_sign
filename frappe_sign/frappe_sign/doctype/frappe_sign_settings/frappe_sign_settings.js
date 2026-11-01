// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

frappe.ui.form.on("Frappe Sign Settings", {
    refresh(frm) {
        frm.trigger("add_certificate_actions");
        frm.trigger("set_certificate_indicator");
        frm.trigger("set_queries");
    },

    set_queries(frm) {
        frm.set_query("default_print_format", "configured_doctypes", (doc, cdt, cdn) => {
            const row = locals[cdt][cdn];

            return {
                filters: {
                    doc_type: row.source_doctype,
                    disabled: 0,
                },
            };
        });
    },

    add_certificate_actions(frm) {
        frm.add_custom_button(__("Generate Self-Signed Signing Certificate"), () => {
            frm.trigger("generate_self_signed_certificate");
        }, __("Certificate"));

        frm.add_custom_button(__("Inspect Certificate"), async () => {
            await frm.trigger("inspect_certificate");
        }, __("Certificate"));

        frm.add_custom_button(__("Clear Certificate"), () => {
            frm.trigger("clear_certificate");
        }, __("Certificate"));
    },

    set_certificate_indicator(frm) {
        const status = frm.doc.certificate_status || "Not Configured";

        const colors = {
            "Not Configured": "gray",
            "Valid": "green",
            "Expiring Soon": "orange",
            "Expired": "red",
            "Invalid": "red",
        };

        frm.dashboard.set_headline_alert(
            `<div class="frappe-sign-status">
                PDF Signing Certificate: <strong>${frappe.utils.escape_html(status)}</strong>
            </div>`,
            colors[status] || "gray"
        );
    },

    generate_self_signed_certificate(frm) {
        const dialog = new frappe.ui.Dialog({
            title: __("Generate Self-Signed Signing Certificate"),
            fields: [
                {
                    fieldname: "warning",
                    fieldtype: "HTML",
                    options: `
                        <div class="alert alert-warning">
                            <p>
                                <strong>${__("Self-signed certificate")}</strong>
                            </p>
                            <p>
                                ${__(
                                    "This creates a self-signed PDF signing certificate for internal integrity checks and audit evidence. External PDF viewers may show the signature as unknown or untrusted unless the certificate is manually trusted."
                                )}
                            </p>
                            <p>
                                ${__(
                                    "For public-facing trusted PDF signatures, upload a CA-issued document-signing certificate. Do not use your website SSL/TLS certificate."
                                )}
                            </p>
                        </div>
                    `,
                },
                {
                    fieldname: "common_name",
                    fieldtype: "Data",
                    label: __("Common Name"),
                    default: frm.doc.certificate_subject || "",
                    reqd: 1,
                },
                {
                    fieldname: "organisation",
                    fieldtype: "Data",
                    label: __("Organisation"),
                    default: "Frappe Sign",
                },
                {
                    fieldname: "organisational_unit",
                    fieldtype: "Data",
                    label: __("Organisational Unit"),
                    default: "Document Signing",
                },
                {
                    fieldname: "country",
                    fieldtype: "Data",
                    label: __("Country Code"),
                    default: "ZA",
                    description: __("Two-letter ISO country code, for example ZA."),
                    reqd: 1,
                },
                {
                    fieldname: "validity_years",
                    fieldtype: "Int",
                    label: __("Validity Years"),
                    default: 5,
                    reqd: 1,
                },
                {
                    fieldname: "certificate_location",
                    fieldtype: "Data",
                    label: __("Certificate Reason / Location"),
                    default: frm.doc.certificate_location || "Frappe Sign document signing",
                },
                {
                    fieldname: "enable_certificate_based_pdf_signing",
                    fieldtype: "Check",
                    label: __("Enable Certificate Based PDF Signing"),
                    default: 1,
                },
                {
                    fieldname: "overwrite_existing",
                    fieldtype: "Check",
                    label: __("Overwrite Existing Certificate"),
                    default: 0,
                    description: __("Required if a certificate is already configured."),
                },
            ],
            primary_action_label: __("Generate Certificate"),
            primary_action: async (values) => {
                if (!values.common_name) {
                    frappe.msgprint(__("Common Name is required."));
                    return;
                }

                if (!values.country || values.country.length !== 2) {
                    frappe.msgprint(__("Country Code must be two letters, for example ZA."));
                    return;
                }

                if (!values.validity_years || cint(values.validity_years) < 1) {
                    frappe.msgprint(__("Validity Years must be at least 1."));
                    return;
                }

                await frappe.call({
                    method: "frappe_sign.frappe_sign.doctype.frappe_sign_settings.frappe_sign_settings.generate_self_signed_certificate",
                    args: values,
                    freeze: true,
                    freeze_message: __("Generating signing certificate..."),
                });

                dialog.hide();

                frappe.show_alert({
                    message: __("Signing certificate generated."),
                    indicator: "green",
                });

                await frm.reload_doc();
            },
        });

        dialog.show();
    },

    async inspect_certificate(frm) {
        if (!frm.doc.certificate_file) {
            frappe.msgprint(__("Please attach a .p12 or .pfx certificate file first."));
            return;
        }

        if (frm.is_dirty()) {
            await frm.save();
        }

        await frappe.call({
            method: "frappe_sign.frappe_sign.doctype.frappe_sign_settings.frappe_sign_settings.inspect_certificate",
            freeze: true,
            freeze_message: __("Inspecting certificate..."),
        });

        frappe.show_alert({
            message: __("Certificate inspected."),
            indicator: "green",
        });

        await frm.reload_doc();
    },

    clear_certificate(frm) {
        frappe.confirm(
            __(
                "Clear the configured PDF signing certificate from Frappe Sign Settings? This will not delete historical signed documents."
            ),
            async () => {
                await frappe.call({
                    method: "frappe_sign.frappe_sign.doctype.frappe_sign_settings.frappe_sign_settings.clear_certificate",
                    freeze: true,
                    freeze_message: __("Clearing certificate..."),
                });

                frappe.show_alert({
                    message: __("Certificate cleared."),
                    indicator: "green",
                });

                await frm.reload_doc();
            }
        );
    },
});

frappe.ui.form.on("Frappe Sign Source DocType", {
    source_doctype(frm, cdt, cdn) {
        // The user is changing the source doctype - the previously stored
        // field almost certainly doesn't exist on the new doctype, so clear it.
        update_attach_signed_pdf_field_options(frm, cdt, cdn, { reset_value: true });
    },
    refresh(frm, cdt, cdn) {
        // A saved row is just being displayed (form load, grid row opened) -
        // the Select's options list starts empty every time, so without this
        // the stored value renders blank even though it's still the real,
        // saved value. Recompute the options and keep the value if it's
        // still valid for this row's source doctype.
        update_attach_signed_pdf_field_options(frm, cdt, cdn, { reset_value: false });
    },
});

function update_attach_signed_pdf_field_options(frm, cdt, cdn, { reset_value } = {}) {
    const row = locals[cdt][cdn];
    const previous_value = row.attach_signed_pdf_field;

    const apply_options = () => {
        let options = [""];

        if (row.source_doctype) {
            options = options.concat(
                (frappe.get_meta(row.source_doctype).fields || [])
                    .filter((df) => ["Attach", "Attach Image"].includes(df.fieldtype))
                    .map((df) => df.fieldname)
            );
        }

        frm.fields_dict.configured_doctypes.grid.update_docfield_property(
            "attach_signed_pdf_field",
            "options",
            options.join("\n")
        );

        const keep_value = !reset_value && previous_value && options.includes(previous_value);

        frappe.model.set_value(cdt, cdn, "attach_signed_pdf_field", keep_value ? previous_value : "");
    };

    if (row.source_doctype) {
        frappe.model.with_doctype(row.source_doctype, apply_options);
    } else {
        apply_options();
    }
}