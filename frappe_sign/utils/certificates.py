# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

import json
from io import BytesIO

import frappe
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from frappe_sign.utils.audit import sha256_bytes
from frappe_sign.utils.files import attach_private_file


def generate_audit_certificate(request_name, suffix=None):
    """
    Generate and attach an audit certificate PDF for a completed Frappe Sign Request.

    Returns:
        {
            "file_url": "...",
            "sha256_hash": "...",
        }
    """
    request = frappe.get_doc("Frappe Sign Request", request_name)
    events = get_request_events(request_name)

    pdf_bytes = build_audit_certificate_pdf(request, events)
    pdf_hash = sha256_bytes(pdf_bytes)

    filename_suffix = f"-{frappe.scrub(suffix)}" if suffix else ""

    file_doc = attach_private_file(
        "Frappe Sign Request",
        request.name,
        f"{frappe.scrub(request.name)}-audit-certificate{filename_suffix}.pdf",
        pdf_bytes,
    )

    return {
        "file_url": file_doc.file_url,
        "sha256_hash": pdf_hash,
    }


def get_request_events(request_name):
    return frappe.get_all(
        "Frappe Sign Event",
        filters={
            "frappe_sign_request": request_name,
        },
        fields=[
            "name",
            "event_type",
            "signer_email",
            "user",
            "ip_address",
            "user_agent",
            "details_json",
            "previous_hash",
            "event_hash",
            "document_hash",
            "timestamp",
            "creation",
        ],
        order_by="timestamp asc, creation asc",
    )


def build_audit_certificate_pdf(request, events):
    buffer = BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Audit Certificate - {request.name}",
        author="Frappe Sign",
    )

    styles = build_styles()
    story = []

    story.append(Paragraph("Frappe Sign Audit Certificate", styles["Title"]))
    story.append(Paragraph(f"Signing Request: {escape_text(request.name)}", styles["SmallMuted"]))
    story.append(Spacer(1, 8 * mm))

    story.append(Paragraph("Request Summary", styles["Heading"]))
    story.append(summary_table(request, styles))
    story.append(Spacer(1, 6 * mm))

    story.append(Paragraph("Document Hashes", styles["Heading"]))
    story.append(hash_table(request, styles))
    story.append(Spacer(1, 6 * mm))

    story.append(Paragraph("Signers", styles["Heading"]))
    story.append(signers_table(request, styles))
    story.append(PageBreak())

    story.append(Paragraph("Audit Event Chain", styles["Heading"]))
    story.append(
        Paragraph(
            "Each event records the previous event hash and its own event hash. "
            "This provides a tamper-evident audit chain for the signing request.",
            styles["Body"],
        )
    )
    story.append(Spacer(1, 4 * mm))

    if events:
        for index, event in enumerate(events, start=1):
            story.extend(event_block(index, event, styles))
            story.append(Spacer(1, 4 * mm))
    else:
        story.append(Paragraph("No audit events were found for this request.", styles["Body"]))

    doc.build(
        story,
        onFirstPage=page_footer,
        onLaterPages=page_footer,
    )

    return buffer.getvalue()


