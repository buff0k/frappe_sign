// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

frappe.ui.form.on("Frappe Sign Profile", {
    refresh(frm) {
        frm.trigger("set_headline");
        frm.trigger("toggle_user_controlled_fields");
        frm.trigger("toggle_signature_fields");
        frm.trigger("add_signature_actions");
    },

    onload(frm) {
        frm.trigger("toggle_user_controlled_fields");
        frm.trigger("toggle_signature_fields");
    },

    user(frm) {
        frm.trigger("pull_user_details");
        frm.trigger("toggle_user_controlled_fields");
    },

    async pull_user_details(frm) {
        if (!frm.doc.user) {
            return;
        }

        const response = await frappe.db.get_value(
            "User",
            frm.doc.user,
            ["full_name", "email"]
        );

        if (!response.message) {
            return;
        }

        await frm.set_value("full_name", response.message.full_name);
        await frm.set_value("email", response.message.email);
    },

    toggle_user_controlled_fields(frm) {
        const has_user = !!frm.doc.user;

        frm.set_df_property("full_name", "read_only", has_user ? 1 : 0);
        frm.set_df_property("email", "read_only", has_user ? 1 : 0);

        frm.toggle_reqd("full_name", true);
        frm.toggle_reqd("email", true);
    },

    set_headline(frm) {
        if (!frm.doc.__islocal && frm.doc.user === frappe.session.user) {
            frm.dashboard.set_headline(__("This is your Frappe Sign signature profile."));
        }

        if (frm.doc.active && !frm.doc.consent) {
            frm.dashboard.set_headline_alert(
                __("Signature consent has not been given."),
                "orange"
            );
        }
    },

    consent(frm) {
        if (frm.doc.consent) {
            frm.set_value("consent_on", frappe.datetime.now_datetime());
        } else {
            frm.set_value("consent_on", null);
        }
    },

    signature_type(frm) {
        frm.trigger("toggle_signature_fields");
    },

    toggle_signature_fields(frm) {
        const typed = frm.doc.signature_type === "Typed";

        frm.toggle_display("signature_text", typed);
        frm.toggle_reqd("signature_text", false);

        frm.toggle_display("signature_image", !typed);
        frm.toggle_reqd("signature_image", false);

        frm.toggle_display("initials_image", !typed);
        frm.toggle_reqd("initials_image", false);
    },

    add_signature_actions(frm) {
        if (frm.doc.__islocal) {
            return;
        }

        frm.add_custom_button(__("Draw Signature"), () => {
            frm.trigger("draw_signature");
        }, __("Frappe Sign"));

        frm.add_custom_button(__("Draw Initials"), () => {
            frm.trigger("draw_initials");
        }, __("Frappe Sign"));
    },

    draw_signature(frm) {
        open_signature_pad(frm, {
            kind: "signature",
            title: __("Draw Signature"),
            canvas_label: __("Draw your signature below."),
        });
    },

    draw_initials(frm) {
        open_signature_pad(frm, {
            kind: "initials",
            title: __("Draw Initials"),
            canvas_label: __("Draw your initials below."),
        });
    },
});


function open_signature_pad(frm, options) {
    const dialog = new frappe.ui.Dialog({
        title: options.title,
        size: "large",
        fields: [
            {
                fieldname: "signature_pad_html",
                fieldtype: "HTML",
            },
        ],
        primary_action_label: __("Save"),
        primary_action: async () => {
            const data_url = get_signature_canvas_data_url(dialog);

            if (!data_url) {
                frappe.msgprint(__("Please draw before saving."));
                return;
            }

            await frappe.call({
                method: "frappe_sign.frappe_sign.doctype.frappe_sign_profile.frappe_sign_profile.save_drawn_signature",
                args: {
                    profile_name: frm.doc.name,
                    kind: options.kind,
                    data_url: data_url,
                },
                freeze: true,
                freeze_message: __("Saving drawn image..."),
            });

            dialog.hide();

            frappe.show_alert({
                message: __("Drawn image saved."),
                indicator: "green",
            });

            await frm.reload_doc();
        },
    });

    dialog.fields_dict.signature_pad_html.$wrapper.html(`
        <div class="frappe-sign-draw-pad">
            <p class="frappe-sign-draw-pad-help">${options.canvas_label}</p>

            <div class="frappe-sign-draw-pad-toolbar">
                <button type="button" class="btn btn-default btn-sm" data-action="clear">
                    ${__("Clear")}
                </button>
            </div>

            <canvas class="frappe-sign-draw-canvas"></canvas>

            <p class="frappe-sign-draw-pad-note">
                ${__("The saved image will be stored as a transparent PNG.")}
            </p>
        </div>
    `);

    dialog.show();

    setTimeout(() => {
        initialise_signature_canvas(dialog);
    }, 150);
}


function initialise_signature_canvas(dialog) {
    const wrapper = dialog.$wrapper.find(".frappe-sign-draw-pad");
    const canvas = wrapper.find(".frappe-sign-draw-canvas")[0];

    if (!canvas) {
        return;
    }

    const ctx = canvas.getContext("2d");
    const ratio = window.devicePixelRatio || 1;

    const css_width = 720;
    const css_height = 260;

    canvas.style.width = `${css_width}px`;
    canvas.style.height = `${css_height}px`;

    canvas.width = css_width * ratio;
    canvas.height = css_height * ratio;

    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";

    canvas.dataset.hasDrawing = "0";

    let drawing = false;
    let last_point = null;

    function get_point(event) {
        const rect = canvas.getBoundingClientRect();

        const source = event.touches && event.touches.length
            ? event.touches[0]
            : event;

        return {
            x: source.clientX - rect.left,
            y: source.clientY - rect.top,
        };
    }

    function start(event) {
        drawing = true;
        last_point = get_point(event);
        event.preventDefault();
    }

    function move(event) {
        if (!drawing) {
            return;
        }

        const point = get_point(event);

        ctx.beginPath();
        ctx.moveTo(last_point.x, last_point.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();

        last_point = point;
        canvas.dataset.hasDrawing = "1";

        event.preventDefault();
    }

    function end(event) {
        drawing = false;
        last_point = null;

        if (event) {
            event.preventDefault();
        }
    }

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("mouseleave", end);

    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end, { passive: false });
    canvas.addEventListener("touchcancel", end, { passive: false });

    wrapper.find('[data-action="clear"]').on("click", () => {
        ctx.clearRect(0, 0, css_width, css_height);
        canvas.dataset.hasDrawing = "0";
    });
}


function get_signature_canvas_data_url(dialog) {
    const canvas = dialog.$wrapper.find(".frappe-sign-draw-canvas")[0];

    if (!canvas) {
        return null;
    }

    if (canvas.dataset.hasDrawing !== "1") {
        return null;
    }

    return canvas.toDataURL("image/png");
}