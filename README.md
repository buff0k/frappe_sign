# Frappe Sign

Frappe Sign is a native Frappe / ERPNext e-signature application for preparing, sending, signing, validating, and auditing PDF signing requests.

It is designed to work inside the Frappe ecosystem while keeping a clear audit trail of every signing event, generated file, file hash, audit certificate, and final verification package.

## Features

- Create signing requests from uploaded PDFs.
- Create signing requests from configured Frappe DocTypes and Print Formats.
- Prepare signing fields visually using the Frappe Sign Designer.
- Support multiple signers.
- Support parallel signing.
- Support sequential signing.
- Support sequential signing cohorts, for example `1, 1, 2, 3`.
- Generate stable per-signer signing links.
- Maintain a reusable signer profile with signature and initials.
- Support drawn, uploaded, and typed signatures.
- Require signer consent before signing, if enabled.
- Stamp signatures, initials, names, email addresses, dates, text, and checkboxes onto PDFs.
- Generate final signed PDFs.
- Generate audit certificates.
- Optionally append the audit certificate to the final PDF.
- Optionally apply certificate-based PDF signing using a configured `.p12` / `.pfx` certificate.
- Generate self-signed internal signing certificates.
- Inspect uploaded signing certificates and extract metadata.
- Maintain file hashes for generated files.
- Maintain a linked event audit chain.
- Validate uploaded signed PDFs.
- Validate uploaded final verification PDFs.
- Validate uploaded audit certificates.
- Monitor tamper status on signing requests and certificate evidence records.
- Notify request creators if tampering is detected.
- Provide portal pages for signature profile management and documents awaiting signature.
- Provide a Desk validator page for independent document validation.
- Provide reusable signing templates.

## License

This project is licensed under the MIT License.

## Dependencies and attribution

Frappe Sign depends on the following open-source projects.

### Frappe Framework

