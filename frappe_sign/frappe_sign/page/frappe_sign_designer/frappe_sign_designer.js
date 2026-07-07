// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

frappe.pages["frappe-sign-designer"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Frappe Sign Designer"),
        single_column: true,
    });

    wrapper.frappe_sign_designer = new FrappeSignDesigner(page, wrapper);
};


class FrappeSignDesigner {
    constructor(page, wrapper) {
        this.page = page;
        this.wrapper = wrapper;
        this.request_name = null;
        this.request = null;
        this.signers = [];
        this.fields = [];

        this.make();
        this.resolve_route();
    }

    make() {
        this.page.main.html(`
            <div class="frappe-sign frappe-sign-designer">
                <div class="frappe-sign-designer-layout">
                    <div class="frappe-sign-designer-sidebar">
                        <div class="frappe-sign-card">
                            <h4>${__("Signing Request")}</h4>
                            <div id="frappe-sign-request-summary">
                                ${__("No request loaded.")}
                            </div>
                        </div>

                        <div class="frappe-sign-card">
                            <h4>${__("Add Field")}</h4>

                            <div class="form-group">
                                <label>${__("Signer")}</label>
                                <select class="form-control" id="frappe-sign-field-signer"></select>
                            </div>

                            <div class="form-group">
                                <label>${__("Field Type")}</label>
                                <select class="form-control" id="frappe-sign-field-type">
                                    <option value="Signature">${__("Signature")}</option>
                                    <option value="Initials">${__("Initials")}</option>
                                    <option value="Name">${__("Name")}</option>
                                    <option value="Email">${__("Email")}</option>
                                    <option value="Date">${__("Date")}</option>
                                    <option value="Text">${__("Text")}</option>
                                    <option value="Checkbox">${__("Checkbox")}</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label>${__("Page")}</label>
                                <input class="form-control" id="frappe-sign-field-page" type="number" min="1" value="1">
                            </div>

                            <div class="form-group">
                                <label>${__("X Ratio")}</label>
                                <input class="form-control" id="frappe-sign-field-x" type="number" min="0" max="1" step="0.001" value="0.10">
                            </div>

                            <div class="form-group">
                                <label>${__("Y Ratio")}</label>
                                <input class="form-control" id="frappe-sign-field-y" type="number" min="0" max="1" step="0.001" value="0.10">
                            </div>

                            <div class="form-group">
                                <label>${__("Width Ratio")}</label>
                                <input class="form-control" id="frappe-sign-field-width" type="number" min="0" max="1" step="0.001" value="0.20">
                            </div>

                            <div class="form-group">
                                <label>${__("Height Ratio")}</label>
                                <input class="form-control" id="frappe-sign-field-height" type="number" min="0" max="1" step="0.001" value="0.06">
                            </div>

                            <div class="checkbox">
                                <label>
                                    <input type="checkbox" id="frappe-sign-field-required" checked>
                                    ${__("Required")}
                                </label>
                            </div>

                            <button class="btn btn-primary btn-sm" id="frappe-sign-add-field">
                                ${__("Add Field")}
                            </button>
                        </div>

                        <div class="frappe-sign-card">
                            <h4>${__("Fields")}</h4>
                            <div id="frappe-sign-field-list"></div>
                        </div>
                    </div>

                    <div class="frappe-sign-designer-main">
                        <div class="frappe-sign-toolbar">
                            <button class="btn btn-primary" id="frappe-sign-save-fields">
                                ${__("Save Fields")}
                            </button>

                            <button class="btn btn-default" id="frappe-sign-reload">
                                ${__("Reload")}
                            </button>

                            <button class="btn btn-success" id="frappe-sign-send-request">
                                ${__("Send Request")}
                            </button>
                        </div>

                        <div class="frappe-sign-pdf-container">
                            <iframe id="frappe-sign-pdf-frame" class="frappe-sign-pdf-frame"></iframe>
                        </div>
                    </div>
                </div>
            </div>
        `);

        this.bind_events();
    }

    bind_events() {
        this.page.main.find("#frappe-sign-add-field").on("click", () => {
            this.add_field_from_form();
        });

        this.page.main.find("#frappe-sign-save-fields").on("click", async () => {
            await this.save_fields();
        });

        this.page.main.find("#frappe-sign-reload").on("click", async () => {
            await this.load_request();
        });

        this.page.main.find("#frappe-sign-send-request").on("click", async () => {
            await this.send_request();
        });
    }

    resolve_route() {
        const route = frappe.get_route();

        this.request_name =
            frappe.route_options?.request ||
            route[1] ||
            route[2] ||
            null;

        frappe.route_options = null;

        if (!this.request_name) {
            this.prompt_for_request();
            return;
        }

        this.load_request();
    }

    prompt_for_request() {
        const dialog = new frappe.ui.Dialog({
            title: __("Open Signing Request"),
            fields: [
                {
                    fieldname: "request",
                    fieldtype: "Link",
                    label: __("Frappe Sign Request"),
                    options: "Frappe Sign Request",
                    reqd: 1,
                },
            ],
            primary_action_label: __("Open"),
            primary_action: (values) => {
                dialog.hide();
                this.request_name = values.request;
                this.load_request();
            },
        });

        dialog.show();
    }

