// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt


frappe.ready(() => {
    const profile_page = new FrappeSignPortalProfile();
    profile_page.init();
});

class FrappeSignPortalProfile {
    constructor() {
        this.signature_type = null;
        this.current_draw_kind = null;
        this.canvas = null;
        this.ctx = null;
        this.drawing = false;
        this.last_point = null;
    }

    init() {
        this.bind_events();
        this.refresh_signature_type_state();
        this.initialise_canvas_once();
    }

    bind_events() {
        $("#frappe-sign-signature-type").on("change", () => {
            this.refresh_signature_type_state();
        });

        $("#frappe-sign-save-profile").on("click", async () => {
            await this.save_settings();
        });

        $("#frappe-sign-draw-signature").on("click", () => {
            this.open_draw_modal({
                kind: "signature",
                title: __("Draw Signature"),
                help: __("Draw your signature below."),
            });
        });

        $("#frappe-sign-draw-initials").on("click", () => {
            this.open_draw_modal({
                kind: "initials",
                title: __("Draw Initials"),
                help: __("Draw your initials below."),
            });
        });

        $("#frappe-sign-draw-modal-close").on("click", () => {
            this.close_draw_modal();
        });

        $("#frappe-sign-draw-clear").on("click", () => {
            this.clear_canvas();
        });

        $("#frappe-sign-draw-save").on("click", async () => {
            await this.save_drawn_image();
        });

        $("#frappe-sign-upload-signature").on("click", () => {
            $("#frappe-sign-signature-file").val("").trigger("click");
        });

        $("#frappe-sign-upload-initials").on("click", () => {
            $("#frappe-sign-initials-file").val("").trigger("click");
        });

        $("#frappe-sign-signature-file").on("change", async (event) => {
            await this.handle_upload_file(event, "signature");
        });

        $("#frappe-sign-initials-file").on("change", async (event) => {
            await this.handle_upload_file(event, "initials");
        });

        $("#frappe-sign-remove-signature").on("click", async () => {
            await this.remove_image("signature");
        });

        $("#frappe-sign-remove-initials").on("click", async () => {
            await this.remove_image("initials");
        });
    }

    refresh_signature_type_state() {
        this.signature_type = $("#frappe-sign-signature-type").val();

        if (this.signature_type === "Typed") {
            $("#frappe-sign-signature-text-wrapper").show();
        } else {
            $("#frappe-sign-signature-text-wrapper").hide();
        }
    }

    async save_settings() {
        await frappe.call({
            method: "frappe_sign.www.frappe_sign_profile.save_profile_settings",
            args: {
                signature_type: $("#frappe-sign-signature-type").val(),
                signature_text: $("#frappe-sign-signature-text").val(),
                consent: $("#frappe-sign-consent").is(":checked") ? 1 : 0,
            },
            freeze: true,
            freeze_message: __("Saving Frappe Sign settings..."),
        });

        frappe.show_alert({
            message: __("Frappe Sign settings saved."),
            indicator: "green",
        });

        window.location.reload();
    }

    open_draw_modal(options) {
        this.current_draw_kind = options.kind;

        $("#frappe-sign-draw-modal-title").text(options.title);
        $("#frappe-sign-draw-modal-help").text(options.help);
        $("#frappe-sign-draw-modal").prop("hidden", false);

        this.clear_canvas();
    }

    close_draw_modal() {
        $("#frappe-sign-draw-modal").prop("hidden", true);
        this.current_draw_kind = null;
        this.clear_canvas();
    }

