// Copyright (c) 2026, BuFf0k and contributors
// For license information, please see license.txt

frappe.pages["frappe-sign-validato"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Frappe Sign Validator"),
        single_column: true,
    });

    wrapper.frappe_sign_validator = new FrappeSignValidator(page, wrapper);
};

class FrappeSignValidator {
    constructor(page, wrapper) {
        this.page = page;
        this.wrapper = wrapper;
        this.make();
    }

    make() {
        this.page.main.html(`
            <div class="frappe-sign frappe-sign-validator">
                <div class="frappe-sign-validator-card frappe-sign-validator-upload">
                    <div>
                        <h3>${__("Validate Signed PDF")}</h3>
                        <p class="text-muted">
                            ${__("Upload either the final signed PDF or the certificate-signed PDF to validate it against Frappe Sign records.")}
                        </p>
                    </div>

                    <div class="frappe-sign-validator-grid">
                        <div class="form-group">
                            <label>${__("Signed Document PDF")}</label>
                            <input type="file" id="frappe-sign-validator-pdf" class="form-control" accept="application/pdf,.pdf">
                        </div>

                        <div class="form-group">
                            <label>${__("Audit Certificate PDF")} <span class="text-muted">(${__("optional")})</span></label>
                            <input type="file" id="frappe-sign-validator-certificate" class="form-control" accept="application/pdf,.pdf">
                        </div>
                    </div>

                    <button class="btn btn-primary" id="frappe-sign-run-validation">
                        ${__("Validate")}
                    </button>
                </div>

                <div id="frappe-sign-validation-result"></div>
            </div>
        `);

        this.bind_events();
    }

    bind_events() {
        this.page.main.find("#frappe-sign-run-validation").on("click", async () => {
            await this.validate();
        });
    }

    async validate() {
        const pdf_file = this.page.main.find("#frappe-sign-validator-pdf")[0].files[0];
        const certificate_file = this.page.main.find("#frappe-sign-validator-certificate")[0].files[0];

        if (!pdf_file) {
            frappe.msgprint(__("Please select a signed PDF to validate."));
            return;
        }

        if (!this.is_pdf(pdf_file)) {
            frappe.msgprint(__("The signed document must be a PDF."));
            return;
        }

        if (certificate_file && !this.is_pdf(certificate_file)) {
            frappe.msgprint(__("The audit certificate must be a PDF."));
            return;
        }

        try {
            this.page.main.find("#frappe-sign-validation-result").html(`
                <div class="frappe-sign-validator-card">
                    <p class="text-muted">${__("Validating document...")}</p>
                </div>
            `);

            const pdf_data_url = await this.read_file_as_data_url(pdf_file);
            let certificate_data_url = null;

            if (certificate_file) {
                certificate_data_url = await this.read_file_as_data_url(certificate_file);
            }

            const response = await frappe.call({
                method: "frappe_sign.api.validation.validate_signed_pdf",
                args: {
                    pdf_data_url: pdf_data_url,
                    certificate_data_url: certificate_data_url,
                },
                freeze: true,
                freeze_message: __("Validating signed PDF..."),
            });

            this.render_result(response.message);
        } catch (error) {
            console.error(error);
            frappe.msgprint(__("Validation failed. Please check the file and try again."));
        }
    }

    is_pdf(file) {
        if (!file) {
            return false;
        }

        if (file.type === "application/pdf") {
            return true;
        }

        return file.name.toLowerCase().endsWith(".pdf");
    }

    read_file_as_data_url(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);

