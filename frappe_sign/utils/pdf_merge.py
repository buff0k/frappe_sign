# Copyright (c) 2026, BuFf0k and contributors
# For license information, please see license.txt

from io import BytesIO

from pypdf import PdfReader, PdfWriter


def append_pdf_bytes(primary_pdf_bytes, appendix_pdf_bytes):
    writer = PdfWriter()

    primary_reader = PdfReader(BytesIO(primary_pdf_bytes))
    appendix_reader = PdfReader(BytesIO(appendix_pdf_bytes))

    for page in primary_reader.pages:
        writer.add_page(page)

    for page in appendix_reader.pages:
        writer.add_page(page)

    output = BytesIO()
    writer.write(output)

    return output.getvalue()