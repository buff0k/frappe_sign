// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

frappe.listview_settings["Frappe Sign Request"] = {
    has_indicator_for_draft: true,

    add_fields: [
        "status",
        "signing_mode",
        "current_signing_order",
        "expires_on",
        "completed_on",
        "declined_on",
        "tamper_status",
        "docstatus",
    ],

    get_indicator(doc) {
        const status = doc.status || "Draft";

        const status_map = {
            "Draft": "gray",
            "Prepared": "blue",
            "Sent": "orange",
            "Viewed": "yellow",
            "Partially Signed": "purple",
            "Completed": "green",
            "Declined": "red",
            "Expired": "red",
            "Cancelled": "gray",
            "Failed": "red",
        };

        return [
            __(status),
            status_map[status] || "gray",
            `status,=,${status}`,
        ];
    },

    formatters: {
        status(value) {
            if (!value) {
                return "";
            }

            return __(value);
        },
    },
};