def build_styles():
    sample = getSampleStyleSheet()

    styles = {
        "Title": ParagraphStyle(
            "FrappeSignTitle",
            parent=sample["Title"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=22,
            spaceAfter=4 * mm,
            alignment=TA_LEFT,
        ),
        "Heading": ParagraphStyle(
            "FrappeSignHeading",
            parent=sample["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            spaceBefore=2 * mm,
            spaceAfter=3 * mm,
        ),
        "Body": ParagraphStyle(
            "FrappeSignBody",
            parent=sample["BodyText"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
        ),
        "Small": ParagraphStyle(
            "FrappeSignSmall",
            parent=sample["BodyText"],
            fontName="Helvetica",
            fontSize=7,
            leading=8.5,
        ),
        "SmallMuted": ParagraphStyle(
            "FrappeSignSmallMuted",
            parent=sample["BodyText"],
            fontName="Helvetica",
            fontSize=7,
            leading=8.5,
            textColor=colors.HexColor("#6b7280"),
        ),
        "Cell": ParagraphStyle(
            "FrappeSignCell",
            parent=sample["BodyText"],
            fontName="Helvetica",
            fontSize=7,
            leading=8.5,
        ),
        "CellBold": ParagraphStyle(
            "FrappeSignCellBold",
            parent=sample["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7,
            leading=8.5,
        ),
    }

    return styles


def summary_table(request, styles):
    rows = [
        ["Request Title", request.request_title],
        ["Status", request.status],
        ["Created By", request.created_by],
        ["Created On", request.creation],
        ["Completed On", request.completed_on],
        ["Source Type", request.source_type],
        ["Source DocType", request.source_doctype],
        ["Source Name", request.source_name],
        ["Source Title", request.source_title],
        ["Signing Mode", request.signing_mode],
        ["Current Signing Order", request.current_signing_order],
        ["Tamper Status", request.tamper_status],
    ]

    return key_value_table(rows, styles)


def hash_table(request, styles):
    rows = [
        ["Source PDF Hash", request.source_pdf_hash],
        ["Signed PDF Hash", request.signed_pdf_hash],
        ["Audit Chain Hash", request.audit_chain_hash],
        ["Certificate Signed PDF Hash", request.certificate_signed_pdf_hash],
    ]

    return key_value_table(rows, styles)


def signers_table(request, styles):
    header = [
        Paragraph("Signer", styles["CellBold"]),
        Paragraph("Email", styles["CellBold"]),
        Paragraph("Status", styles["CellBold"]),
        Paragraph("Order", styles["CellBold"]),
        Paragraph("Viewed On", styles["CellBold"]),
        Paragraph("Signed On", styles["CellBold"]),
        Paragraph("Declined On", styles["CellBold"]),
    ]

    rows = [header]

    for signer in request.signers:
        if signer.role != "Signer":
            continue

        rows.append(
            [
                Paragraph(escape_text(signer.full_name), styles["Cell"]),
                Paragraph(escape_text(signer.email), styles["Cell"]),
                Paragraph(escape_text(signer.status), styles["Cell"]),
                Paragraph(escape_text(signer.signing_order), styles["Cell"]),
                Paragraph(escape_text(signer.viewed_on), styles["Cell"]),
                Paragraph(escape_text(signer.signed_on), styles["Cell"]),
                Paragraph(escape_text(signer.declined_on), styles["Cell"]),
            ]
        )

    table = Table(
        rows,
        colWidths=[
            32 * mm,
            38 * mm,
            22 * mm,
            14 * mm,
            26 * mm,
            26 * mm,
            26 * mm,
        ],
        repeatRows=1,
    )

    table.setStyle(base_table_style())

    return table


def key_value_table(rows, styles):
    table_rows = []

    for label, value in rows:
        table_rows.append(
            [
                Paragraph(escape_text(label), styles["CellBold"]),
                Paragraph(escape_text(value), styles["Cell"]),
            ]
        )

    table = Table(
        table_rows,
        colWidths=[
            45 * mm,
            135 * mm,
        ],
    )

    table.setStyle(base_table_style())

    return table


def event_block(index, event, styles):
    details = parse_json(event.get("details_json"))

    rows = [
        ["#", index],
        ["Event", event.get("event_type")],
        ["Timestamp", event.get("timestamp")],
        ["Signer Email", event.get("signer_email")],
        ["User", event.get("user")],
        ["IP Address", event.get("ip_address")],
        ["User Agent", event.get("user_agent")],
        ["Document Hash", event.get("document_hash")],
        ["Previous Event Hash", event.get("previous_hash")],
        ["Event Hash", event.get("event_hash")],
    ]

    story = []
    story.append(Paragraph(f"Event {index}: {escape_text(event.get('event_type'))}", styles["Heading"]))
    story.append(key_value_table(rows, styles))

    if details:
        story.append(Spacer(1, 2 * mm))
        story.append(Paragraph("Details JSON", styles["CellBold"]))
        story.append(Paragraph(escape_text(json.dumps(details, indent=2, default=str)), styles["Small"]))

    return story


def base_table_style():
    return TableStyle(
        [
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d1d8dd")),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]
    )


def parse_json(value):
    if not value:
        return None

    try:
        return json.loads(value)
    except Exception:
        return {
            "raw": value,
        }


def escape_text(value):
    if value is None:
        return ""

    value = str(value)

    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br/>")
    )


def page_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#6b7280"))
    canvas.drawString(16 * mm, 10 * mm, "Generated by Frappe Sign")
    canvas.drawRightString(194 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()