## Using Frappe Sign from other Frappe apps

Frappe Sign can be used as a signing engine by other Frappe apps.

A custom app may own the business record, while Frappe Sign handles:

```text
PDF generation from a Print Format
signer rows
signing field placement
signing links
email notifications
signing workflow
signed PDFs
audit certificates
file hashes
event chains
validation
tamper checks
completion notifications
```

Example use cases include:

```text
KPI reviews
HR acknowledgements
disciplinary forms
site transfer forms
policy acknowledgements
safety forms
procurement approvals
legal practice documents
internal authorisations
```

### Integration concept

The recommended integration model is:

```text
1. The external app owns the business record.
2. The external app defines or selects the Print Format.
3. Frappe Sign renders the source PDF from that document and Print Format.
4. The external app passes signer profiles and signing field coordinates to Frappe Sign.
5. Frappe Sign creates the signing request.
6. Frappe Sign sends signer-specific signing links.
7. Signers complete the request through Frappe Sign.
8. Frappe Sign stores the signed PDF, audit certificate, hashes, event chain, and tamper status.
9. The external app may read the completed Frappe Sign Request or linked files if it needs to update its own workflow.
```

### High-level integration API

Other apps should use:

```python
frappe_sign.api.integration.create_signing_request_from_document
```

This API creates a signing request from a Frappe document, adds signers, adds signing fields, and can optionally send the request immediately.

The source DocType must be configured in `Frappe Sign Settings` before this API can create a signing request from it. This keeps external integrations aligned with the same configuration and permission model used by the Desk button.

### Required permission

The calling user must have permission to create Frappe Sign Requests.

Normally this means the user should have:

```text
Frappe Sign Sender
```

The calling user must also have read permission on the source document.

If another app uses this API from server-side code, the service user or API user should be granted the required Frappe Sign role and source-document permissions.

### API signature

```python
frappe_sign.api.integration.create_signing_request_from_document(
    source_doctype,
    source_name,
    print_format=None,
    request_title=None,
    signing_mode="Parallel",
    signers=None,
    fields=None,
    send=False,
)
```

### Arguments

| Argument | Required | Description |
| --- | --- | --- |
| `source_doctype` | Yes | The DocType of the source business record, for example `KPI Review`. |
| `source_name` | Yes | The document name of the source business record. |
| `print_format` | No | The Print Format used to render the source PDF. If omitted, Frappe Sign uses the configured default where available. |
| `request_title` | No | The title shown on the Frappe Sign Request and in emails. |
| `signing_mode` | No | Either `Parallel` or `Sequential`. Defaults to `Parallel`. |
| `signers` | Yes | A list of signer definitions. Each signer should resolve to an active `Frappe Sign Profile`. |
| `fields` | Yes | A list of signing field definitions. Each field is positioned using page-relative ratios. |
| `send` | No | If true, the request is sent immediately after creation. If false, it remains prepared for review/designer changes. |

### Return value

The API returns a dictionary similar to:

```python
{
    "name": "FSR-00001",
    "status": "Sent",
    "source_pdf": "/private/files/kpi-review-kpi-0001-source.pdf",
    "signer_count": 2,
    "field_count": 4,
    "sent": True,
    "sent_signer_count": 1,
}
```

If `send=False`, the request is created and prepared, but not emailed:

```python
{
    "name": "FSR-00001",
    "status": "Prepared",
    "source_pdf": "/private/files/kpi-review-kpi-0001-source.pdf",
    "signer_count": 2,
    "field_count": 4,
    "sent": False,
}
```

### Signer payload

Each signer object defines one row in the `Frappe Sign Signer` child table.

A signer should normally reference an existing active `Frappe Sign Profile`.

Example using a profile directly:

```python
{
    "key": "employee",
    "profile": "FSP-0001",
    "role": "Signer",
    "signing_order": 1,
}
```

Example using a user:

```python
{
    "key": "employee",
    "user": "employee@example.com",
    "role": "Signer",
    "signing_order": 1,
}
```

Example using an email address:

```python
{
    "key": "employee",
    "email": "employee@example.com",
    "role": "Signer",
    "signing_order": 1,
}
```

Supported signer fields:

| Field | Required | Description |
| --- | --- | --- |
| `key` | Recommended | A local reference used by field payloads. For example `employee`, `manager`, or `witness`. |
| `profile` | Conditional | The `Frappe Sign Profile` name. Use this where possible. |
| `signer` | Conditional | Alias for `profile`. |
| `profile_name` | Conditional | Alias for `profile`. |
| `user` | Conditional | A Frappe User ID. The API will find an active Frappe Sign Profile linked to that user. |
| `email` | Conditional | An email address. The API will find an active Frappe Sign Profile with that email. |
| `role` | No | `Signer`, `Viewer`, or `Approver`. Defaults to `Signer`. |
| `signing_order` | No | Used for sequential signing. Defaults to the signer’s list position for sequential requests and `1` for parallel requests. |

At least one of the following must resolve to an active Frappe Sign Profile:

```text
profile
signer
profile_name
user
email
```

Supported signer roles:

```text
Signer
Viewer
Approver
```

Only rows with role `Signer` should receive signing fields.

### Signer keys

The `key` field is not stored as the final signer identity. It is an integration convenience used to map fields to the request-specific signer child row.

Example:

```python
signers=[
    {
        "key": "employee",
        "profile": employee_profile,
        "role": "Signer",
        "signing_order": 1,
    },
    {
        "key": "manager",
        "profile": manager_profile,
        "role": "Signer",
        "signing_order": 2,
    },
]
```

Then fields can refer to those signers by key:

```python
fields=[
    {
        "signer_key": "employee",
        "field_type": "Signature",
        "page": 1,
        "x_ratio": 0.12,
        "y_ratio": 0.82,
        "width_ratio": 0.28,
        "height_ratio": 0.06,
        "required": 1,
    },
    {
        "signer_key": "manager",
        "field_type": "Signature",
        "page": 1,
        "x_ratio": 0.60,
        "y_ratio": 0.82,
        "width_ratio": 0.28,
        "height_ratio": 0.06,
        "required": 1,
    },
]
```

Internally, Frappe Sign converts `signer_key` into the request-specific `Frappe Sign Signer` child row name. This is important because `Frappe Sign Field.signer` points to the signer row on that specific request, not directly to the reusable `Frappe Sign Profile`.

### Field payload

Each field object defines one row in the `Frappe Sign Field` child table.

Example signature field:

```python
{
    "signer_key": "employee",
    "field_type": "Signature",
    "page": 1,
    "x_ratio": 0.12,
    "y_ratio": 0.82,
    "width_ratio": 0.28,
    "height_ratio": 0.06,
    "required": 1,
}
```

Example initials field:

```python
{
    "signer_key": "employee",
    "field_type": "Initials",
    "page": 1,
    "x_ratio": 0.08,
    "y_ratio": 0.15,
    "width_ratio": 0.10,
    "height_ratio": 0.04,
    "required": 1,
}
```

Example date field:

```python
{
    "signer_key": "employee",
    "field_type": "Date",
    "page": 1,
    "x_ratio": 0.12,
    "y_ratio": 0.89,
    "width_ratio": 0.18,
    "height_ratio": 0.04,
    "required": 1,
}
```

Example text field:

```python
{
    "signer_key": "employee",
    "field_type": "Text",
    "page": 1,
    "x_ratio": 0.12,
    "y_ratio": 0.70,
    "width_ratio": 0.40,
    "height_ratio": 0.05,
    "required": 1,
    "default_value": "",
}
```

Example checkbox field:

```python
{
    "signer_key": "employee",
    "field_type": "Checkbox",
    "page": 1,
    "x_ratio": 0.10,
    "y_ratio": 0.65,
    "width_ratio": 0.03,
    "height_ratio": 0.03,
    "required": 1,
}
```

Supported field payload keys:

| Field | Required | Description |
| --- | --- | --- |
| `signer_key` | Conditional | Matches the `key` value from a signer payload. |
| `signer_ref` | Conditional | Alias for `signer_key`. |
| `profile` | Conditional | Can be used to match the field to a signer by profile name. |
| `signer` | Conditional | Alias for profile or signer reference. |
| `profile_name` | Conditional | Alias for profile. |
| `user` | Conditional | Can match a signer by user. |
| `email` | Conditional | Can match a signer by email. |
| `field_type` | Yes | The type of signing field. |
| `page` | Yes | The PDF page number, starting at `1`. |
| `x_ratio` | Yes | The horizontal offset from the left edge of the page, as a ratio from `0` to `1`. |
| `y_ratio` | Yes | The vertical offset from the top edge of the page, as a ratio from `0` to `1`. |
| `width_ratio` | Yes | The field width as a ratio of the page width. |
| `height_ratio` | Yes | The field height as a ratio of the page height. |
| `required` | No | Whether the signer must complete the field. Defaults to `1`. |
| `read_only` | No | Whether the field should be read-only. Defaults to `0`. |
| `default_value` | No | Default text value for text-like fields. |

At least one signer reference must be supplied for every field:

```text
signer_key
signer_ref
profile
signer
profile_name
user
email
```

Supported field types:

```text
Signature
Initials
Name
Email
Date
Text
Checkbox
```

### Coordinate system

Frappe Sign field placement does not use pixels, millimetres, centimetres, inches, or PDF points in the API payload.

It uses page-relative ratios.

The origin is the top-left corner of the rendered PDF page:

```text
x_ratio = 0.00 means the left edge of the page
y_ratio = 0.00 means the top edge of the page
x_ratio = 1.00 means the right edge of the page
y_ratio = 1.00 means the bottom edge of the page
```

The field position and size are calculated as:

```text
field_left = page_width * x_ratio
field_top = page_height * y_ratio
field_width = page_width * width_ratio
field_height = page_height * height_ratio
```

For example, if a rendered page is 1000 pixels wide and 1400 pixels high:

```text
x_ratio = 0.10
y_ratio = 0.80
width_ratio = 0.30
height_ratio = 0.06
```

then the rendered field box appears at:

```text
left = 1000 * 0.10 = 100 px
top = 1400 * 0.80 = 1120 px
width = 1000 * 0.30 = 300 px
height = 1400 * 0.06 = 84 px
```

The same ratios are then used when stamping the PDF. This keeps the field placement consistent across different screen zoom levels and PDF render scales.

### Estimating coordinates

A rough guide:

```text
Top-left of page:
x_ratio = 0.05
y_ratio = 0.05

Centre of page:
x_ratio = 0.50
y_ratio = 0.50

Bottom-left signature block:
x_ratio = 0.10
y_ratio = 0.80

Bottom-right signature block:
x_ratio = 0.60
y_ratio = 0.80
```

Typical field sizes:

```text
Signature:
width_ratio = 0.25 to 0.35
height_ratio = 0.05 to 0.08

Initials:
width_ratio = 0.08 to 0.14
height_ratio = 0.03 to 0.05

Date:
width_ratio = 0.12 to 0.20
height_ratio = 0.03 to 0.05

Checkbox:
width_ratio = 0.025 to 0.04
height_ratio = 0.025 to 0.04

Text:
width_ratio = 0.20 to 0.50
height_ratio = 0.04 to 0.08
```

### Important coordinate warning

Ratios are stable only if the relevant signing section appears in a predictable place on a predictable page.

If a Print Format can grow or shrink because of variable child-table rows, comments, long text, optional sections, or attachments, the signature section may move to a different page or vertical position.

For variable-length documents, the integrating app should usually do one of the following:

```text
reserve a predictable signing block in the Print Format
use a signing-specific Print Format with a fixed signing section
place the signing section on a forced final page
calculate field placement after rendering
or create the request with send=False and let a user confirm placement in the Designer
```

### Example: full sequential KPI Review request