    initialise_canvas_once() {
        this.canvas = document.getElementById("frappe-sign-draw-canvas");

        if (!this.canvas) {
            return;
        }

        this.ctx = this.canvas.getContext("2d");

        const ratio = window.devicePixelRatio || 1;
        const css_width = 720;
        const css_height = 260;

        this.canvas.style.width = `${css_width}px`;
        this.canvas.style.height = `${css_height}px`;

        this.canvas.width = css_width * ratio;
        this.canvas.height = css_height * ratio;

        this.ctx.scale(ratio, ratio);
        this.ctx.lineWidth = 2.5;
        this.ctx.lineCap = "round";
        this.ctx.lineJoin = "round";
        this.ctx.strokeStyle = "#111827";

        this.canvas.dataset.hasDrawing = "0";

        this.canvas.addEventListener("mousedown", (event) => this.start_drawing(event));
        this.canvas.addEventListener("mousemove", (event) => this.move_drawing(event));
        this.canvas.addEventListener("mouseup", (event) => this.end_drawing(event));
        this.canvas.addEventListener("mouseleave", (event) => this.end_drawing(event));

        this.canvas.addEventListener("touchstart", (event) => this.start_drawing(event), { passive: false });
        this.canvas.addEventListener("touchmove", (event) => this.move_drawing(event), { passive: false });
        this.canvas.addEventListener("touchend", (event) => this.end_drawing(event), { passive: false });
        this.canvas.addEventListener("touchcancel", (event) => this.end_drawing(event), { passive: false });
    }

    get_point(event) {
        const rect = this.canvas.getBoundingClientRect();

        const source = event.touches && event.touches.length
            ? event.touches[0]
            : event;

        return {
            x: source.clientX - rect.left,
            y: source.clientY - rect.top,
        };
    }

    start_drawing(event) {
        this.drawing = true;
        this.last_point = this.get_point(event);
        event.preventDefault();
    }

    move_drawing(event) {
        if (!this.drawing) {
            return;
        }

        const point = this.get_point(event);

        this.ctx.beginPath();
        this.ctx.moveTo(this.last_point.x, this.last_point.y);
        this.ctx.lineTo(point.x, point.y);
        this.ctx.stroke();

        this.last_point = point;
        this.canvas.dataset.hasDrawing = "1";

        event.preventDefault();
    }

    end_drawing(event) {
        this.drawing = false;
        this.last_point = null;

        if (event) {
            event.preventDefault();
        }
    }

    clear_canvas() {
        if (!this.canvas || !this.ctx) {
            return;
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.canvas.dataset.hasDrawing = "0";
    }

    async save_drawn_image() {
        if (!this.current_draw_kind) {
            return;
        }

        if (!this.canvas || this.canvas.dataset.hasDrawing !== "1") {
            frappe.msgprint(__("Please draw before saving."));
            return;
        }

        const data_url = this.canvas.toDataURL("image/png");

        await frappe.call({
            method: "frappe_sign.www.frappe_sign_profile.save_drawn_profile_image",
            args: {
                kind: this.current_draw_kind,
                data_url: data_url,
            },
            freeze: true,
            freeze_message: __("Saving drawn image..."),
        });

        frappe.show_alert({
            message: __("Drawn image saved."),
            indicator: "green",
        });

        window.location.reload();
    }

    async handle_upload_file(event, kind) {
        const file = event.target.files && event.target.files[0];

        if (!file) {
            return;
        }

        if (file.type !== "image/png") {
            frappe.msgprint(__("Only PNG files are supported."));
            return;
        }

        const data_url = await this.read_file_as_data_url(file);

        await frappe.call({
            method: "frappe_sign.www.frappe_sign_profile.save_uploaded_profile_image",
            args: {
                kind: kind,
                data_url: data_url,
            },
            freeze: true,
            freeze_message: __("Uploading image..."),
        });

        frappe.show_alert({
            message: __("Image uploaded."),
            indicator: "green",
        });

        window.location.reload();
    }

    read_file_as_data_url(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);

            reader.readAsDataURL(file);
        });
    }

    async remove_image(kind) {
        const confirmed = window.confirm(
            kind === "signature"
                ? __("Remove saved signature image?")
                : __("Remove saved initials image?")
        );

        if (!confirmed) {
            return;
        }

        await frappe.call({
            method: "frappe_sign.www.frappe_sign_profile.remove_profile_image",
            args: {
                kind: kind,
            },
            freeze: true,
            freeze_message: __("Removing image..."),
        });

        frappe.show_alert({
            message: __("Image removed."),
            indicator: "green",
        });

        window.location.reload();
    }
}