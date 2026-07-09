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