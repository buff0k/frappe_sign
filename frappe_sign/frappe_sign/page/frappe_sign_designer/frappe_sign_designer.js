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
        this.pdf_doc = null;
        this.scale = 1.35;
        this.selected_signer = null;
        this.selected_field_type = "Signature";

        this.make();
        this.load_pdfjs().then(() => this.resolve_route());
    }

    make() {
        this.page.main.html(`
            <div class="frappe-sign frappe-sign-designer">
                <div class="frappe-sign-designer-toolbar">
                    <div>
                        <button class="btn btn-primary" id="frappe-sign-save-fields">
                            ${__("Save Fields")}
                        </button>
                        <button class="btn btn-success" id="frappe-sign-send-request">
                            ${__("Send Request")}
                        </button>
                        <button class="btn btn-default" id="frappe-sign-reload">
                            ${__("Reload")}
                        </button>
                    </div>

                    <div class="frappe-sign-zoom-controls">
                        <button class="btn btn-default btn-sm" id="frappe-sign-zoom-out">−</button>
                        <span id="frappe-sign-zoom-label">135%</span>
                        <button class="btn btn-default btn-sm" id="frappe-sign-zoom-in">+</button>
                    </div>
                </div>

                <div class="frappe-sign-designer-layout">
                    <aside class="frappe-sign-left-panel">
                        <div class="frappe-sign-card">
                            <h4>${__("Request")}</h4>
                            <div id="frappe-sign-request-summary" class="frappe-sign-muted">
                                ${__("No request loaded.")}
                            </div>
                        </div>

                        <div class="frappe-sign-card">
                            <h4>${__("Signer")}</h4>
                            <select class="form-control" id="frappe-sign-active-signer"></select>
                        </div>

                        <div class="frappe-sign-card">
                            <h4>${__("Drag Fields")}</h4>
                            <div class="frappe-sign-field-palette">
                                ${this.make_palette_item("Signature")}
                                ${this.make_palette_item("Initials")}
                                ${this.make_palette_item("Name")}
                                ${this.make_palette_item("Email")}
                                ${this.make_palette_item("Date")}
                                ${this.make_palette_item("Text")}
                                ${this.make_palette_item("Checkbox")}
                            </div>
                        </div>

                        <div class="frappe-sign-card">
                            <h4>${__("Fields")}</h4>
                            <div id="frappe-sign-field-list"></div>
                        </div>
                    </aside>

                    <main class="frappe-sign-document-panel">
                        <div id="frappe-sign-pdf-pages" class="frappe-sign-pdf-pages">
                            <div class="frappe-sign-loading">${__("Loading PDF...")}</div>
                        </div>
                    </main>

                    <aside class="frappe-sign-right-panel">
                        <div class="frappe-sign-card">
                            <h4>${__("Pages")}</h4>
                            <div id="frappe-sign-page-thumbnails" class="frappe-sign-page-thumbnails"></div>
                        </div>
                    </aside>
                </div>
            </div>
        `);

        this.bind_events();
    }

    make_palette_item(field_type) {
        return `
            <div class="frappe-sign-palette-item" draggable="true" data-field-type="${field_type}">
                ${__(field_type)}
            </div>
        `;
    }

    bind_events() {
        this.page.main.find("#frappe-sign-save-fields").on("click", async () => {
            await this.save_fields();
        });

        this.page.main.find("#frappe-sign-send-request").on("click", async () => {
            await this.send_request();
        });

        this.page.main.find("#frappe-sign-reload").on("click", async () => {
            await this.load_request();
        });

        this.page.main.find("#frappe-sign-zoom-in").on("click", async () => {
            this.scale = Math.min(this.scale + 0.15, 2.5);
            await this.render_pdf();
        });

        this.page.main.find("#frappe-sign-zoom-out").on("click", async () => {
            this.scale = Math.max(this.scale - 0.15, 0.65);
            await this.render_pdf();
        });

        this.page.main.find("#frappe-sign-active-signer").on("change", () => {
            this.selected_signer = this.page.main.find("#frappe-sign-active-signer").val();
        });

        this.page.main.find(".frappe-sign-palette-item").on("dragstart", (event) => {
            const field_type = event.currentTarget.dataset.fieldType;
            this.selected_field_type = field_type;
            event.originalEvent.dataTransfer.setData("text/plain", field_type);
        });
    }

    async load_pdfjs() {
        if (window.pdfjsLib) {
            return;
        }

        await new Promise((resolve, reject) => {
            frappe.require("/assets/frappe_sign/js/pdfjs/pdf.min.js", () => {
                if (!window.pdfjsLib) {
                    reject(new Error("PDF.js failed to load."));
                    return;
                }

                window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                    "/assets/frappe_sign/js/pdfjs/pdf.worker.min.js";

                resolve();
            });
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

        this.render_summary();
        this.render_signers();
        this.render_field_list();

        await this.load_pdf_document();
        await this.render_pdf();
    }

    render_summary() {
        this.page.main.find("#frappe-sign-request-summary").html(`
            <p><strong>${frappe.utils.escape_html(this.request.request_title || this.request.name)}</strong></p>
            <p>${__("Status")}: <strong>${frappe.utils.escape_html(this.request.status || "")}</strong></p>
            <p>${__("Source")}: ${frappe.utils.escape_html(this.request.source_type || "")}</p>
            <p>${frappe.utils.escape_html(this.request.source_doctype || "")} ${frappe.utils.escape_html(this.request.source_name || "")}</p>
        `);
    }

    render_signers() {
        const select = this.page.main.find("#frappe-sign-active-signer");
        select.empty();

        for (const signer of this.signers) {
            const label = signer.full_name || signer.email || signer.user || signer.name;

            select.append(`
                <option value="${frappe.utils.escape_html(signer.name)}">
                    ${frappe.utils.escape_html(label)}
                </option>
            `);
        }

        if (this.signers.length) {
            this.selected_signer = this.signers[0].name;
            select.val(this.selected_signer);
        }
    }

    async load_pdf_document() {
        if (!this.request.source_pdf) {
            frappe.throw(__("No source PDF is attached to this request."));
        }

        this.pdf_doc = await window.pdfjsLib.getDocument(this.request.source_pdf).promise;
    }

    async render_pdf() {
        this.page.main.find("#frappe-sign-zoom-label").text(`${Math.round(this.scale * 100)}%`);

        const pages_container = this.page.main.find("#frappe-sign-pdf-pages");
        const thumbnails_container = this.page.main.find("#frappe-sign-page-thumbnails");

        pages_container.empty();
        thumbnails_container.empty();

        for (let page_number = 1; page_number <= this.pdf_doc.numPages; page_number++) {
            await this.render_page(page_number, pages_container, thumbnails_container);
        }

        this.render_existing_fields();
    }

    async render_page(page_number, pages_container, thumbnails_container) {
        const page = await this.pdf_doc.getPage(page_number);
        const viewport = page.getViewport({ scale: this.scale });

        const page_wrapper = $(`
            <div class="frappe-sign-pdf-page-wrapper" id="frappe-sign-page-${page_number}" data-page="${page_number}">
                <div class="frappe-sign-page-label">${__("Page")} ${page_number}</div>
                <div class="frappe-sign-pdf-page" data-page="${page_number}">
                    <canvas class="frappe-sign-pdf-canvas"></canvas>
                    <div class="frappe-sign-page-overlay" data-page="${page_number}"></div>
                </div>
            </div>
        `);

        const canvas = page_wrapper.find("canvas")[0];
        const context = canvas.getContext("2d");

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        page_wrapper.find(".frappe-sign-pdf-page").css({
            width: `${viewport.width}px`,
            height: `${viewport.height}px`,
        });

        page_wrapper.find(".frappe-sign-page-overlay").css({
            width: `${viewport.width}px`,
            height: `${viewport.height}px`,
        });

        pages_container.append(page_wrapper);

        await page.render({
            canvasContext: context,
            viewport: viewport,
        }).promise;

        this.bind_page_drop(page_wrapper.find(".frappe-sign-page-overlay"));

        await this.render_thumbnail(page, page_number, thumbnails_container);
    }

    async render_thumbnail(page, page_number, thumbnails_container) {
        const viewport = page.getViewport({ scale: 0.22 });

        const thumb = $(`
            <div class="frappe-sign-page-thumb" data-page="${page_number}">
                <canvas></canvas>
                <div>${__("Page")} ${page_number}</div>
            </div>
        `);

        const canvas = thumb.find("canvas")[0];
        const context = canvas.getContext("2d");

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        thumbnails_container.append(thumb);

        await page.render({
            canvasContext: context,
            viewport: viewport,
        }).promise;

        thumb.on("click", () => {
            document.getElementById(`frappe-sign-page-${page_number}`).scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
        });
    }

    bind_page_drop(overlay) {
        overlay.on("dragover", (event) => {
            event.preventDefault();
        });

        overlay.on("drop", (event) => {
            event.preventDefault();

            const original_event = event.originalEvent;
            const field_type = original_event.dataTransfer.getData("text/plain") || this.selected_field_type;

            if (!this.selected_signer) {
                frappe.msgprint(__("Please select a signer first."));
                return;
            }

            const rect = overlay[0].getBoundingClientRect();

            const default_size = this.get_default_field_size(field_type);

            const left = original_event.clientX - rect.left;
            const top = original_event.clientY - rect.top;

            const field = {
                signer: this.selected_signer,
                signer_label: this.get_signer_label(this.selected_signer),
                field_type: field_type,
                page: cint(overlay.attr("data-page")),
                x_ratio: this.clamp_ratio(left / rect.width),
                y_ratio: this.clamp_ratio(top / rect.height),
                width_ratio: this.clamp_ratio(default_size.width / rect.width),
                height_ratio: this.clamp_ratio(default_size.height / rect.height),
                required: 1,
                read_only: 0,
                default_value: "",
            };

            this.fields.push(field);
            this.render_existing_fields();
            this.render_field_list();
        });
    }

    get_default_field_size(field_type) {
        const sizes = {
            Signature: { width: 170, height: 54 },
            Initials: { width: 90, height: 42 },
            Name: { width: 160, height: 34 },
            Email: { width: 190, height: 34 },
            Date: { width: 110, height: 34 },
            Text: { width: 180, height: 40 },
            Checkbox: { width: 28, height: 28 },
        };

        return sizes[field_type] || { width: 160, height: 40 };
    }

    render_existing_fields() {
        this.page.main.find(".frappe-sign-field-box").remove();

        this.fields.forEach((field, index) => {
            const overlay = this.page.main.find(`.frappe-sign-page-overlay[data-page="${field.page}"]`);

            if (!overlay.length) {
                return;
            }

            const width = overlay.width();
            const height = overlay.height();

            const box = $(`
                <div class="frappe-sign-field-box" data-index="${index}">
                    <div class="frappe-sign-field-box-label">
                        ${frappe.utils.escape_html(field.field_type)}
                    </div>
                    <div class="frappe-sign-field-box-signer">
                        ${frappe.utils.escape_html(field.signer_label || this.get_signer_label(field.signer))}
                    </div>
                    <button class="frappe-sign-field-remove" title="${__("Remove")}">×</button>
                    <div class="frappe-sign-resize-handle"></div>
                </div>
            `);

            box.css({
                left: `${field.x_ratio * width}px`,
                top: `${field.y_ratio * height}px`,
                width: `${field.width_ratio * width}px`,
                height: `${field.height_ratio * height}px`,
            });

            overlay.append(box);

            this.make_field_draggable(box, overlay, field);
            this.make_field_resizable(box, overlay, field);

            box.find(".frappe-sign-field-remove").on("click", (event) => {
                event.stopPropagation();
                this.fields.splice(index, 1);
                this.render_existing_fields();
                this.render_field_list();
            });
        });
    }

    make_field_draggable(box, overlay, field) {
        let is_dragging = false;
        let start_x = 0;
        let start_y = 0;
        let start_left = 0;
        let start_top = 0;

        box.on("mousedown", (event) => {
            if ($(event.target).hasClass("frappe-sign-resize-handle")) {
                return;
            }

            if ($(event.target).hasClass("frappe-sign-field-remove")) {
                return;
            }

            is_dragging = true;
            start_x = event.clientX;
            start_y = event.clientY;
            start_left = parseFloat(box.css("left"));
            start_top = parseFloat(box.css("top"));

            event.preventDefault();
        });

        $(document).on("mousemove.frappe_sign_drag", (event) => {
            if (!is_dragging) {
                return;
            }

            const overlay_width = overlay.width();
            const overlay_height = overlay.height();
            const box_width = box.outerWidth();
            const box_height = box.outerHeight();

            let new_left = start_left + (event.clientX - start_x);
            let new_top = start_top + (event.clientY - start_y);

            new_left = Math.max(0, Math.min(new_left, overlay_width - box_width));
            new_top = Math.max(0, Math.min(new_top, overlay_height - box_height));

            box.css({
                left: `${new_left}px`,
                top: `${new_top}px`,
            });

            field.x_ratio = this.round_ratio(new_left / overlay_width);
            field.y_ratio = this.round_ratio(new_top / overlay_height);
        });

        $(document).on("mouseup.frappe_sign_drag", () => {
            if (is_dragging) {
                is_dragging = false;
                this.render_field_list();
            }
        });
    }

    make_field_resizable(box, overlay, field) {
        let is_resizing = false;
        let start_x = 0;
        let start_y = 0;
        let start_width = 0;
        let start_height = 0;

        box.find(".frappe-sign-resize-handle").on("mousedown", (event) => {
            is_resizing = true;
            start_x = event.clientX;
            start_y = event.clientY;
            start_width = box.outerWidth();
            start_height = box.outerHeight();

            event.stopPropagation();
            event.preventDefault();
        });

        $(document).on("mousemove.frappe_sign_resize", (event) => {
            if (!is_resizing) {
                return;
            }

            const overlay_width = overlay.width();
            const overlay_height = overlay.height();

            const left = parseFloat(box.css("left"));
            const top = parseFloat(box.css("top"));

            let new_width = start_width + (event.clientX - start_x);
            let new_height = start_height + (event.clientY - start_y);

            new_width = Math.max(24, Math.min(new_width, overlay_width - left));
            new_height = Math.max(24, Math.min(new_height, overlay_height - top));

            box.css({
                width: `${new_width}px`,
                height: `${new_height}px`,
            });

            field.width_ratio = this.round_ratio(new_width / overlay_width);
            field.height_ratio = this.round_ratio(new_height / overlay_height);
        });

        $(document).on("mouseup.frappe_sign_resize", () => {
            if (is_resizing) {
                is_resizing = false;
                this.render_field_list();
            }
        });
    }

    render_field_list() {
        const container = this.page.main.find("#frappe-sign-field-list");
        container.empty();

        if (!this.fields.length) {
            container.html(`<p class="frappe-sign-muted">${__("No fields added yet.")}</p>`);
            return;
        }

        this.fields.forEach((field, index) => {
            const row = $(`
                <div class="frappe-sign-field-row">
                    <div>
                        <strong>${frappe.utils.escape_html(field.field_type)}</strong>
                        <br>
                        <small>
                            ${frappe.utils.escape_html(field.signer_label || "")}
                            · ${__("Page")} ${field.page}
                            · x:${field.x_ratio}
                            · y:${field.y_ratio}
                        </small>
                    </div>
                    <button class="btn btn-xs btn-danger">${__("Remove")}</button>
                </div>
            `);

            row.find("button").on("click", () => {
                this.fields.splice(index, 1);
                this.render_existing_fields();
                this.render_field_list();
            });

            container.append(row);
        });
    }

    get_signer_label(signer_name) {
        const signer = this.signers.find((row) => row.name === signer_name);

        if (!signer) {
            return "";
        }

        return signer.full_name || signer.email || signer.user || signer.name;
    }

    clamp_ratio(value) {
        return this.round_ratio(Math.max(0, Math.min(value, 1)));
    }

    round_ratio(value) {
        return Math.round(value * 100000) / 100000;
    }

    async save_fields() {
        await frappe.call({
            method: "frappe_sign.api.designer.save_fields",
            args: {
                request_name: this.request_name,
                fields_json: JSON.stringify(this.fields),
            },
            freeze: true,
            freeze_message: __("Saving fields..."),
        });

        frappe.show_alert({
            message: __("Fields saved."),
            indicator: "green",
        });

        await this.load_request();
    }

    async send_request() {
        if (!this.fields.length) {
            frappe.msgprint(__("Please add at least one signing field before sending."));
            return;
        }

        frappe.confirm(__("Send this signing request now?"), async () => {
            await this.save_fields();

            await frappe.call({
                method: "frappe_sign.api.request.send_request",
                args: {
                    request_name: this.request_name,
                },
                freeze: true,
                freeze_message: __("Sending request..."),
            });

            frappe.show_alert({
                message: __("Signing request sent."),
                indicator: "green",
            });

            frappe.set_route("Form", "Frappe Sign Request", this.request_name);
        });
    }
}