// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt


frappe.ready(() => {
    $(".frappe-sign-document-card").on("click", function (event) {
        if ($(event.target).closest("a, button").length) {
            return;
        }

        const link = $(this).find("a.btn-primary").attr("href");

        if (link) {
            window.location.href = link;
        }
    });
});