Project: [https://github.com/frappe/frappe](https://github.com/frappe/frappe)

Frappe Sign is a Frappe app and depends on the Frappe Framework for DocTypes, permissions, Desk UI, website routes, file handling, scheduler events, email delivery, and the bench development/runtime environment.

### Bench

Project: [https://github.com/frappe/bench](https://github.com/frappe/bench)

Bench is used to install, build, migrate, and manage Frappe apps.

### pypdf

Project: [https://github.com/py-pdf/pypdf](https://github.com/py-pdf/pypdf)

Used for PDF manipulation, including merging the signed PDF with the generated audit certificate.

### ReportLab

Project: [https://www.reportlab.com/opensource/](https://www.reportlab.com/opensource/)

Used to generate audit certificate PDFs.

### Pillow

Project: [https://python-pillow.org/](https://python-pillow.org/)

Used for typed signature image generation and image handling.

### cryptography

Project: [https://github.com/pyca/cryptography](https://github.com/pyca/cryptography)

Used for certificate generation, certificate inspection, PKCS#12 handling, fingerprints, and cryptographic certificate metadata extraction.

### pyHanko

Project: [https://github.com/MatthiasValvekens/pyHanko](https://github.com/MatthiasValvekens/pyHanko)

Used for certificate-based PDF signing.

### PDF.js

Project: [https://github.com/mozilla/pdf.js](https://github.com/mozilla/pdf.js)

Used by the browser-based Frappe Sign Designer and signing portal to render PDFs.

## Installation

From your Frappe bench:

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app https://github.com/buff0k/frappe_sign --branch version-16
bench --site $SITE_NAME install-app frappe_sign
bench --site $SITE_NAME migrate
bench build --app frappe_sign
bench restart
```

Example:

```bash
cd ~/frappe-bench
bench get-app https://github.com/buff0k/frappe_sign --branch version-16
bench --site example.localhost install-app frappe_sign
bench --site example.localhost migrate
bench build --app frappe_sign
bench restart
```

## Updating

```bash
cd $PATH_TO_YOUR_BENCH/apps/frappe_sign
git pull

cd $PATH_TO_YOUR_BENCH
bench --site $SITE_NAME migrate
bench build --app frappe_sign
bench --site $SITE_NAME clear-cache
bench restart
```

## Required assets

Frappe Sign uses PDF.js in the Designer and signing portal.

Confirm that the following files exist after build:

```text
/assets/frappe_sign/js/pdfjs/pdf.min.js
/assets/frappe_sign/js/pdfjs/pdf.worker.min.js
```

If PDF rendering fails, rebuild the app:

```bash
bench build --app frappe_sign
bench --site $SITE_NAME clear-cache
bench restart
```

## Roles

Frappe Sign uses the following roles:

```text
Frappe Sign User
Frappe Sign Sender
Frappe Sign Manager
```

Suggested use:

| Role | Purpose |
| --- | --- |
| Frappe Sign User | Can maintain a signing profile and sign assigned documents. |
| Frappe Sign Sender | Can create and send signing requests, subject to configured source DocType restrictions. |
| Frappe Sign Manager | Can manage Frappe Sign settings, templates, requests, certificates, and audit records. |
| System Manager | Full administrative access. |

## Initial setup

After installation, open:

```text
Frappe Sign Settings
```

Configure the following sections.

## Frappe Sign Settings

### General signing configuration

Enable Frappe Sign:

```text
Enabled = checked
```

Configure whether signing should be internal only or allow external signers:

```text
Internal Signers Only
Allow External Signers
Require Login For Internal Signers
```

Configure default request timing:

```text
Default Expiry Days
Default Reminder Days
```

### Security settings

Available security settings:

```text
Require Signature Consent
Append Audit Certificate
Enable Tamper Detection
Enable Certificate Based PDF Signing
```

#### Require Signature Consent

When enabled, signers must give consent before completing a signing request.

#### Append Audit Certificate

When enabled, the generated audit certificate is appended to the final signed PDF to create a final verification package.

#### Enable Tamper Detection

When enabled, Frappe Sign can periodically check whether stored generated files still match their recorded hashes.

Tamper detection applies to:

```text
Frappe Sign Request
Frappe Sign Certificate
```

Tamper status values:

```text
Not Checked
Passed
Failed
```

#### Enable Certificate Based PDF Signing

When enabled, Frappe Sign applies a cryptographic PDF signature to the final PDF package using the configured signing certificate.

This requires a `.p12` or `.pfx` certificate file with its private key.

## PDF signing certificates

Certificate-based PDF signing uses a dedicated document-signing certificate.

This is not the same as the SSL/TLS certificate used by your website domain.

### Self-signed certificates

Frappe Sign can generate a self-signed certificate for internal use.

This is suitable for:

```text
internal document integrity checks
internal audit trails
private trust environments
development and testing
```

External PDF viewers may show a self-signed certificate as unknown or untrusted unless the recipient manually trusts the certificate.

### CA-issued document-signing certificates

For externally trusted PDF signatures, use a CA-issued document-signing certificate.

Upload the `.p12` or `.pfx` file in Frappe Sign Settings and enter the certificate password.

Frappe Sign can inspect the certificate and extract:

```text
Certificate Subject
Certificate Issuer
Certificate Serial Number
Certificate Fingerprint (SHA256)
Certificate Valid From
Certificate Valid To
Certificate is Self Signed
Certificate Status
```

### Let’s Encrypt certificates

Let’s Encrypt certificates are intended for HTTPS/TLS server authentication.

They should not be used as PDF document-signing certificates.

### Certificate actions

In Frappe Sign Settings, use the Certificate action menu:

```text
Generate Self-Signed Signing Certificate
Inspect Certificate
Clear Certificate
```

#### Generate Self-Signed Signing Certificate

Creates a private `.p12` certificate file, attaches it privately to Frappe Sign Settings, stores the generated password, and extracts certificate metadata.

#### Inspect Certificate

Reads the configured certificate file and updates the read-only metadata fields.

#### Clear Certificate

Clears the configured certificate from Frappe Sign Settings. Historical signed documents are not deleted.

## Configured source DocTypes

In Frappe Sign Settings, use the Configured DocTypes child table to define which Frappe DocTypes may be used as signing sources.

Each configured source may define:

```text
Source DocType
Enabled
Default Print Format
Required Sender Role
Require Template
Default Template
Attach Signed PDF To Source
Allow Submit Source On Completion
```

This controls whether the Frappe Sign button is available from a source document.

## Frappe Sign Profile

Each signer should have a Frappe Sign Profile.

A profile stores reusable signer identity and signature assets:

```text
User
Full Name
Email
Signature Type
Signature Image
Initials Image
Signature Text
Signature Hash
Initials Hash
Consent
Consent On
Active
Revoked On
```

Profiles can be managed from Desk or from the portal route:

```text
/frappe-sign-profile
```

A signer can create or update their signature and initials using:

```text
Draw
Upload
Type
```

## Frappe Sign Request

A Frappe Sign Request is the main workflow document.

It stores:

```text
source document information
source PDF
signers
field placement
request status
signed PDF
audit certificate
final verification PDF
hashes
tamper status
audit chain hash
```

Main statuses:

```text
Draft
Prepared
Sent
Viewed
Partially Signed
Completed
Declined
Expired
Cancelled
Failed
```

## Creating a signing request from an uploaded PDF

1. Open Frappe Sign Request.
2. Create a new request.
3. Set Source Type to:

```text
Uploaded PDF
```

4. Upload the source PDF.
5. Add signers.
6. Save.
7. Open the Designer.
8. Place fields.
9. Save fields.
10. Send the request.

## Creating a signing request from a Frappe document

1. Configure the source DocType in Frappe Sign Settings.
2. Open a record of the configured DocType.
3. Use the Frappe Sign action button.
4. Confirm the print format.
5. Create the request.
6. Add signers.
7. Open the Designer.
8. Place fields.
9. Save fields.
10. Send the request.

## Signers

Signing requests use the child table:

```text
Frappe Sign Signer
```

Each signer row links to a Frappe Sign Profile.

Signer data is snapshotted into the request:

```text
Full Name
Email
Role
Signing Order
Status
Signing Link
```

Signer roles include:

```text
Signer
Viewer
Approver
```

Only rows with role `Signer` receive signing fields.

## Parallel signing

If Signing Mode is:

```text
Parallel
```

all signers may sign at the same time.

All signer rows are treated as order `1`.

## Sequential signing

If Signing Mode is:

```text
Sequential
```

signers sign according to their Signing Order.

Example:

```text
1
2
3
```

Signer 2 cannot sign until Signer 1 has completed.

## Sequential signing cohorts

Frappe Sign supports signing cohorts.

Example:

```text
1
1
2
3
```

Both signers at order `1` may sign in parallel.

Only after all order `1` signers complete will order `2` be allowed to sign.

## Frappe Sign Designer

The Frappe Sign Designer is used to place fields on a PDF.

Supported fields:

```text
Signature
Initials
Name
Email
Date
Text
Checkbox
```

Designer features include:

```text
PDF page rendering
page thumbnails
drag-and-drop field placement
click-to-place field placement
resizing
snap-to-grid
alignment guides
signer colours
field list
request mode
template mode
```

## Request Designer mode

When opened from a Frappe Sign Request, the Designer works against real signer child rows.

It saves fields to:

```text
Frappe Sign Request.fields
```

The Send Request button is available in request mode.

## Template Designer mode

When opened from a Frappe Sign Template, the Designer works against template signer labels.

It saves fields to:

```text
Frappe Sign Template.fields
```

Template mode asks for a sample source document so that the PDF can be rendered for field placement.

The sample document is not stored on the template.

The Send Request button is hidden in template mode.

## Frappe Sign Template

Templates allow reusable field layouts.

A template defines:

```text
Template Name
Source DocType
Print Format
Signer Labels
Template Fields
Enabled
```

Template signer labels are placeholders such as:

```text
Employee
Manager
Witness
HR Representative
```

When a request is later created from a template, those placeholder labels can be mapped to actual Frappe Sign Profiles.

## Sending a request

When a request is sent:

1. Frappe Sign validates that the request has a source PDF.
2. Frappe Sign validates that the request has signers.
3. Frappe Sign validates that required signing fields are assigned.
4. Stable signing links are generated for the eligible signers.
5. Emails are sent to the currently eligible signers.
6. The request status becomes `Sent`.

For sequential signing, only the current signing order receives the request initially.

## Signing portal

Signers use the token route:

```text
/sign/<token>
```

The signing portal allows signers to:

```text
view the PDF
give consent if required
create/update signature and initials
complete signing fields
sign the request
decline the request
```

The signer token is unique to that signer and should not be shared.

## Completing a request

When all required signers have signed:

1. The request status becomes `Completed`.
2. The final signed PDF is stored.
3. The signed PDF hash is stored.
4. An audit certificate is generated.
5. The audit certificate hash is stored.
6. If enabled, the audit certificate is appended to the signed PDF.
7. If enabled, certificate-based PDF signing is applied.
8. Frappe Sign Certificate evidence records are created.
9. Completion notifications are sent.
10. The request is submitted.

## Audit certificate

The audit certificate is a generated PDF containing evidence about the signing request.

It may include:

```text
request summary
source document details
signer summary
event chain details
document hashes
audit metadata
```

The audit certificate is stored on the request and referenced by certificate evidence records.

## Final verification PDF

If `Append Audit Certificate` is enabled, Frappe Sign creates a final verification PDF.

This is the signed PDF plus the appended audit certificate.

If certificate-based PDF signing is also enabled, the final verification PDF is cryptographically signed after the audit certificate is appended.

## Certificate-based PDF signing

If enabled, Frappe Sign applies a real cryptographic PDF signature to the final PDF package using pyHanko.

The configured signing certificate must be:

```text
.p12 or .pfx
readable with the configured password
not expired
valid according to Frappe Sign certificate inspection
```

If certificate-based PDF signing is enabled but the certificate is missing, unreadable, invalid, or expired, completion should fail rather than silently producing an unsigned PDF.

## Frappe Sign Certificate

Frappe Sign Certificate is an immutable evidence record.

It does not own files.

It stores URL and hash snapshots for files owned by Frappe Sign Request.

Certificate types:

```text
Audit Certificate
Final Verification Package
```

A certificate evidence record may store:

```text
Frappe Sign Request
Certificate Type
Source PDF URL
Source PDF Hash
Signed PDF URL
Signed PDF Hash
Final Verification PDF URL
Final Verification PDF Hash
Audit Certificate URL
Audit Certificate Hash
Event Chain Hash
Tamper Status
Digitally Signed
Signing Certificate Fingerprint
Signing Certificate Subject
Signing Certificate Issuer
Signing Certificate Valid From
Signing Certificate Valid To
Generated On
Generated By
Summary JSON
```

## Frappe Sign Event

Frappe Sign Event records the audit timeline for a signing request.

Events may include:

```text
Created
Prepared
Sent
Viewed
Signed
Declined
Completed
Cancelled
Expired
PDF Generated
PDF Stamped
Certificate Generated
Tamper Check Passed
Tamper Check Failed
Permission Denied
Certificate Applied
```

Events are chained using hashes.

This allows validation logic to detect whether the event chain has been broken.

## Frappe Sign File Hash

Frappe Sign File Hash records generated file hashes.

Hash purposes include:

```text
Generated
Pre-Sign
Post-Sign
Certificate
Verification
```

This provides a separate hash ledger for generated signing files.

## Tamper detection

Tamper detection checks whether stored files still match the hashes recorded by Frappe Sign.

It can check:

```text
Source PDF
Signed PDF
Audit Certificate
Final Verification PDF
```

Tamper detection runs against:

```text
Frappe Sign Request
Frappe Sign Certificate
```

Tamper status values:

```text
Not Checked
Passed
Failed
```

When a tamper status changes, Frappe Sign records an activity comment.

If tampering is detected and the status changes to `Failed`, the creator of the signing request receives an email notification.

## Scheduled tamper checks

If tamper detection is enabled, the scheduler can run tamper checks automatically.

Configure scheduler events in `hooks.py`:

```python
scheduler_events = {
    "daily": [
        "frappe_sign.utils.notifications.send_daily_signing_reminders",
        "frappe_sign.utils.tamper.run_scheduled_tamper_checks",
    ],
}
```

## Manual tamper checks

Frappe Sign Request and Frappe Sign Certificate provide manual tamper check actions.

These checks ignore submitted state and update tamper status programmatically.

## Completion notifications

When a request is completed, Frappe Sign emails the creator and signers.

If a final verification PDF exists, that PDF is preferred as the attachment.

Otherwise, the email includes the signed PDF and audit certificate separately.

## Reminder notifications

Frappe Sign can send daily reminder notifications.

The interval is controlled by:

```text
Default Reminder Days
```

The reminder scheduler sends notifications only to currently eligible signers.

For sequential signing, this means only the current signing order or cohort receives reminders.

## Validation

Frappe Sign includes a Desk validator page.

The validator can check:

```text
signed PDF
final verification PDF
audit certificate
audit chain
stored hashes
certificate evidence record
```

The validator does not need to save uploaded files.

It calculates the uploaded file hash in memory and compares it against Frappe Sign records.

The validator can match against:

```text
Frappe Sign Request.signed_pdf_hash
Frappe Sign Request.certificate_signed_pdf_hash
Frappe Sign File Hash.sha256_hash
Frappe Sign Certificate.signed_pdf_hash
Frappe Sign Certificate.final_pdf_hash
```

## Portal pages

Frappe Sign provides portal routes:

```text
/frappe-sign-profile
/frappe-sign-documents
/sign/<token>
```

### Signature profile portal

Route:

```text
/frappe-sign-profile
```

Allows a user to maintain their signature profile.

### Documents to sign portal

Route:

```text
/frappe-sign-documents
```

Shows documents currently awaiting the user’s signature.

### Token signing portal

Route:

```text
/sign/<token>
```

Allows a signer to complete a signing request using their unique signing link.

## File ownership model

Frappe Sign uses the following ownership model:

```text
Frappe Sign Request
    owns generated files and file URLs

Frappe Sign File Hash
    owns hash ledger entries

Frappe Sign Event
    owns audit timeline entries

Frappe Sign Certificate
    owns immutable evidence summaries and URL/hash snapshots

Frappe Sign Settings
    owns signing certificate configuration
```

## Development notes

Common development commands:

```bash
bench --site $SITE_NAME migrate
bench build --app frappe_sign
bench --site $SITE_NAME clear-cache
bench restart
```

If Python dependencies are changed:

```bash
bench setup requirements
bench restart
```

## Troubleshooting

### PDF does not render in Designer

Confirm PDF.js assets are present:

```text
/assets/frappe_sign/js/pdfjs/pdf.min.js
/assets/frappe_sign/js/pdfjs/pdf.worker.min.js
```

Then run:

```bash
bench build --app frappe_sign
bench --site $SITE_NAME clear-cache
bench restart
```

### Certificate-based PDF signing fails

Check:

```text
Certificate File is configured.
Certificate Password is correct.
Certificate Status is Valid or Expiring Soon.
Certificate has not expired.
pyHanko is installed.
```

Then run:

```bash
bench setup requirements
bench restart
```

### Tamper Status remains Not Checked

Tamper checks are not automatically run during normal completion.

Run the manual tamper check action or enable the scheduled tamper check event.

### External PDF viewer says the signature is untrusted

If you generated a self-signed certificate, this is expected.

Use a CA-issued document-signing certificate for externally trusted PDF signatures.

## Security notes

- Signing links are unique to each signer.
- Signing links should not be shared.
- Certificate passwords are stored in Frappe’s password field.
- Do not use your domain SSL/TLS certificate for PDF document signing.
- Do not use Let’s Encrypt certificates for PDF document signing.
- Self-signed certificates are useful for internal integrity and audit evidence, but they are not equivalent to publicly trusted document-signing certificates.
- Public trust depends on the certificate authority, certificate chain, PDF viewer trust policy, and long-term validation support.

## Repository

Project repository:

[https://github.com/buff0k/frappe_sign](https://github.com/buff0k/frappe_sign)
