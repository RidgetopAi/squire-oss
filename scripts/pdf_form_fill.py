#!/usr/bin/env python3
"""PDF form field detection and filling using PyMuPDF."""
import sys
import json
import fitz  # PyMuPDF
import tempfile
import os
import base64

def list_fields(pdf_bytes: bytes) -> list[dict]:
    """List all form fields in a PDF."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    fields = []
    for page_num, page in enumerate(doc):
        for widget in page.widgets():
            field_info = {
                "name": widget.field_name,
                "type": widget.field_type_string,
                "value": widget.field_value,
                "page": page_num + 1,
                "options": list(widget.choice_values) if widget.choice_values else None,
            }
            fields.append(field_info)
    doc.close()
    return fields

def fill_fields(pdf_bytes: bytes, field_values: dict[str, str]) -> bytes:
    """Fill form fields in a PDF and return the filled PDF bytes."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    filled_count = 0
    for page in doc:
        for widget in page.widgets():
            if widget.field_name in field_values:
                widget.field_value = str(field_values[widget.field_name])
                widget.update()
                filled_count += 1

    # Save to bytes
    output = bytes(doc.tobytes())
    doc.close()
    return output

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: pdf_form_fill.py <command> [args]"}))
        sys.exit(1)

    command = sys.argv[1]

    if command == "list":
        # Read base64 PDF from stdin
        data = json.loads(sys.stdin.read())
        pdf_bytes = base64.b64decode(data["pdf_b64"])
        fields = list_fields(pdf_bytes)
        print(json.dumps({"fields": fields, "count": len(fields)}))

    elif command == "fill":
        # Read base64 PDF and field values from stdin
        data = json.loads(sys.stdin.read())
        pdf_bytes = base64.b64decode(data["pdf_b64"])
        field_values = data["fields"]
        filled_bytes = fill_fields(pdf_bytes, field_values)
        filled_b64 = base64.b64encode(filled_bytes).decode("utf-8")
        print(json.dumps({"filled_pdf_b64": filled_b64, "size": len(filled_bytes)}))

    else:
        print(json.dumps({"error": f"Unknown command: {command}"}))
        sys.exit(1)
