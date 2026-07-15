// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

frappe.pages["frappe-sign-sign"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Frappe Sign Signing Page"),
        single_column: true,
    });

    wrapper.frappe_sign_sign_page = new FrappeSignDeskSigningPage(page, wrapper);
};

class FrappeSignDeskSigningPage {
    constructor(page, wrapper) {
        this.page = page;
        this.wrapper = wrapper;
        this.context = null;
        this.selected_request = null;
        this.portal = null;

        this.make();
        this.load_assets()
            .then(() => this.load_context())
            .catch((error) => {
                console.error(error);
                this.render_error(__("Could not load the signing page assets."));
            });
    }

    make() {
        this.page.main.html(`
            <div class="frappe-sign frappe-sign-desk-sign">
                <div class="frappe-sign-desk-sign-card">
                    <div class="frappe-sign-desk-sign-header">
                        <div>
                            <h3>${__("Documents To Sign")}</h3>
                            <p class="frappe-sign-muted">
                                ${__("Select an outstanding signing request assigned to your Frappe Sign Profile.")}
                            </p>
                        </div>

                        <button class="btn btn-default" id="frappe-sign-desk-refresh">
                            ${__("Refresh")}
                        </button>
                    </div>

                    <div id="frappe-sign-desk-placeholder"></div>

                    <div id="frappe-sign-desk-selector" hidden>
                        <div class="form-group">
                            <label>${__("Signing Request")}</label>
                            <select class="form-control" id="frappe-sign-desk-request-select"></select>
                        </div>

                        <div id="frappe-sign-desk-request-summary"></div>
                    </div>
                </div>

                <div id="frappe-sign-desk-signing-area"></div>
            </div>
        `);

        this.bind_events();
    }

    bind_events() {
        this.page.main.find("#frappe-sign-desk-refresh").on("click", async () => {
            await this.load_context();
        });

        this.page.main.find("#frappe-sign-desk-request-select").on("change", async () => {
            const signer_row = this.page.main.find("#frappe-sign-desk-request-select").val();

            if (!signer_row) {
                this.selected_request = null;
                this.page.main.find("#frappe-sign-desk-request-summary").empty();
                this.page.main.find("#frappe-sign-desk-signing-area").empty();
                return;
            }

            this.selected_request = this.get_request_by_signer_row(signer_row);
            this.render_selected_request_summary();

            if (this.selected_request && this.selected_request.can_sign_now) {
                await this.open_selected_request();
            } else {
                this.page.main.find("#frappe-sign-desk-signing-area").html(`
                    <div class="frappe-sign-message">
                        <h2>${__("Not Available Yet")}</h2>
                        <p>${frappe.utils.escape_html(this.selected_request?.waiting_message || __("This signing request is not currently available for signing."))}</p>
                    </div>
                `);
            }
        });
    }

    async load_assets() {
        await this.require_script("/assets/frappe_sign/js/pdfjs/pdf.min.js");

        if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/assets/frappe_sign/js/pdfjs/pdf.worker.min.js";
        }

