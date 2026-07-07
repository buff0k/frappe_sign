// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt


frappe.ready(() => {
    const root = document.getElementById("frappe-sign-root");

    if (!root) {
        return;
    }

    const token = root.dataset.token;

    document
        .getElementById("frappe-sign-complete")
        ?.addEventListener("click", async () => {
            await completeSigning(token);
        });

    document
        .getElementById("frappe-sign-decline")
        ?.addEventListener("click", async () => {
            await declineSigning(token);
        });

    loadSigningView(token);
});


async function loadSigningView(token) {
    const container = document.getElementById("frappe-sign-pdf-container");

    try {
        const response = await frappe.call({
            method: "frappe_sign.api.signing.get_signing_context",
            args: { token },
        });

        container.innerHTML = "";

        const message = document.createElement("pre");
        message.textContent = JSON.stringify(response.message, null, 2);
        container.appendChild(message);
    } catch (error) {
        container.innerHTML = "<p>Unable to load signing request.</p>";
        // eslint-disable-next-line no-console
        console.error(error);
    }
}


async function completeSigning(token) {
    try {
        await frappe.call({
            method: "frappe_sign.api.signing.complete_signing",
            args: { token },
        });

        frappe.msgprint("Signing completed.");
        window.location.reload();
    } catch (error) {
        frappe.msgprint("Unable to complete signing.");
        // eslint-disable-next-line no-console
        console.error(error);
    }
}


async function declineSigning(token) {
    const reason = prompt("Please provide a reason for declining:");

    if (!reason) {
        return;
    }

    try {
        await frappe.call({
            method: "frappe_sign.api.signing.decline_signing",
            args: {
                token,
                reason,
            },
        });

        frappe.msgprint("Signing declined.");
        window.location.reload();
    } catch (error) {
        frappe.msgprint("Unable to decline signing.");
        // eslint-disable-next-line no-console
        console.error(error);
    }
}