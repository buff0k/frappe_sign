// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

class FrappeSignPortal {
    constructor(root) {
        this.root = $(root);
        this.token = this.root.attr("data-token");
        this.request_name = this.root.attr("data-request");

        this.context = null;
        this.pdf_doc = null;
        this.scale = 1.2;

        this.init();
    }

    async init() {
        if (!this.token) {
            this.show_error("Missing signing token.");
            return;
        }

        if (!window.pdfjsLib) {
            this.show_error("PDF.js failed to load.");
            return;
        }

        this.bind_events();

        await this.load_context();
        await this.load_pdf();
        await this.render_pdf();
    }

    bind_events() {
        $("#frappe-sign-complete").on("click", async () => {
            await this.complete_signing();
        });

        $("#frappe-sign-decline").on("click", async () => {
            await this.decline_signing();
        });
    }

    async load_context() {
        const response = await frappe.call({
            method: "frappe_sign.api.signing.get_signing_context",
            args: {
                token: this.token,
            },
            freeze: true,
            freeze_message: __("Loading signing request..."),
        });

        this.context = response.message;
    }

    async load_pdf() {
        const pdf_url =
            `/api/method/frappe_sign.api.signing.get_source_pdf?token=${encodeURIComponent(this.token)}`;

        this.pdf_doc = await window.pdfjsLib.getDocument(pdf_url).promise;
    }

    async render_pdf() {
        const container = $("#frappe-sign-pdf-container");
        container.empty();

        for (let page_number = 1; page_number <= this.pdf_doc.numPages; page_number++) {
            await this.render_page(page_number, container);
        }

        this.render_fields();
    }

    async render_page(page_number, container) {
        const page = await this.pdf_doc.getPage(page_number);
        const viewport = page.getViewport({ scale: this.scale });

        const wrapper = $(`
            <div class="frappe-sign-pdf-page-wrapper" id="frappe-sign-page-${page_number}" data-page="${page_number}">
                <div class="frappe-sign-page-label">Page ${page_number}</div>
                <div class="frappe-sign-pdf-page" data-page="${page_number}">
                    <canvas class="frappe-sign-pdf-canvas"></canvas>
                    <div class="frappe-sign-page-overlay" data-page="${page_number}"></div>
                </div>
            </div>
        `);

        const canvas = wrapper.find("canvas")[0];
        const canvas_context = canvas.getContext("2d");

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        wrapper.find(".frappe-sign-pdf-page").css({
            width: `${viewport.width}px`,
            height: `${viewport.height}px`,
        });

        wrapper.find(".frappe-sign-page-overlay").css({
            width: `${viewport.width}px`,
            height: `${viewport.height}px`,
        });

        container.append(wrapper);

        await page.render({
            canvasContext: canvas_context,
            viewport: viewport,
        }).promise;
    }

    render_fields() {
        const fields = this.context.fields || [];

        for (const field of fields) {
            const overlay = $(`.frappe-sign-page-overlay[data-page="${field.page}"]`);

            if (!overlay.length) {
                continue;
            }

            const width = overlay.width();
            const height = overlay.height();

            const box = $(`
                <div class="frappe-sign-signing-field" data-field="${frappe.utils.escape_html(field.name)}">
                    <div class="frappe-sign-signing-field-label">
                        ${frappe.utils.escape_html(field.field_type)}
                    </div>
                    <div class="frappe-sign-signing-field-value"></div>
                </div>
            `);

            box.css({
                left: `${field.x_ratio * width}px`,
                top: `${field.y_ratio * height}px`,
                width: `${field.width_ratio * width}px`,
                height: `${field.height_ratio * height}px`,
            });

            this.apply_field_behaviour(box, field);

            overlay.append(box);
        }
    }

