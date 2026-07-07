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
        this.scale = 1.0;

        this.selected_signer = null;
        this.selected_field_type = "Signature";

        this.palette_drag = null;
        this.ghost = null;

        this.is_dirty = false;
        this.is_read_only = false;

        this.make();
        this.inject_designer_css();

        this.load_pdfjs()
            .then(() => this.resolve_route())
            .catch((error) => {
                console.error(error);
                frappe.msgprint({
                    title: __("PDF.js Load Failed"),
                    message: __(
                        "PDF.js could not be loaded. Confirm that /assets/frappe_sign/js/pdfjs/pdf.min.js and pdf.worker.min.js exist and contain the actual PDF.js build files."
                    ),
                    indicator: "red",
                });
            });
    }

    make() {
        this.page.main.html(`
            <div class="frappe-sign frappe-sign-designer">
                <div class="frappe-sign-designer-toolbar">
                    <div class="frappe-sign-toolbar-left">
                        <button class="btn btn-default" id="frappe-sign-back-to-request">
                            ${__("Back to Request")}
                        </button>

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
                        <span id="frappe-sign-zoom-label">100%</span>
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
                            <h4>${__("Fields")}</h4>
                            <div class="frappe-sign-field-palette">
                                ${this.make_palette_item("Signature")}
                                ${this.make_palette_item("Initials")}
                                ${this.make_palette_item("Name")}
                                ${this.make_palette_item("Email")}
                                ${this.make_palette_item("Date")}
                                ${this.make_palette_item("Text")}
                                ${this.make_palette_item("Checkbox")}
                            </div>
                            <p class="frappe-sign-help">
                                ${__("Drag a field onto the PDF, or click a field type and then click the PDF.")}
                            </p>
                        </div>

                        <div class="frappe-sign-card">
                            <h4>${__("Placed Fields")}</h4>
                            <div id="frappe-sign-field-list"></div>
                        </div>
                    </aside>

                    <main class="frappe-sign-document-panel">
                        <div id="frappe-sign-pdf-pages" class="frappe-sign-pdf-pages">
                            <div class="frappe-sign-loading">${__("Loading PDF...")}</div>
                        </div>
                    </main>

                    <aside class="frappe-sign-right-panel">
                        <div class="frappe-sign-card frappe-sign-pages-card">
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
            <div class="frappe-sign-palette-item" data-field-type="${frappe.utils.escape_html(field_type)}">
                <span class="frappe-sign-palette-icon">+</span>
                <span>${__(field_type)}</span>
            </div>
        `;
    }

    bind_events() {
        this.page.main.find("#frappe-sign-back-to-request").on("click", () => {
            if (!this.request_name) {
                frappe.set_route("List", "Frappe Sign Request");
                return;
            }

            frappe.set_route("Form", "Frappe Sign Request", this.request_name);
        });

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

        this.page.main.find(".frappe-sign-palette-item").on("mousedown", (event) => {
            this.start_palette_drag(event);
        });

        this.page.main.find(".frappe-sign-palette-item").on("click", (event) => {
            const field_type = event.currentTarget.dataset.fieldType;

            if (!field_type) {
                return;
            }

            this.selected_field_type = field_type;

            this.page.main.find(".frappe-sign-palette-item").removeClass("active");
            $(event.currentTarget).addClass("active");

            frappe.show_alert({
                message: __("{0} selected. Click on the PDF page to place it.", [field_type]),
                indicator: "blue",
            });
        });
    }

    async load_pdfjs() {
        if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                "/assets/frappe_sign/js/pdfjs/pdf.worker.min.js";
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

        this.is_dirty = false;
        this.is_read_only = !["Draft", "Prepared"].includes(this.request.status);

        this.render_summary();
        this.render_signers();
        this.render_toolbar_state();
        this.render_field_list();

        await this.load_pdf_document();
        await this.render_pdf();
    }

    render_summary() {
        const source_line =
            this.request.source_type === "Uploaded PDF"
                ? __("Uploaded PDF")
                : `${this.request.source_doctype || ""} ${this.request.source_name || ""}`;

        this.page.main.find("#frappe-sign-request-summary").html(`
            <p><strong>${frappe.utils.escape_html(this.request.request_title || this.request.name)}</strong></p>
            <p>${__("Status")}: <strong>${frappe.utils.escape_html(this.request.status || "")}</strong></p>
            <p>${__("Source")}: ${frappe.utils.escape_html(source_line)}</p>
            ${
                this.is_read_only
                    ? `<p class="frappe-sign-warning">${__("This request has been sent and the field layout is read-only.")}</p>`
                    : ""
            }
        `);
    }

    render_signers() {
        const select = this.page.main.find("#frappe-sign-active-signer");
        select.empty();

        if (!this.signers.length) {
            select.append(`<option value="">${__("No signers available")}</option>`);
            this.selected_signer = null;
            return;
        }

        for (const signer of this.signers) {
            const label = signer.full_name || signer.email || signer.user || signer.name;

            select.append(`
                <option value="${frappe.utils.escape_html(signer.name)}">
                    ${frappe.utils.escape_html(label)}
                </option>
            `);
        }

        if (!this.selected_signer || !this.signers.some((row) => row.name === this.selected_signer)) {
            this.selected_signer = this.signers[0].name;
        }

        select.val(this.selected_signer);
    }

    render_toolbar_state() {
        this.page.main.find("#frappe-sign-save-fields").prop("disabled", this.is_read_only);
        this.page.main.find("#frappe-sign-send-request").prop("disabled", this.is_read_only);
        this.page.main.find(".frappe-sign-palette-item").toggleClass("disabled", this.is_read_only);
    }

    async load_pdf_document() {
        if (!this.request.source_pdf) {
            frappe.throw(__("No source PDF is attached to this request."));
        }

        this.pdf_doc = await window.pdfjsLib.getDocument(this.request.source_pdf).promise;
    }

    async render_pdf() {
        if (!this.pdf_doc) {
            return;
        }

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

        this.bind_page_click(page_wrapper.find(".frappe-sign-page-overlay"));

        await this.render_thumbnail(page, page_number, thumbnails_container);
    }

    async render_thumbnail(page, page_number, thumbnails_container) {
        const viewport = page.getViewport({ scale: 0.18 });

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
            const target = document.getElementById(`frappe-sign-page-${page_number}`);

            if (target) {
                target.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                });
            }

            this.page.main.find(".frappe-sign-page-thumb").removeClass("active");
            thumb.addClass("active");
        });
    }

    bind_page_click(overlay) {
        overlay.off("click.frappe_sign_place");

        overlay.on("click.frappe_sign_place", (event) => {
            if (this.is_read_only) {
                return;
            }

            if (this.palette_drag) {
                return;
            }

            if ($(event.target).closest(".frappe-sign-field-box").length) {
                return;
            }

            if (!this.selected_field_type) {
                return;
            }

            this.add_field_at_point(overlay, event.clientX, event.clientY, this.selected_field_type);
        });
    }

    start_palette_drag(event) {
        if (this.is_read_only) {
            return;
        }

        const target = $(event.currentTarget);
        const field_type = target.attr("data-field-type");

        if (!field_type) {
            return;
        }

        if (!this.selected_signer) {
            frappe.msgprint(__("Please select a signer first."));
            return;
        }

        this.selected_field_type = field_type;

        this.page.main.find(".frappe-sign-palette-item").removeClass("active");
        target.addClass("active");

        this.palette_drag = {
            field_type: field_type,
            start_x: event.clientX,
            start_y: event.clientY,
        };

        this.create_drag_ghost(field_type, event.clientX, event.clientY);

        $(document).off(".frappe_sign_palette_drag");

        $(document).on("mousemove.frappe_sign_palette_drag", (move_event) => {
            this.move_palette_drag(move_event);
        });

        $(document).on("mouseup.frappe_sign_palette_drag", (up_event) => {
            this.finish_palette_drag(up_event);
        });

        event.preventDefault();
    }

    create_drag_ghost(field_type, client_x, client_y) {
        this.remove_drag_ghost();

        this.ghost = $(`
            <div class="frappe-sign-drag-ghost">
                ${frappe.utils.escape_html(field_type)}
            </div>
        `);

        $("body").append(this.ghost);

        this.ghost.css({
            left: `${client_x + 12}px`,
            top: `${client_y + 12}px`,
        });
    }

    move_palette_drag(event) {
        if (!this.palette_drag || !this.ghost) {
            return;
        }

        this.ghost.css({
            left: `${event.clientX + 12}px`,
            top: `${event.clientY + 12}px`,
        });
    }

    finish_palette_drag(event) {
        if (!this.palette_drag) {
            return;
        }

        const field_type = this.palette_drag.field_type;
        const overlay = this.get_overlay_at_point(event.clientX, event.clientY);

        if (overlay) {
            this.add_field_at_point(overlay, event.clientX, event.clientY, field_type);
        }

        this.palette_drag = null;
        this.remove_drag_ghost();

        $(document).off(".frappe_sign_palette_drag");
    }

    remove_drag_ghost() {
        if (this.ghost) {
            this.ghost.remove();
            this.ghost = null;
        }
    }

    get_overlay_at_point(client_x, client_y) {
        const overlays = this.page.main.find(".frappe-sign-page-overlay").toArray();

        for (const overlay_el of overlays) {
            const rect = overlay_el.getBoundingClientRect();

            if (
                client_x >= rect.left &&
                client_x <= rect.right &&
                client_y >= rect.top &&
                client_y <= rect.bottom
            ) {
                return $(overlay_el);
            }
        }

        return null;
    }

    add_field_at_point(overlay, client_x, client_y, field_type) {
        if (this.is_read_only) {
            return;
        }

        if (!this.selected_signer) {
            frappe.msgprint(__("Please select a signer first."));
            return;
        }

        const rect = overlay[0].getBoundingClientRect();
        const default_size = this.get_default_field_size(field_type);

        const left = client_x - rect.left - default_size.width / 2;
        const top = client_y - rect.top - default_size.height / 2;

        const safe_left = Math.max(0, Math.min(left, rect.width - default_size.width));
        const safe_top = Math.max(0, Math.min(top, rect.height - default_size.height));

        const field = {
            signer: this.selected_signer,
            signer_label: this.get_signer_label(this.selected_signer),
            field_type: field_type,
            page: cint(overlay.attr("data-page")),
            x_ratio: this.round_ratio(safe_left / rect.width),
            y_ratio: this.round_ratio(safe_top / rect.height),
            width_ratio: this.round_ratio(default_size.width / rect.width),
            height_ratio: this.round_ratio(default_size.height / rect.height),
            required: 1,
            read_only: 0,
            default_value: "",
        };

        this.fields.push(field);
        this.mark_dirty();
        this.render_existing_fields();
        this.render_field_list();
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
                    ${
                        this.is_read_only
                            ? ""
                            : `<button class="frappe-sign-field-remove" title="${__("Remove")}">×</button>
                               <div class="frappe-sign-resize-handle"></div>`
                    }
                </div>
            `);

            box.css({
                left: `${field.x_ratio * width}px`,
                top: `${field.y_ratio * height}px`,
                width: `${field.width_ratio * width}px`,
                height: `${field.height_ratio * height}px`,
            });

            overlay.append(box);

            if (!this.is_read_only) {
                this.make_field_draggable(box, overlay, field);
                this.make_field_resizable(box, overlay, field);

                box.find(".frappe-sign-field-remove").on("click", (event) => {
                    event.stopPropagation();
                    this.fields.splice(index, 1);
                    this.mark_dirty();
                    this.render_existing_fields();
                    this.render_field_list();
                });
            }
        });
    }

    make_field_draggable(box, overlay, field) {
        let is_dragging = false;
        let start_x = 0;
        let start_y = 0;
        let start_left = 0;
        let start_top = 0;

        box.off("mousedown.frappe_sign_field_drag");

        box.on("mousedown.frappe_sign_field_drag", (event) => {
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

            $(document).off(".frappe_sign_field_drag");

            $(document).on("mousemove.frappe_sign_field_drag", (move_event) => {
                if (!is_dragging) {
                    return;
                }

                const overlay_width = overlay.width();
                const overlay_height = overlay.height();
                const box_width = box.outerWidth();
                const box_height = box.outerHeight();

                let new_left = start_left + (move_event.clientX - start_x);
                let new_top = start_top + (move_event.clientY - start_y);

                new_left = Math.max(0, Math.min(new_left, overlay_width - box_width));
                new_top = Math.max(0, Math.min(new_top, overlay_height - box_height));

                box.css({
                    left: `${new_left}px`,
                    top: `${new_top}px`,
                });

                field.x_ratio = this.round_ratio(new_left / overlay_width);
                field.y_ratio = this.round_ratio(new_top / overlay_height);

                this.mark_dirty();
            });

            $(document).on("mouseup.frappe_sign_field_drag", () => {
                if (is_dragging) {
                    is_dragging = false;
                    this.render_field_list();
                }

                $(document).off(".frappe_sign_field_drag");
            });

            event.stopPropagation();
            event.preventDefault();
        });
    }

    make_field_resizable(box, overlay, field) {
        let is_resizing = false;
        let start_x = 0;
        let start_y = 0;
        let start_width = 0;
        let start_height = 0;

        const handle = box.find(".frappe-sign-resize-handle");

        handle.off("mousedown.frappe_sign_field_resize");

        handle.on("mousedown.frappe_sign_field_resize", (event) => {
            is_resizing = true;
            start_x = event.clientX;
            start_y = event.clientY;
            start_width = box.outerWidth();
            start_height = box.outerHeight();

            $(document).off(".frappe_sign_field_resize");

            $(document).on("mousemove.frappe_sign_field_resize", (move_event) => {
                if (!is_resizing) {
                    return;
                }

                const overlay_width = overlay.width();
                const overlay_height = overlay.height();

                const left = parseFloat(box.css("left"));
                const top = parseFloat(box.css("top"));

                let new_width = start_width + (move_event.clientX - start_x);
                let new_height = start_height + (move_event.clientY - start_y);

                new_width = Math.max(24, Math.min(new_width, overlay_width - left));
                new_height = Math.max(24, Math.min(new_height, overlay_height - top));

                box.css({
                    width: `${new_width}px`,
                    height: `${new_height}px`,
                });

                field.width_ratio = this.round_ratio(new_width / overlay_width);
                field.height_ratio = this.round_ratio(new_height / overlay_height);

                this.mark_dirty();
            });

            $(document).on("mouseup.frappe_sign_field_resize", () => {
                if (is_resizing) {
                    is_resizing = false;
                    this.render_field_list();
                }

                $(document).off(".frappe_sign_field_resize");
            });

            event.stopPropagation();
            event.preventDefault();
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
                <div class="frappe-sign-field-row" data-index="${index}">
                    <div>
                        <strong>${frappe.utils.escape_html(field.field_type)}</strong>
                        <br>
                        <small>
                            ${frappe.utils.escape_html(field.signer_label || this.get_signer_label(field.signer))}
                            · ${__("Page")} ${field.page}
                            · x:${field.x_ratio}
                            · y:${field.y_ratio}
                        </small>
                    </div>
                    ${
                        this.is_read_only
                            ? ""
                            : `<button class="btn btn-xs btn-danger">${__("Remove")}</button>`
                    }
                </div>
            `);

            row.on("click", () => {
                const page_el = document.getElementById(`frappe-sign-page-${field.page}`);

                if (page_el) {
                    page_el.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                    });
                }

                this.page.main.find(".frappe-sign-field-box").removeClass("active");
                this.page.main.find(`.frappe-sign-field-box[data-index="${index}"]`).addClass("active");
            });

            row.find("button").on("click", (event) => {
                event.stopPropagation();
                this.fields.splice(index, 1);
                this.mark_dirty();
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

    round_ratio(value) {
        return Math.round(value * 100000) / 100000;
    }

    mark_dirty() {
        this.is_dirty = true;
        this.page.set_indicator(__("Unsaved"), "orange");
    }

    mark_clean() {
        this.is_dirty = false;
        this.page.set_indicator(__("Saved"), "green");
    }

    async save_fields() {
        if (this.is_read_only) {
            frappe.msgprint(__("This request is read-only because it has already been sent."));
            return;
        }

        await frappe.call({
            method: "frappe_sign.api.designer.save_fields",
            args: {
                request_name: this.request_name,
                fields_json: JSON.stringify(this.fields),
            },
            freeze: true,
            freeze_message: __("Saving fields..."),
        });

        this.mark_clean();

        frappe.show_alert({
            message: __("Fields saved."),
            indicator: "green",
        });

        await this.load_request();
    }

    async send_request() {
        if (this.is_read_only) {
            frappe.msgprint(__("This request has already been sent."));
            return;
        }

        if (!this.fields.length) {
            frappe.msgprint(__("Please add at least one signing field before sending."));
            return;
        }

        frappe.confirm(__("Send this signing request now?"), async () => {
            if (this.is_dirty) {
                await this.save_fields();
            } else {
                await this.save_fields();
            }

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

    inject_designer_css() {
        if (document.getElementById("frappe-sign-designer-inline-css")) {
            return;
        }

        const style = document.createElement("style");
        style.id = "frappe-sign-designer-inline-css";
        style.textContent = `
            .frappe-sign.frappe-sign-designer {
                max-width: none;
                width: 100%;
                margin: 0;
                padding: 0;
                --frappe-sign-border: #d1d8dd;
                --frappe-sign-card-bg: #ffffff;
                --frappe-sign-primary: #2490ef;
                --frappe-sign-danger: #e24c4b;
                --frappe-sign-muted: #6b7280;
            }

            .frappe-sign-designer-toolbar {
                position: sticky;
                top: 0;
                z-index: 50;
                background: var(--frappe-sign-card-bg);
                border: 1px solid var(--frappe-sign-border);
                border-radius: 8px;
                padding: 10px 12px;
                margin-bottom: 12px;
                display: flex;
                justify-content: space-between;
                gap: 12px;
                align-items: center;
            }

            .frappe-sign-toolbar-left {
                display: flex;
                gap: 8px;
                align-items: center;
                flex-wrap: wrap;
            }

            .frappe-sign-zoom-controls {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            #frappe-sign-zoom-label {
                min-width: 48px;
                text-align: center;
                font-weight: 700;
            }

            .frappe-sign-designer-layout {
                display: grid;
                grid-template-columns: 280px minmax(520px, 1fr) 180px;
                gap: 12px;
                align-items: start;
                width: 100%;
            }

            .frappe-sign-left-panel,
            .frappe-sign-right-panel {
                position: sticky;
                top: 64px;
                display: flex;
                flex-direction: column;
                gap: 12px;
                max-height: calc(100vh - 96px);
                overflow: auto;
            }

            .frappe-sign-card {
                background: var(--frappe-sign-card-bg);
                border: 1px solid var(--frappe-sign-border);
                border-radius: 8px;
                padding: 12px;
            }

            .frappe-sign-card h4 {
                margin: 0 0 10px;
                font-size: 14px;
                font-weight: 700;
            }

            .frappe-sign-muted,
            .frappe-sign-help {
                color: var(--frappe-sign-muted);
                font-size: 12px;
            }

            .frappe-sign-warning {
                color: #b7791f;
                font-size: 12px;
                font-weight: 600;
            }

            .frappe-sign-field-palette {
                display: grid;
                gap: 8px;
            }

            .frappe-sign-palette-item {
                display: flex;
                align-items: center;
                gap: 8px;
                border: 1px solid var(--frappe-sign-border);
                border-radius: 6px;
                background: #f8fafc;
                padding: 8px 10px;
                cursor: grab;
                user-select: none;
                font-weight: 600;
            }

            .frappe-sign-palette-item:hover,
            .frappe-sign-palette-item.active {
                border-color: var(--frappe-sign-primary);
                background: #eef6ff;
            }

            .frappe-sign-palette-item.disabled {
                opacity: 0.55;
                cursor: not-allowed;
            }

            .frappe-sign-palette-icon {
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: var(--frappe-sign-primary);
                color: #ffffff;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 13px;
                line-height: 1;
            }

            .frappe-sign-document-panel {
                min-width: 0;
                background: #eef1f5;
                border: 1px solid var(--frappe-sign-border);
                border-radius: 8px;
                padding: 18px;
                height: calc(100vh - 120px);
                overflow: auto;
            }

            .frappe-sign-pdf-pages {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 18px;
            }

            .frappe-sign-loading {
                padding: 24px;
                color: var(--frappe-sign-muted);
            }

            .frappe-sign-pdf-page-wrapper {
                width: fit-content;
            }

            .frappe-sign-page-label {
                font-size: 12px;
                font-weight: 700;
                color: var(--frappe-sign-muted);
                margin-bottom: 6px;
            }

            .frappe-sign-pdf-page {
                position: relative;
                background: #ffffff;
                border: 1px solid var(--frappe-sign-border);
                box-shadow: 0 3px 16px rgba(0, 0, 0, 0.16);
            }

            .frappe-sign-pdf-canvas {
                display: block;
            }

            .frappe-sign-page-overlay {
                position: absolute;
                inset: 0;
                z-index: 5;
                cursor: crosshair;
            }

            .frappe-sign-field-box {
                position: absolute;
                z-index: 20;
                border: 2px solid var(--frappe-sign-primary);
                background: rgba(36, 144, 239, 0.12);
                border-radius: 4px;
                padding: 4px;
                cursor: move;
                overflow: visible;
                min-width: 24px;
                min-height: 24px;
                box-sizing: border-box;
            }

            .frappe-sign-field-box.active {
                box-shadow: 0 0 0 3px rgba(36, 144, 239, 0.22);
            }

            .frappe-sign-field-box-label {
                font-size: 11px;
                font-weight: 700;
                line-height: 1.1;
                pointer-events: none;
            }

            .frappe-sign-field-box-signer {
                font-size: 10px;
                line-height: 1.1;
                color: #334155;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                pointer-events: none;
            }

            .frappe-sign-field-remove {
                position: absolute;
                top: -9px;
                right: -9px;
                width: 20px;
                height: 20px;
                border: 0;
                border-radius: 50%;
                background: var(--frappe-sign-danger);
                color: #ffffff;
                font-size: 14px;
                line-height: 18px;
                padding: 0;
                cursor: pointer;
                z-index: 30;
            }

            .frappe-sign-resize-handle {
                position: absolute;
                right: 0;
                bottom: 0;
                width: 13px;
                height: 13px;
                background: var(--frappe-sign-primary);
                cursor: nwse-resize;
                border-top-left-radius: 4px;
                z-index: 30;
            }

            .frappe-sign-page-thumbnails {
                display: grid;
                gap: 10px;
            }

            .frappe-sign-page-thumb {
                border: 1px solid var(--frappe-sign-border);
                border-radius: 6px;
                padding: 6px;
                background: #ffffff;
                cursor: pointer;
                text-align: center;
                font-size: 11px;
                font-weight: 600;
            }

            .frappe-sign-page-thumb:hover,
            .frappe-sign-page-thumb.active {
                border-color: var(--frappe-sign-primary);
                background: #eef6ff;
            }

            .frappe-sign-page-thumb canvas {
                max-width: 100%;
                display: block;
                margin: 0 auto 4px;
                border: 1px solid #e5e7eb;
            }

            .frappe-sign-field-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 6px;
                padding: 8px 0;
                border-bottom: 1px solid var(--frappe-sign-border);
                cursor: pointer;
            }

            .frappe-sign-field-row:last-child {
                border-bottom: 0;
            }

            .frappe-sign-field-row:hover {
                background: #f8fafc;
            }

            .frappe-sign-drag-ghost {
                position: fixed;
                z-index: 99999;
                pointer-events: none;
                border: 2px solid var(--frappe-sign-primary);
                background: rgba(36, 144, 239, 0.16);
                color: #0f172a;
                border-radius: 6px;
                padding: 8px 12px;
                font-weight: 700;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
            }
        `;

        document.head.appendChild(style);
    }
}