        await this.require_script("/assets/frappe_sign/js/frappe_sign_portal.js");
    }

    require_script(path) {
        return new Promise((resolve, reject) => {
            frappe.require(path, () => {
                resolve();
            });

            setTimeout(() => {
                if (path.includes("pdf.min.js") && !window.pdfjsLib) {
                    reject(new Error(`Failed to load ${path}`));
                } else {
                    resolve();
                }
            }, 10000);
        });
    }

    async load_context() {
        this.page.main.find("#frappe-sign-desk-placeholder").html(`
            <div class="frappe-sign-loading">${__("Loading signing requests...")}</div>
        `);

        this.page.main.find("#frappe-sign-desk-selector").prop("hidden", true);
        this.page.main.find("#frappe-sign-desk-signing-area").empty();

        const response = await frappe.call({
            method: "frappe_sign.api.desk_signing.get_my_signing_page_context",
            freeze: true,
            freeze_message: __("Loading signing requests..."),
        });

        this.context = response.message || {};

        this.render_context();
    }

    render_context() {
        const status = this.context.status;
        const requests = this.context.requests || [];

        if (status === "not_logged_in") {
            this.render_placeholder(
                __("Login Required"),
                this.context.message || __("Please log in before signing documents.")
            );
            return;
        }

        if (status === "no_profile") {
            this.render_placeholder(
                __("No Signing Profile"),
                this.context.message || __("No active Frappe Sign Profile is linked to your user.")
            );
            return;
        }

        if (!requests.length) {
            this.render_placeholder(
                __("Nothing To Sign"),
                __("There are no outstanding signing requests assigned to your Frappe Sign Profile.")
            );
            return;
        }

        this.render_request_selector(requests);
    }

    render_placeholder(title, message) {
        this.selected_request = null;

        this.page.main.find("#frappe-sign-desk-selector").prop("hidden", true);
        this.page.main.find("#frappe-sign-desk-placeholder").html(`
            <div class="frappe-sign-empty-state">
                <h4>${frappe.utils.escape_html(title)}</h4>
                <p class="frappe-sign-muted">${frappe.utils.escape_html(message)}</p>
            </div>
        `);
        this.page.main.find("#frappe-sign-desk-signing-area").empty();
    }

    render_error(message) {
        this.page.main.find("#frappe-sign-desk-selector").prop("hidden", true);
        this.page.main.find("#frappe-sign-desk-placeholder").html(`
            <div class="frappe-sign-message frappe-sign-message-error">
                <h2>${__("Error")}</h2>
                <p>${frappe.utils.escape_html(message)}</p>
            </div>
        `);
        this.page.main.find("#frappe-sign-desk-signing-area").empty();
    }

    render_request_selector(requests) {
        const select = this.page.main.find("#frappe-sign-desk-request-select");

        select.empty();
        select.append(`<option value="">${__("Select a signing request")}</option>`);

        for (const item of requests) {
            const status_label = item.can_sign_now
                ? __("Ready")
                : __("Waiting");

            select.append(`
                <option value="${frappe.utils.escape_html(item.signer_row)}">
                    ${frappe.utils.escape_html(item.title || item.request)}
                    · ${frappe.utils.escape_html(status_label)}
                    · ${frappe.utils.escape_html(item.signing_mode || "")}
                    · ${__("Order")} ${frappe.utils.escape_html(item.signing_order || "")}
                </option>
            `);
        }

        this.page.main.find("#frappe-sign-desk-placeholder").empty();
        this.page.main.find("#frappe-sign-desk-selector").prop("hidden", false);
        this.page.main.find("#frappe-sign-desk-request-summary").empty();
        this.page.main.find("#frappe-sign-desk-signing-area").empty();

        const first_ready = requests.find((item) => item.can_sign_now);
        const first_item = first_ready || requests[0];

        if (first_item) {
            select.val(first_item.signer_row).trigger("change");
        }
    }

    get_request_by_signer_row(signer_row) {
        return (this.context.requests || []).find((item) => item.signer_row === signer_row) || null;
    }

    render_selected_request_summary() {
        const item = this.selected_request;

        if (!item) {
            this.page.main.find("#frappe-sign-desk-request-summary").empty();
            return;
        }

        const status_class = item.can_sign_now ? "green" : "gray";
        const status_text = item.can_sign_now ? __("Ready To Sign") : __("Waiting");

        this.page.main.find("#frappe-sign-desk-request-summary").html(`
            <div class="frappe-sign-desk-request-summary">
                <div>
                    <span class="frappe-sign-validator-pill ${status_class}">
                        ${frappe.utils.escape_html(status_text)}
                    </span>
                </div>

                <div>
                    <strong>${frappe.utils.escape_html(item.title || item.request)}</strong>
                </div>

                <div class="frappe-sign-desk-request-meta">
                    <span>${__("Request")}: ${frappe.utils.escape_html(item.request || "")}</span>
                    <span>${__("Request Status")}: ${frappe.utils.escape_html(item.status || "")}</span>
                    <span>${__("Signer Status")}: ${frappe.utils.escape_html(item.signer_status || "")}</span>
                    <span>${__("Signing Mode")}: ${frappe.utils.escape_html(item.signing_mode || "")}</span>
                    <span>${__("Signing Order")}: ${frappe.utils.escape_html(item.signing_order || "")}</span>
                    <span>${__("Current Order")}: ${frappe.utils.escape_html(item.current_signing_order || "")}</span>
                </div>

                ${
                    item.waiting_message
                        ? `<p class="frappe-sign-muted">${frappe.utils.escape_html(item.waiting_message)}</p>`
                        : ""
                }
            </div>
        `);
    }

    async open_selected_request() {
        const item = this.selected_request;

        if (!item) {
            return;
        }

        this.page.main.find("#frappe-sign-desk-signing-area").html(`
            <div class="frappe-sign-validator-card">
                <p class="frappe-sign-muted">${__("Loading signing document...")}</p>
            </div>
        `);

        const response = await frappe.call({
            method: "frappe_sign.api.desk_signing.get_desk_signing_token",
            args: {
                signer_row_name: item.signer_row,
            },
            freeze: true,
            freeze_message: __("Opening signing request..."),
        });

        const token = response.message?.token;

        if (!token) {
            this.render_error(__("Could not open this signing request."));
            return;
        }

        this.render_signing_area(token, item);
    }

    render_signing_area(token, item) {
        this.remove_existing_portal_modals();

        this.page.main.find("#frappe-sign-desk-signing-area").html(`
            <div class="frappe-sign-header">
                <h1>${frappe.utils.escape_html(item.title || item.request)}</h1>
                <p>${__("Please review the document and complete the required signing fields.")}</p>
            </div>

            <div class="frappe-sign-electronic-signature-notice">
                <h2>${__("Electronic Signature Notice")}</h2>

                <p>
                    ${__("This document is being signed electronically using an ordinary electronic signature.")}
                </p>

                <p>
                    ${__("By signing, you confirm that you have reviewed the document and that your electronic signature, initials, typed name, checkbox selection, or other signing action on this page is intended to be your signature for this document.")}
                </p>

                <p>
                    ${__("If you do not agree to sign electronically, or if you believe that an advanced electronic signature is legally required for this document, you may decline to sign.")}
                </p>
            </div>

            <div
                id="frappe-sign-root"
                class="frappe-sign-root"
                data-token="${frappe.utils.escape_html(token)}"
                data-request="${frappe.utils.escape_html(item.request)}"
                data-electronic-signature-notice-version="ZA-ECTA-ORDINARY-ESIGN-v1"
            >
                <div class="frappe-sign-toolbar">
                    <button class="btn btn-default" id="frappe-sign-go-next">
                        ${__("Go To Next Field")}
                    </button>

                    <button class="btn btn-default" id="frappe-sign-sign-all">
                        ${__("Sign All")}
                    </button>

                    <button class="btn btn-primary" id="frappe-sign-complete">
                        ${__("Complete Signing")}
                    </button>

                    <button class="btn btn-default" id="frappe-sign-decline">
                        ${__("Decline")}
                    </button>
                </div>

                <div id="frappe-sign-pdf-container" class="frappe-sign-pdf-container">
                    <p>${__("Loading document...")}</p>
                </div>
            </div>
        `);

        this.portal = new FrappeSignPortal(document.getElementById("frappe-sign-root"));
    }

    remove_existing_portal_modals() {
        $("#frappe-sign-consent-modal").remove();
        $("#frappe-sign-setup-modal").remove();
    }
}