```python
import frappe

def create_kpi_review_signing_request(doc):
    employee_profile = frappe.db.get_value(
        "Frappe Sign Profile",
        {
            "user": doc.employee_user,
            "active": 1,
        },
        "name",
    )

    manager_profile = frappe.db.get_value(
        "Frappe Sign Profile",
        {
            "user": doc.manager_user,
            "active": 1,
        },
        "name",
    )

    if not employee_profile:
        frappe.throw("The employee does not have an active Frappe Sign Profile.")

    if not manager_profile:
        frappe.throw("The manager does not have an active Frappe Sign Profile.")

    result = frappe.call(
        "frappe_sign.api.integration.create_signing_request_from_document",
        source_doctype=doc.doctype,
        source_name=doc.name,
        print_format="KPI Review Signing Format",
        request_title=f"KPI Review - {doc.employee_name} - {doc.review_period}",
        signing_mode="Sequential",
        signers=[
            {
                "key": "employee",
                "profile": employee_profile,
                "role": "Signer",
                "signing_order": 1,
            },
            {
                "key": "manager",
                "profile": manager_profile,
                "role": "Signer",
                "signing_order": 2,
            },
        ],
        fields=[
            {
                "signer_key": "employee",
                "field_type": "Signature",
                "page": 1,
                "x_ratio": 0.10,
                "y_ratio": 0.80,
                "width_ratio": 0.30,
                "height_ratio": 0.06,
                "required": 1,
            },
            {
                "signer_key": "employee",
                "field_type": "Date",
                "page": 1,
                "x_ratio": 0.10,
                "y_ratio": 0.88,
                "width_ratio": 0.18,
                "height_ratio": 0.04,
                "required": 1,
            },
            {
                "signer_key": "manager",
                "field_type": "Signature",
                "page": 1,
                "x_ratio": 0.60,
                "y_ratio": 0.80,
                "width_ratio": 0.30,
                "height_ratio": 0.06,
                "required": 1,
            },
            {
                "signer_key": "manager",
                "field_type": "Date",
                "page": 1,
                "x_ratio": 0.60,
                "y_ratio": 0.88,
                "width_ratio": 0.18,
                "height_ratio": 0.04,
                "required": 1,
            },
        ],
        send=True,
    )

    doc.db_set("frappe_sign_request", result.get("name"))

    return result
```

### Example: create request but do not send

Use `send=False` where a user should still review field placement in the Designer before sending.

```python
result = frappe.call(
    "frappe_sign.api.integration.create_signing_request_from_document",
    source_doctype="KPI Review",
    source_name=doc.name,
    print_format="KPI Review Signing Format",
    request_title=f"KPI Review - {doc.employee_name}",
    signing_mode="Parallel",
    signers=[
        {
            "key": "employee",
            "profile": employee_profile,
            "role": "Signer",
        }
    ],
    fields=[
        {
            "signer_key": "employee",
            "field_type": "Signature",
            "page": 1,
            "x_ratio": 0.10,
            "y_ratio": 0.80,
            "width_ratio": 0.30,
            "height_ratio": 0.06,
            "required": 1,
        }
    ],
    send=False,
)

frappe.set_route("Form", "Frappe Sign Request", result.get("name"))
```

### Example: add a button in another app

A custom app can add a client-side button that calls its own server-side method.

```javascript
frappe.ui.form.on("KPI Review", {
    refresh(frm) {
        if (!frm.is_new() && frm.doc.docstatus === 0) {
            frm.add_custom_button(__("Create Signing Request"), async () => {
                const response = await frappe.call({
                    method: "kpi_app.api.signing.create_kpi_review_signing_request",
                    args: {
                        name: frm.doc.name,
                    },
                    freeze: true,
                    freeze_message: __("Creating signing request..."),
                });

                if (response.message && response.message.name) {
                    frappe.set_route("Form", "Frappe Sign Request", response.message.name);
                }
            });
        }
    },
});
```

The custom app’s server method can then call Frappe Sign:

```python
import frappe

@frappe.whitelist()
def create_kpi_review_signing_request(name):
    doc = frappe.get_doc("KPI Review", name)

    if not doc.has_permission("read"):
        frappe.throw("You do not have permission to create a signing request for this KPI Review.")

    return create_kpi_review_signing_request(doc)
```

### Security notes for integrations

External apps should not generate or distribute signing links directly.

They should create the request and allow Frappe Sign to generate signer-specific links during sending.

Signing links are bearer tokens and must be treated as confidential.

Each signer should receive only their own signing link.

### Completion handling

When signing is complete, Frappe Sign stores:

```text
signed PDF
signed PDF hash
audit certificate
audit certificate hash
final verification PDF, if enabled
event chain hash
certificate evidence records
tamper status
```

The external app may use the linked Frappe Sign Request to update its own workflow.

For example, a KPI app may update its KPI Review record when the linked Frappe Sign Request reaches `Completed`.

Completion handling can be implemented by:

```text
checking the linked Frappe Sign Request status
using scheduled jobs
adding a custom hook in the external app
or adding a purpose-built callback/status-sync method in the external app
```