    apply_field_behaviour(box, field) {
        if (field.field_type === "Name") {
            box.find(".frappe-sign-signing-field-value").text(this.context.signer.full_name || "");
            box.addClass("completed");
            return;
        }

        if (field.field_type === "Email") {
            box.find(".frappe-sign-signing-field-value").text(this.context.signer.email || "");
            box.addClass("completed");
            return;
        }

        if (field.field_type === "Date") {
            box.find(".frappe-sign-signing-field-value").text(frappe.datetime.get_today());
            box.addClass("completed");
            return;
        }

        if (field.field_type === "Text") {
            const input = $(`<input type="text" class="form-control frappe-sign-inline-input">`);
            box.find(".frappe-sign-signing-field-value").append(input);
            return;
        }

        if (field.field_type === "Checkbox") {
            const input = $(`<input type="checkbox" class="frappe-sign-inline-checkbox">`);
            box.find(".frappe-sign-signing-field-value").append(input);
            return;
        }

        if (field.field_type === "Signature" || field.field_type === "Initials") {
            box.addClass("clickable");

            box.on("click", () => {
                box.find(".frappe-sign-signing-field-value").text(
                    field.field_type === "Signature" ? "Signed" : "Initialled"
                );
                box.addClass("completed");
            });
        }
    }

    collect_field_values() {
        const values = {};

        $(".frappe-sign-signing-field").each(function () {
            const box = $(this);
            const field_name = box.attr("data-field");

            const text_input = box.find("input[type='text']");
            const checkbox = box.find("input[type='checkbox']");

            if (text_input.length) {
                values[field_name] = text_input.val();
                return;
            }

            if (checkbox.length) {
                values[field_name] = checkbox.is(":checked") ? "1" : "0";
                return;
            }

            values[field_name] = box.find(".frappe-sign-signing-field-value").text();
        });

        return values;
    }

    async complete_signing() {
        const required_missing = [];

        $(".frappe-sign-signing-field").each(function () {
            const box = $(this);
            const value = box.find(".frappe-sign-signing-field-value").text();
            const input = box.find("input");

            if (input.length) {
                if (input.attr("type") === "checkbox") {
                    if (!input.is(":checked")) {
                        required_missing.push(box.attr("data-field"));
                    }
                } else if (!input.val()) {
                    required_missing.push(box.attr("data-field"));
                }
                return;
            }

            if (!value) {
                required_missing.push(box.attr("data-field"));
            }
        });

        if (required_missing.length) {
            frappe.msgprint("Please complete all required signing fields.");
            return;
        }

        await frappe.call({
            method: "frappe_sign.api.signing.complete_signing",
            args: {
                token: this.token,
                field_values: JSON.stringify(this.collect_field_values()),
            },
            freeze: true,
            freeze_message: __("Completing signing..."),
        });

        frappe.msgprint({
            title: __("Signed"),
            message: __("Thank you. The document has been signed."),
            indicator: "green",
        });

        $("#frappe-sign-complete").prop("disabled", true);
        $("#frappe-sign-decline").prop("disabled", true);
    }

    async decline_signing() {
        const reason = window.prompt(__("Please enter a reason for declining this signing request."));

        if (!reason) {
            return;
        }

        await frappe.call({
            method: "frappe_sign.api.signing.decline_signing",
            args: {
                token: this.token,
                reason: reason,
            },
            freeze: true,
            freeze_message: __("Declining signing request..."),
        });

        frappe.msgprint({
            title: __("Declined"),
            message: __("The signing request has been declined."),
            indicator: "red",
        });

        $("#frappe-sign-complete").prop("disabled", true);
        $("#frappe-sign-decline").prop("disabled", true);
    }

    show_error(message) {
        $("#frappe-sign-pdf-container").html(`
            <div class="frappe-sign-message frappe-sign-message-error">
                <h2>Error</h2>
                <p>${frappe.utils.escape_html(message)}</p>
            </div>
        `);
    }
}

frappe.ready(() => {
    const root = document.getElementById("frappe-sign-root");

    if (root) {
        window.frappe_sign_portal = new FrappeSignPortal(root);
    }
});