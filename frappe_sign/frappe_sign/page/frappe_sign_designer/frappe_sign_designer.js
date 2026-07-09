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

        this.grid_size = 20;
        this.snap_to_grid = true;
        this.alignment_threshold = 6;

        this.selected_signer = null;
        this.selected_field_type = null;

        this.signer_colors = [
            "#2490ef",
            "#2e9d64",
            "#f59e0b",
            "#8b5cf6",
            "#ef4444",
            "#06b6d4",
            "#ec4899",
            "#64748b",
        ];

        this.palette_drag = null;
        this.ghost = null;
        this.suppress_pdf_click_until = 0;

        this.is_dirty = false;
        this.is_read_only = false;

        this.make();

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

                        <button class="btn btn-primary" id="frappe-sign-toggle-snap">
                            ${__("Snap")}: ${__("On")}
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
                            <div class="frappe-sign-signer-select-row">
                                <span id="frappe-sign-active-signer-color" class="frappe-sign-signer-color"></span>
                                <select class="form-control" id="frappe-sign-active-signer"></select>
                            </div>
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

        this.page.main.find("#frappe-sign-toggle-snap").on("click", () => {
            this.snap_to_grid = !this.snap_to_grid;
            this.update_snap_button();

            frappe.show_alert({
                message: this.snap_to_grid
                    ? __("Snap-to-grid enabled.")
                    : __("Snap-to-grid disabled."),
                indicator: this.snap_to_grid ? "green" : "gray",
            });
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
            this.update_active_signer_color();
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

    async ensure_pdf_ready() {
        const response = await frappe.call({
            method: "frappe_sign.api.designer.ensure_designer_pdf",
            args: {
                request_name: this.request_name,
            },
            freeze: true,
            freeze_message: __("Preparing source PDF..."),
        });

        const result = response.message;

        if (!result) {
            frappe.msgprint(__("Could not prepare the source PDF."));
            return false;
        }

        if (result.status === "ready") {
            return true;
        }

        if (result.status === "upload_required") {
            return await this.prompt_for_source_pdf_upload();
        }

        frappe.msgprint(result.message || __("Could not prepare the source PDF."));
        return false;
    }

    prompt_for_source_pdf_upload() {
        return new Promise((resolve) => {
            let resolved = false;

            const dialog = new frappe.ui.Dialog({
                title: __("Upload Source PDF"),
                fields: [
                    {
                        fieldname: "help",
                        fieldtype: "HTML",
                        options: `
                            <p>
                                ${__("This signing request does not have a source PDF yet. Please upload the PDF to continue to the Designer.")}
                            </p>
                        `,
                    },
                    {
                        fieldname: "pdf_file",
                        fieldtype: "Attach",
                        label: __("PDF File"),
                        reqd: 1,
                    },
                ],
                primary_action_label: __("Upload and Continue"),
                primary_action: async (values) => {
                    if (!values.pdf_file) {
                        frappe.msgprint(__("Please upload a PDF file."));
                        return;
                    }

                    if (!values.pdf_file.toLowerCase().endsWith(".pdf")) {
                        frappe.msgprint(__("Only PDF files are supported."));
                        return;
                    }

                    try {
                        await frappe.call({
                            method: "frappe_sign.api.designer.upload_designer_source_pdf_from_file_url",
                            args: {
                                request_name: this.request_name,
                                file_url: values.pdf_file,
                            },
                            freeze: true,
                            freeze_message: __("Attaching source PDF..."),
                        });

                        resolved = true;
                        dialog.hide();

                        frappe.show_alert({
                            message: __("Source PDF attached."),
                            indicator: "green",
                        });

                        resolve(true);
                    } catch (error) {
                        console.error(error);
                        frappe.msgprint(__("Could not attach the source PDF."));
                        resolve(false);
                    }
                },
                onhide: () => {
                    if (!resolved) {
                        resolve(false);
                    }
                },
            });

            dialog.show();
        });
    }

    async load_request() {
        if (!this.request_name) {
            return;
        }

        if (!(await this.ensure_pdf_ready())) {
            this.page.main.find("#frappe-sign-pdf-pages").html(`
                <div class="frappe-sign-message frappe-sign-message-error">
                    <h2>${__("Source PDF Required")}</h2>
                    <p>${__("A source PDF is required before the Designer can load.")}</p>
                </div>
            `);
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

        this.clear_selected_field_type();
        this.render_summary();
        this.render_signers();
        this.render_toolbar_state();
        this.render_field_list();

        await this.load_pdf_document();
        await this.render_pdf();

        this.mark_clean();
        this.update_snap_button();
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
            this.update_active_signer_color();
            return;
        }

        for (const signer of this.signers) {
            const label = signer.full_name || signer.email || signer.signer || signer.name;

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
        this.update_active_signer_color();
    }

    render_toolbar_state() {
        this.page.main.find("#frappe-sign-save-fields").prop("disabled", this.is_read_only);
        this.page.main.find("#frappe-sign-send-request").prop("disabled", this.is_read_only);
        this.page.main.find(".frappe-sign-palette-item").toggleClass("disabled", this.is_read_only);
        this.update_snap_button();
    }

    update_active_signer_color() {
        const color = this.selected_signer ? this.get_signer_color(this.selected_signer) : "transparent";
        this.page.main.find("#frappe-sign-active-signer-color").css("background", color);
    }

    update_snap_button() {
        this.page.main
            .find("#frappe-sign-toggle-snap")
            .text(`${__("Snap")}: ${this.snap_to_grid ? __("On") : __("Off")}`)
            .toggleClass("btn-primary", this.snap_to_grid)
            .toggleClass("btn-default", !this.snap_to_grid);
    }

    clear_selected_field_type() {
        this.selected_field_type = null;
        this.page.main.find(".frappe-sign-palette-item").removeClass("active");
    }

    suppress_next_pdf_click() {
        this.suppress_pdf_click_until = Date.now() + 350;
    }

    should_suppress_pdf_click() {
        return Date.now() < this.suppress_pdf_click_until;
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

            if (this.should_suppress_pdf_click()) {
                event.stopPropagation();
                event.preventDefault();
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
            drop_overlay: null,
            drop_left: null,
            drop_top: null,
        };

        this.create_drag_ghost(field_type, event.clientX, event.clientY);
        this.toggle_grid_lines(true);
        this.move_palette_drag(event);
        this.highlight_overlay_at_point(event.clientX, event.clientY);

        $(document).off(".frappe_sign_palette_drag");

        $(document).on("mousemove.frappe_sign_palette_drag", (move_event) => {
            this.move_palette_drag(move_event);
            this.highlight_overlay_at_point(move_event.clientX, move_event.clientY);
        });

        $(document).on("mouseup.frappe_sign_palette_drag", (up_event) => {
            this.finish_palette_drag(up_event);
        });

        event.preventDefault();
    }

    create_drag_ghost(field_type, client_x, client_y) {
        this.remove_drag_ghost();

        const size = this.get_default_field_size(field_type);
        const signer_color = this.get_signer_color(this.selected_signer);

        this.ghost = $(`
            <div class="frappe-sign-drag-ghost">
                <div class="frappe-sign-field-box-label">
                    ${frappe.utils.escape_html(field_type)}
                </div>
                <div class="frappe-sign-field-box-signer">
                    ${frappe.utils.escape_html(this.get_signer_label(this.selected_signer))}
                </div>
            </div>
        `);

        $("body").append(this.ghost);

        this.ghost.css({
            left: `${client_x}px`,
            top: `${client_y}px`,
            width: `${size.width}px`,
            height: `${size.height}px`,
            borderColor: signer_color,
            backgroundColor: `${signer_color}22`,
            "--frappe-sign-field-color": signer_color,
        });
    }

    move_palette_drag(event) {
        if (!this.palette_drag || !this.ghost) {
            return;
        }

        const field_type = this.palette_drag.field_type;
        const size = this.get_default_field_size(field_type);
        const overlay = this.get_overlay_at_point(event.clientX, event.clientY);

        if (!overlay) {
            this.palette_drag.drop_overlay = null;
            this.palette_drag.drop_left = null;
            this.palette_drag.drop_top = null;

            this.ghost.css({
                left: `${event.clientX}px`,
                top: `${event.clientY}px`,
            });

            return;
        }

        const rect = overlay[0].getBoundingClientRect();

        let left = event.clientX - rect.left;
        let top = event.clientY - rect.top;

        const snapped = this.snap_position(
            left,
            top,
            rect.width,
            rect.height,
            size.width,
            size.height
        );

        this.palette_drag.drop_overlay = overlay;
        this.palette_drag.drop_left = snapped.left;
        this.palette_drag.drop_top = snapped.top;

        this.ghost.css({
            left: `${rect.left + snapped.left}px`,
            top: `${rect.top + snapped.top}px`,
        });
    }

    finish_palette_drag(event) {
        if (!this.palette_drag) {
            return;
        }

        const field_type = this.palette_drag.field_type;
        const overlay = this.palette_drag.drop_overlay || this.get_overlay_at_point(event.clientX, event.clientY);

        if (overlay) {
            if (
                this.palette_drag.drop_overlay &&
                this.palette_drag.drop_overlay[0] === overlay[0] &&
                this.palette_drag.drop_left !== null &&
                this.palette_drag.drop_top !== null
            ) {
                this.add_field_at_position(
                    overlay,
                    this.palette_drag.drop_left,
                    this.palette_drag.drop_top,
                    field_type
                );
            } else {
                this.add_field_at_point(overlay, event.clientX, event.clientY, field_type, {
                    placement: "top-left",
                });
            }
        }

        this.palette_drag = null;
        this.remove_drag_ghost();
        this.toggle_grid_lines(false);
        this.page.main.find(".frappe-sign-page-overlay").removeClass("drop-target");
        this.clear_selected_field_type();
        this.suppress_next_pdf_click();

        $(document).off(".frappe_sign_palette_drag");
    }

    remove_drag_ghost() {
        if (this.ghost) {
            this.ghost.remove();
            this.ghost = null;
        }
    }

    toggle_grid_lines(show) {
        this.page.main.find(".frappe-sign-page-overlay").toggleClass("show-grid", !!show);
    }

    highlight_overlay_at_point(client_x, client_y) {
        this.page.main.find(".frappe-sign-page-overlay").removeClass("drop-target");

        const overlay = this.get_overlay_at_point(client_x, client_y);

        if (overlay) {
            overlay.addClass("drop-target");
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

    add_field_at_point(overlay, client_x, client_y, field_type, options = {}) {
        const rect = overlay[0].getBoundingClientRect();
        const default_size = this.get_default_field_size(field_type);

        let left;
        let top;

        if (options.placement === "top-left") {
            left = client_x - rect.left;
            top = client_y - rect.top;
        } else {
            left = client_x - rect.left - default_size.width / 2;
            top = client_y - rect.top - default_size.height / 2;
        }

        this.add_field_at_position(overlay, left, top, field_type);
    }

    add_field_at_position(overlay, left, top, field_type) {
        if (this.is_read_only) {
            return;
        }

        if (!this.selected_signer) {
            frappe.msgprint(__("Please select a signer first."));
            return;
        }

        const rect = overlay[0].getBoundingClientRect();
        const default_size = this.get_default_field_size(field_type);

        let safe_left = Math.max(0, Math.min(left, rect.width - default_size.width));
        let safe_top = Math.max(0, Math.min(top, rect.height - default_size.height));

        const snapped = this.snap_position(
            safe_left,
            safe_top,
            rect.width,
            rect.height,
            default_size.width,
            default_size.height
        );

        safe_left = snapped.left;
        safe_top = snapped.top;

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
        this.clear_selected_field_type();
        this.suppress_next_pdf_click();
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
            const signer_color = this.get_signer_color(field.signer);

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
                borderColor: signer_color,
                backgroundColor: `${signer_color}22`,
                "--frappe-sign-field-color": signer_color,
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
                    this.clear_selected_field_type();
                    this.suppress_next_pdf_click();
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
        let moving_index = null;

        box.off("mousedown.frappe_sign_field_drag");

        box.on("mousedown.frappe_sign_field_drag", (event) => {
            if ($(event.target).hasClass("frappe-sign-resize-handle")) {
                return;
            }

            if ($(event.target).hasClass("frappe-sign-field-remove")) {
                return;
            }

            this.clear_selected_field_type();
            this.suppress_next_pdf_click();

            is_dragging = true;
            start_x = event.clientX;
            start_y = event.clientY;
            start_left = parseFloat(box.css("left"));
            start_top = parseFloat(box.css("top"));
            moving_index = cint(box.attr("data-index"));

            this.toggle_grid_lines(true);

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

                const snapped = this.snap_position(
                    new_left,
                    new_top,
                    overlay_width,
                    overlay_height,
                    box_width,
                    box_height
                );

                new_left = snapped.left;
                new_top = snapped.top;

                const aligned = this.get_alignment_snap(
                    overlay,
                    field,
                    moving_index,
                    new_left,
                    new_top,
                    box_width,
                    box_height
                );

                new_left = Math.max(0, Math.min(aligned.left, overlay_width - box_width));
                new_top = Math.max(0, Math.min(aligned.top, overlay_height - box_height));

                box.css({
                    left: `${new_left}px`,
                    top: `${new_top}px`,
                });

                field.x_ratio = this.round_ratio(new_left / overlay_width);
                field.y_ratio = this.round_ratio(new_top / overlay_height);

                this.show_alignment_guides(overlay, aligned.guides);
                this.mark_dirty();
            });

            $(document).on("mouseup.frappe_sign_field_drag", (up_event) => {
                if (is_dragging) {
                    is_dragging = false;
                    moving_index = null;
                    this.render_field_list();
                }

                this.toggle_grid_lines(false);
                this.clear_alignment_guides();
                this.clear_selected_field_type();
                this.suppress_next_pdf_click();

                $(document).off(".frappe_sign_field_drag");

                up_event.stopPropagation();
                up_event.preventDefault();
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
            this.clear_selected_field_type();
            this.suppress_next_pdf_click();

            is_resizing = true;
            start_x = event.clientX;
            start_y = event.clientY;
            start_width = box.outerWidth();
            start_height = box.outerHeight();

            this.toggle_grid_lines(true);

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

                if (this.snap_to_grid) {
                    new_width = this.snap_value(new_width);
                    new_height = this.snap_value(new_height);
                }

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

            $(document).on("mouseup.frappe_sign_field_resize", (up_event) => {
                if (is_resizing) {
                    is_resizing = false;
                    this.render_field_list();
                }

                this.toggle_grid_lines(false);
                this.clear_selected_field_type();
                this.suppress_next_pdf_click();

                $(document).off(".frappe_sign_field_resize");

                up_event.stopPropagation();
                up_event.preventDefault();
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
            const signer_color = this.get_signer_color(field.signer);

            const row = $(`
                <div class="frappe-sign-field-row" data-index="${index}">
                    <span class="frappe-sign-field-row-color"></span>
                    <div class="frappe-sign-field-row-main">
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

            row.find(".frappe-sign-field-row-color").css("background", signer_color);

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
                this.clear_selected_field_type();
                this.suppress_next_pdf_click();
            });

            container.append(row);
        });
    }

    snap_value(value) {
        if (!this.snap_to_grid) {
            return value;
        }

        return Math.round(value / this.grid_size) * this.grid_size;
    }

    snap_position(left, top, overlay_width, overlay_height, box_width, box_height) {
        let snapped_left = this.snap_value(left);
        let snapped_top = this.snap_value(top);

        snapped_left = Math.max(0, Math.min(snapped_left, overlay_width - box_width));
        snapped_top = Math.max(0, Math.min(snapped_top, overlay_height - box_height));

        return {
            left: snapped_left,
            top: snapped_top,
        };
    }

    clear_alignment_guides() {
        this.page.main.find(".frappe-sign-alignment-guide").remove();
    }

    show_alignment_guides(overlay, guide_positions) {
        this.clear_alignment_guides();

        for (const guide of guide_positions) {
            const guide_el = $(`<div class="frappe-sign-alignment-guide"></div>`);

            if (guide.type === "vertical") {
                guide_el.addClass("vertical").css({
                    left: `${guide.position}px`,
                });
            }

            if (guide.type === "horizontal") {
                guide_el.addClass("horizontal").css({
                    top: `${guide.position}px`,
                });
            }

            overlay.append(guide_el);
        }
    }

    get_alignment_snap(overlay, moving_field, moving_index, left, top, box_width, box_height) {
        const guides = [];
        let snapped_left = left;
        let snapped_top = top;

        const overlay_width = overlay.width();
        const overlay_height = overlay.height();

        const moving = {
            left,
            right: left + box_width,
            center_x: left + box_width / 2,
            top,
            bottom: top + box_height,
            center_y: top + box_height / 2,
        };

        this.fields.forEach((field, index) => {
            if (index === moving_index) {
                return;
            }

            if (field.page !== moving_field.page) {
                return;
            }

            const other_left = field.x_ratio * overlay_width;
            const other_top = field.y_ratio * overlay_height;
            const other_width = field.width_ratio * overlay_width;
            const other_height = field.height_ratio * overlay_height;

            const other = {
                left: other_left,
                right: other_left + other_width,
                center_x: other_left + other_width / 2,
                top: other_top,
                bottom: other_top + other_height,
                center_y: other_top + other_height / 2,
            };

            const x_pairs = [
                { moving: moving.left, other: other.left, adjust: 0 },
                { moving: moving.right, other: other.right, adjust: box_width },
                { moving: moving.center_x, other: other.center_x, adjust: box_width / 2 },
                { moving: moving.left, other: other.right, adjust: 0 },
                { moving: moving.right, other: other.left, adjust: box_width },
            ];

            for (const pair of x_pairs) {
                if (Math.abs(pair.moving - pair.other) <= this.alignment_threshold) {
                    snapped_left = pair.other - pair.adjust;
                    guides.push({
                        type: "vertical",
                        position: pair.other,
                    });
                    break;
                }
            }

            const y_pairs = [
                { moving: moving.top, other: other.top, adjust: 0 },
                { moving: moving.bottom, other: other.bottom, adjust: box_height },
                { moving: moving.center_y, other: other.center_y, adjust: box_height / 2 },
                { moving: moving.top, other: other.bottom, adjust: 0 },
                { moving: moving.bottom, other: other.top, adjust: box_height },
            ];

            for (const pair of y_pairs) {
                if (Math.abs(pair.moving - pair.other) <= this.alignment_threshold) {
                    snapped_top = pair.other - pair.adjust;
                    guides.push({
                        type: "horizontal",
                        position: pair.other,
                    });
                    break;
                }
            }
        });

        return {
            left: snapped_left,
            top: snapped_top,
            guides,
        };
    }

    get_signer_index(signer_name) {
        const index = this.signers.findIndex((row) => row.name === signer_name);
        return index < 0 ? 0 : index;
    }

    get_signer_color(signer_name) {
        const index = this.get_signer_index(signer_name);
        return this.signer_colors[index % this.signer_colors.length];
    }

    get_signer_label(signer_name) {
        const signer = this.signers.find((row) => row.name === signer_name);

        if (!signer) {
            return "";
        }

        return signer.full_name || signer.email || signer.signer || signer.name;
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

    async save_fields(options = {}) {
        if (this.is_read_only) {
            frappe.msgprint(__("This request is read-only because it has already been sent."));
            return;
        }

        const reload = options.reload !== false;

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

        if (reload) {
            await this.load_request();
        }
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

        const message = this.is_dirty
            ? __("There are unsaved field changes. Save the fields and send this signing request now?")
            : __("Send this signing request now?");

        frappe.confirm(message, async () => {
            if (this.is_dirty) {
                await this.save_fields({ reload: false });
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
}