    async load_request() {
        if (!this.request_name) {
            return;
        }

        const response = await frappe.call({
            method: "frappe_sign.api.designer.get_designer_context",
            args: {
                request_name: this.request_name,
            },
            freeze: true,
            freeze_message: __("Loading signing request..."),
        });

        this.request = response.message.request;
        this.signers = response.message.signers || [];
        this.fields = response.message.fields || [];

        this.render_request();
        this.render_signer_options();
        this.render_fields();
        this.render_pdf();
    }

    render_request() {
        const html = `
            <p><strong>${frappe.utils.escape_html(this.request.request_title || this.request.name)}</strong></p>
            <p>${__("Status")}: <strong>${frappe.utils.escape_html(this.request.status || "")}</strong></p>
            <p>${__("Source")}: ${frappe.utils.escape_html(this.request.source_doctype || "")} ${frappe.utils.escape_html(this.request.source_name || "")}</p>
        `;

        this.page.main.find("#frappe-sign-request-summary").html(html);
    }

    render_signer_options() {
        const select = this.page.main.find("#frappe-sign-field-signer");
        select.empty();

        for (const signer of this.signers) {
            const label = signer.full_name || signer.email || signer.user || signer.name;

            select.append(`
                <option value="${frappe.utils.escape_html(signer.name)}">
                    ${frappe.utils.escape_html(label)}
                </option>
            `);
        }
    }

    render_pdf() {
        const frame = this.page.main.find("#frappe-sign-pdf-frame");

        if (!this.request.source_pdf) {
            frame.replaceWith(`<p>${__("No source PDF attached.")}</p>`);
            return;
        }

        frame.attr("src", this.request.source_pdf);
    }

    add_field_from_form() {
        const field = {
            signer: this.page.main.find("#frappe-sign-field-signer").val(),
            signer_label: this.get_signer_label(this.page.main.find("#frappe-sign-field-signer").val()),
            field_type: this.page.main.find("#frappe-sign-field-type").val(),
            page: cint(this.page.main.find("#frappe-sign-field-page").val()),
            x_ratio: flt(this.page.main.find("#frappe-sign-field-x").val()),
            y_ratio: flt(this.page.main.find("#frappe-sign-field-y").val()),
            width_ratio: flt(this.page.main.find("#frappe-sign-field-width").val()),
            height_ratio: flt(this.page.main.find("#frappe-sign-field-height").val()),
            required: this.page.main.find("#frappe-sign-field-required").is(":checked") ? 1 : 0,
            read_only: 0,
            default_value: "",
        };

        if (!field.signer) {
            frappe.msgprint(__("Please select a signer."));
            return;
        }

        if (!field.page || field.page < 1) {
            frappe.msgprint(__("Page must be 1 or higher."));
            return;
        }

        for (const key of ["x_ratio", "y_ratio", "width_ratio", "height_ratio"]) {
            if (field[key] < 0 || field[key] > 1) {
                frappe.msgprint(__(`${key} must be between 0 and 1.`));
                return;
            }
        }

        this.fields.push(field);
        this.render_fields();
    }

    get_signer_label(signer_name) {
        const signer = this.signers.find((row) => row.name === signer_name);

        if (!signer) {
            return "";
        }

        return signer.full_name || signer.email || signer.user || signer.name;
    }

    render_fields() {
        const container = this.page.main.find("#frappe-sign-field-list");
        container.empty();

        if (!this.fields.length) {
            container.html(`<p class="text-muted">${__("No fields added yet.")}</p>`);
            return;
        }

        this.fields.forEach((field, index) => {
            const label = field.signer_label || this.get_signer_label(field.signer);

            const row = $(`
                <div class="frappe-sign-field-row">
                    <div>
                        <strong>${frappe.utils.escape_html(field.field_type)}</strong>
                        <br>
                        <small>
                            ${frappe.utils.escape_html(label || "")}
                            · ${__("Page")} ${field.page}
                            · x:${field.x_ratio}, y:${field.y_ratio}
                        </small>
                    </div>

                    <button class="btn btn-xs btn-danger" data-index="${index}">
                        ${__("Remove")}
                    </button>
                </div>
            `);

            row.find("button").on("click", () => {
                this.fields.splice(index, 1);
                this.render_fields();
            });

            container.append(row);
        });
    }

    async save_fields() {
        if (!this.request_name) {
            frappe.msgprint(__("No signing request loaded."));
            return;
        }

        await frappe.call({
            method: "frappe_sign.api.designer.save_fields",
            args: {
                request_name: this.request_name,
                fields_json: JSON.stringify(this.fields),
            },
            freeze: true,
            freeze_message: __("Saving signing fields..."),
        });

        frappe.show_alert({
            message: __("Signing fields saved."),
            indicator: "green",
        });

        await this.load_request();
    }

    async send_request() {
        if (!this.request_name) {
            frappe.msgprint(__("No signing request loaded."));
            return;
        }

        if (!this.fields.length) {
            frappe.msgprint(__("Please add at least one signing field before sending."));
            return;
        }

        frappe.confirm(
            __("Send this signing request now?"),
            async () => {
                await this.save_fields();

                await frappe.call({
                    method: "frappe_sign.api.request.send_request",
                    args: {
                        request_name: this.request_name,
                    },
                    freeze: true,
                    freeze_message: __("Sending signing request..."),
                });

                frappe.show_alert({
                    message: __("Signing request sent."),
                    indicator: "green",
                });

                frappe.set_route("Form", "Frappe Sign Request", this.request_name);
            }
        );
    }
}