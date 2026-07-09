// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

frappe.listview_settings["Frappe Sign Certificate"] = {
    has_indicator_for_draft: false,

    add_fields: [
        "frappe_sign_request",
        "certificate_type",
        "tamper_status",
        "generated_on",
        "digitally_signed",
        "audit_certificate_url",
        "final_pdf_url",
    ],

    get_indicator(doc) {
        const tamper_status = doc.tamper_status || "Not Checked";

        const tamper_map = {
            "Passed": "green",
            "Failed": "red",
            "Not Checked": "yellow",
        };

        return [
            __(tamper_status),
            tamper_map[tamper_status] || "gray",
            `tamper_status,=,${tamper_status}`,
        ];
    },

    formatters: {
        tamper_status(value) {
            return render_tamper_status(value);
        },

        audit_certificate_url(value) {
            return render_file_view_button(value, __("View"));
        },

        final_pdf_url(value) {
            return render_file_view_button(value, __("View"));
        },

        digitally_signed(value) {
            if (cint(value)) {
                return `<span class="indicator-pill green">${__("Yes")}</span>`;
            }

            return `<span class="indicator-pill gray">${__("No")}</span>`;
        },
    },
};


function render_tamper_status(value) {
    const status = value || "Not Checked";

    const color_map = {
        "Passed": "green",
        "Failed": "red",
        "Not Checked": "yellow",
    };

    const color = color_map[status] || "gray";

    return `<span class="indicator-pill ${color}">${frappe.utils.escape_html(__(status))}</span>`;
}


function render_file_view_button(value, label) {
    if (!value) {
        return "";
    }

    const escaped_url = frappe.utils.escape_html(value);
    const escaped_label = frappe.utils.escape_html(label || __("View"));

    return `
        <a
            class="btn btn-xs btn-default frappe-sign-list-view-button"
            href="${escaped_url}"
            target="_blank"
            rel="noopener noreferrer"
            onclick="event.stopPropagation();"
        >
            ${escaped_label}
        </a>
    `;
}