            reader.readAsDataURL(file);
        });
    }

    render_result(result) {
        const container = this.page.main.find("#frappe-sign-validation-result");

        if (!result) {
            container.html(`
                <div class="frappe-sign-validator-card frappe-sign-validation-failed">
                    <h3>${__("Validation Failed")}</h3>
                    <p>${__("No validation result was returned.")}</p>
                </div>
            `);
            return;
        }

        const status_class = result.valid
            ? "frappe-sign-validation-passed"
            : "frappe-sign-validation-failed";

        const title = result.valid
            ? __("Validation Passed")
            : __("Validation Failed");

        const title_class = result.valid
            ? "text-success"
            : "text-danger";

        container.html(`
            <div class="frappe-sign-validator-card ${status_class}">
                <div class="frappe-sign-validation-header">
                    <div>
                        <h3 class="${title_class}">${title}</h3>
                        <p>${frappe.utils.escape_html(this.get_result_message(result))}</p>
                    </div>
                    <div class="frappe-sign-validation-hash">
                        <span>${__("Uploaded PDF Hash")}</span>
                        <code>${frappe.utils.escape_html(result.uploaded_pdf_hash || "")}</code>
                    </div>
                </div>

                ${this.render_request_summary(result)}
                ${this.render_signers(result.signers || [])}
                ${this.render_checks(result)}
            </div>
        `);
    }

    get_result_message(result) {
        if (result.valid) {
            return __("The uploaded PDF matches a completed Frappe Sign document.");
        }

        return (
            result.audit_chain_check?.message ||
            result.stored_pdf_check?.message ||
            result.certificate_check?.message ||
            result.message ||
            __("The uploaded document could not be fully validated.")
        );
    }

    render_request_summary(result) {
		const request = result.request;

		if (!request) {
			return `
				<div class="frappe-sign-validator-section">
					<h4>${__("Matched Signing Request")}</h4>
					<p class="text-muted">${__("No matching Frappe Sign Request was found.")}</p>
				</div>
			`;
		}

		const request_link = `/app/frappe-sign-request/${encodeURIComponent(request.name)}`;

		return `
			<div class="frappe-sign-validator-section">
				<h4>${__("Matched Signing Request")}</h4>

				<div class="frappe-sign-validator-summary">
					${this.summary_item(__("Request"), `<a href="${request_link}">${frappe.utils.escape_html(request.name || "")}</a>`, true)}
					${this.summary_item(__("Uploaded Document Type"), this.get_uploaded_document_type_label(result.uploaded_document_type))}
					${this.summary_item(__("Title"), request.request_title)}
					${this.summary_item(__("Status"), request.status)}
					${this.summary_item(__("Created By"), request.created_by)}
					${this.summary_item(__("Created On"), request.creation)}
					${this.summary_item(__("Completed On"), request.completed_on)}
					${this.summary_item(__("Source"), this.get_source_label(request))}
					${this.summary_item(__("Signed PDF Hash"), request.signed_pdf_hash, false, true)}
					${this.summary_item(__("Certificate Signed PDF Hash"), request.certificate_signed_pdf_hash, false, true)}
					${this.summary_item(__("Audit Chain Hash"), request.audit_chain_hash, false, true)}
					${this.summary_item(__("Audit Certificate"), request.audit_certificate)}
				</div>
			</div>
		`;
	}

	get_uploaded_document_type_label(document_type) {
		const labels = {
			signed_pdf: __("Final Signed PDF"),
			certificate_signed_pdf: __("Certificate-Signed PDF"),
		};

		return labels[document_type] || document_type || __("Unknown");
	}

    get_source_label(request) {
        if (!request) {
            return "";
        }

        if (request.source_type === "Frappe Document") {
            return `${request.source_doctype || ""} ${request.source_name || ""}`.trim();
        }

        return request.source_type || "";
    }

    summary_item(label, value, raw = false, code = false) {
        let rendered = raw
            ? value || ""
            : frappe.utils.escape_html(value || "");

        if (code && rendered) {
            rendered = `<code>${rendered}</code>`;
        }

        return `
            <div class="frappe-sign-validator-summary-item">
                <span>${frappe.utils.escape_html(label || "")}</span>
                <strong>${rendered || `<span class="text-muted">${__("Not available")}</span>`}</strong>
            </div>
        `;
    }

    render_signers(signers) {
        if (!signers.length) {
            return `
                <div class="frappe-sign-validator-section">
                    <h4>${__("Signers")}</h4>
                    <p class="text-muted">${__("No signers found.")}</p>
                </div>
            `;
        }

        const rows = signers.map((signer) => `
            <tr>
                <td>${frappe.utils.escape_html(signer.full_name || "")}</td>
                <td>${frappe.utils.escape_html(signer.email || "")}</td>
                <td>${this.status_pill(signer.status)}</td>
                <td>${frappe.utils.escape_html(signer.signing_order || "")}</td>
                <td>${frappe.utils.escape_html(signer.viewed_on || "")}</td>
                <td>${frappe.utils.escape_html(signer.signed_on || "")}</td>
            </tr>
        `).join("");

        return `
            <div class="frappe-sign-validator-section">
                <h4>${__("Signers")}</h4>
                <table class="table table-bordered frappe-sign-validator-table">
                    <thead>
                        <tr>
                            <th>${__("Signer")}</th>
                            <th>${__("Email")}</th>
                            <th>${__("Status")}</th>
                            <th>${__("Order")}</th>
                            <th>${__("Viewed On")}</th>
                            <th>${__("Signed On")}</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    render_checks(result) {
        const checks = [
            {
                label: __("Stored Signed PDF"),
                check: result.stored_pdf_check,
            },
            {
                label: __("Audit Chain"),
                check: result.audit_chain_check,
            },
            {
                label: __("Audit Certificate"),
                check: result.certificate_check,
            },
        ];

        const rows = checks.map((item) => {
            const check = item.check || {};
            const passed = !!check.passed;

            return `
                <tr>
                    <td>${item.label}</td>
                    <td>${this.check_pill(passed)}</td>
                    <td>${frappe.utils.escape_html(check.message || "")}</td>
                </tr>
            `;
        }).join("");

        return `
            <div class="frappe-sign-validator-section">
                <h4>${__("Validation Checks")}</h4>
                <table class="table table-bordered frappe-sign-validator-table">
                    <thead>
                        <tr>
                            <th>${__("Check")}</th>
                            <th>${__("Result")}</th>
                            <th>${__("Message")}</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    status_pill(status) {
        const clean_status = frappe.utils.escape_html(status || "");
        const color = status === "Signed" ? "green" : "gray";

        return `<span class="frappe-sign-validator-pill ${color}">${clean_status}</span>`;
    }

    check_pill(passed) {
        return passed
            ? `<span class="frappe-sign-validator-pill green">${__("Passed")}</span>`
            : `<span class="frappe-sign-validator-pill red">${__("Failed")}</span>`;
    }
}