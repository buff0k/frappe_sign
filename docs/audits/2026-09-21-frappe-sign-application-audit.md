# Frappe Sign Application Audit

Date: 21 September 2026  
Scope: installed `frappe_sign` application and configuration relevant to end-user training

## Executive summary

Frappe Sign implements a substantial ordinary electronic-signature workflow: uploaded PDFs and Frappe-document sources, parallel and sequential signing, browser field placement, stable per-signer links, consent, reusable profiles, signed PDFs, audit certificates, cryptographic hashes, event chains, validation, tamper checks, reminders, templates, and optional certificate-based PDF signing.

The permission model is stronger than a simple role check. Managers see all signing records; senders create requests and manage requests they own; authenticated signers see linked requests; external signers act through a hashed token. Sent and concluded files are protected against replacement or deletion through request validation and File hooks.

The main concern is server-side enforcement around manually edited requests. Per-DocType settings are applied by the supported `create_from_source` path, but Request validation does not consistently re-check external-signer, attachment, submission, configured-source, sender-role, or template policy when a request is edited directly. Training treats these as governed controls, but code hardening is recommended.

## Workflow and evidence coverage

| Area | Observed behaviour |
|---|---|
| Uploaded PDF | Source hash is calculated; replacing the PDF after fields exist is blocked. |
| Frappe Document | An enabled source record is rendered through a matching Print Format and snapshotted privately. |
| Signing order | Parallel, sequential, and equal-order cohorts such as `1,1,2,3` are supported. |
| Designer | Signature, Initials, Name, Email, Date, Text, and Checkbox fields use page-relative coordinates. |
| Delivery | Send creates stable signer links; resend reuses existing links. |
| Internal signing | Linked authenticated users can use Documents To Sign and their signature profile. |
| External signing | Guest-capable methods require a valid hashed token and limit access to the assigned signer context. |
| Completion | The signed PDF and audit evidence are generated; configured source actions are attempted afterward. |
| Evidence | File hashes, linked events, certificates, and final verification records are maintained. |
| Tamper controls | Scheduled/manual checks compare current evidence with recorded hashes; locked files are protected. |
| Templates | Reusable source, signer, and field definitions standardise common workflows. |

## Permission summary

| Actor | Effective access |
|---|---|
| System Manager / Frappe Sign Manager | All signing records, evidence, templates, and settings. |
| Frappe Sign Sender | Create requests and manage owned/created requests; read linked signer requests. |
| Frappe Sign User | Read requests linked to an active profile and sign in an authenticated context. |
| External signer | No Desk requirement; limited to a valid, unexpired, open token and assigned fields. |
| Unrelated authenticated user | No record visibility without a recognised role and relationship. |
| Guest without a valid token | No signing context. |

## Security strengths

1. Signing tokens are random and stored only as hashes derived with the site secret.
2. Token resolution checks signer status, request status, expiry, and sequential order.
3. Signers receive only fields assigned to their signer row.
4. PDF hashes are recorded at important generation stages.
5. The event audit chain links events cryptographically.
6. File hooks and request validation protect sent/concluded PDFs from replacement, deletion, and privacy-path changes.
7. Completion notifications do not expose signer access links.
8. Certificate secrets use a Password field, with metadata checks before certificate signing is enabled.

## Findings

### High — Direct request editing does not re-enforce source automation policy

The supported source action snapshots configuration, but `FrappeSignRequest.validate()` does not compare `attach_signed_pdf_to_source`, `attach_signed_pdf_field`, or `submit_source_on_completion` with the enabled source row on every save. A Sender can therefore select request-level automation outside the source defaults.

Recommendation: validate these values against the enabled source configuration on save and again before send.

### High — External-signer policy is not enforced in request validation

Global and per-source controls exist, but the request/signing validation path does not consistently reject an external profile when policy forbids it.

Recommendation: identify external profiles by the absence of a linked User and enforce global and source-specific policy before save/send.

### Medium — Internal-only and allow-external settings can both be enabled

The settings controller does not normalise or reject contradictory `internal_signers_only` and `allow_external_signers` values.

Recommendation: make the settings mutually consistent and define precedence server-side.

### Medium — Manual creation can bypass configured-source controls

`create_from_source` requires an enabled configured DocType. A manually created Frappe Sign Request checks basic source existence and Print Format compatibility, but can bypass required sender role, required template, and configured-source policy.

Recommendation: reuse the source-config validation in the Request controller and send path.

### Medium — Source completion actions are best-effort

Attachment or submission failures are logged and do not roll back successful signing. A request can be Completed even if the source PDF was not attached or the source record was not submitted.

Recommendation: preserve this evidence-first behaviour, but expose a clear source-action result and alert managers/requestors on failure.

### Low — Role naming has historical ambiguity

Permissions recognise both `Frappe Sign User` and the historical `Frappe Sign Signer`, while fixtures provision User, Sender, and Manager.

Recommendation: use `Frappe Sign User` in current training and migrate or document any retained historical role.

### Informational — Certificate trust and legal effect differ

Self-signed PDF certificates can support integrity evidence while still appearing untrusted in external PDF viewers. Frappe Sign's ordinary electronic-signature evidence should not be described as an accredited Advanced Electronic Signature by default.

## Training controls arising from the audit

- Requestors are taught to use approved source actions and verify both attachment and docstatus after completion.
- Managers are taught to review request-level automation and external-signer usage until server-side enforcement is strengthened.
- Internal and external courses keep authenticated Desk/portal access separate from token-only access.
- Link examples never expose a complete signer token.
- Sequential cohorts use the explicit `1,1,2,3` example.
- All course quizzes require 100% with a maximum of 20 attempts.

## Limitations

The audit reviewed source, DocType metadata, tests, and non-sensitive live configuration. It did not reproduce production documents, signer identities, signing tokens, file hashes, or certificate secrets. The findings describe application behaviour and training risk; they are not legal advice.
