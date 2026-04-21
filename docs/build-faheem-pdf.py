#!/usr/bin/env python3
"""
Build the Faheem Ops Inbox user guide PDF.

Reads docs/faheem-ops-inbox-guide.md and produces
docs/faheem-ops-inbox-guide.pdf using reportlab.

Usage:
    python3 docs/build-faheem-pdf.py

Kept as a script (rather than a one-shot) so the PDF can be rebuilt any time
the markdown is updated.
"""

import re
import sys
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, HRFlowable,
)

ROOT = Path(__file__).resolve().parent.parent
MD_PATH = ROOT / 'docs' / 'faheem-ops-inbox-guide.md'
PDF_PATH = ROOT / 'docs' / 'faheem-ops-inbox-guide.pdf'

# ─── Colours (match the Ops dashboards dark-ish HE palette, but tuned for print) ───
BURGUNDY = HexColor('#3D1610')
GOLD = HexColor('#C9A96E')
TEXT = HexColor('#1a2234')
MUTED = HexColor('#6b7a99')
CARD_BG = HexColor('#f5f2ec')
ACCENT = HexColor('#f97316')
SUCCESS = HexColor('#0d5c3a')
DANGER = HexColor('#c13030')
BORDER = HexColor('#d6cebe')

# ─── Styles ───
styles = getSampleStyleSheet()

style_title = ParagraphStyle(
    'Title', parent=styles['Title'],
    fontName='Helvetica-Bold', fontSize=28, leading=34,
    textColor=BURGUNDY, alignment=TA_LEFT, spaceAfter=6,
)
style_subtitle = ParagraphStyle(
    'Subtitle', parent=styles['Normal'],
    fontName='Helvetica', fontSize=12, leading=16,
    textColor=MUTED, alignment=TA_LEFT, spaceAfter=4,
)
style_meta = ParagraphStyle(
    'Meta', parent=styles['Normal'],
    fontName='Helvetica-Oblique', fontSize=10, leading=14,
    textColor=MUTED, alignment=TA_LEFT, spaceAfter=0,
)
style_h1 = ParagraphStyle(
    'H1', parent=styles['Heading1'],
    fontName='Helvetica-Bold', fontSize=18, leading=22,
    textColor=BURGUNDY, spaceBefore=18, spaceAfter=8,
)
style_h2 = ParagraphStyle(
    'H2', parent=styles['Heading2'],
    fontName='Helvetica-Bold', fontSize=13, leading=17,
    textColor=TEXT, spaceBefore=12, spaceAfter=4,
)
style_body = ParagraphStyle(
    'Body', parent=styles['Normal'],
    fontName='Helvetica', fontSize=10.5, leading=15,
    textColor=TEXT, spaceAfter=6,
)
style_bullet = ParagraphStyle(
    'Bullet', parent=style_body,
    leftIndent=16, bulletIndent=4, spaceAfter=3,
)
style_quote = ParagraphStyle(
    'Quote', parent=styles['Normal'],
    fontName='Helvetica', fontSize=10, leading=14,
    textColor=TEXT, leftIndent=12, rightIndent=12,
    spaceBefore=6, spaceAfter=6,
    borderColor=ACCENT, borderWidth=0, borderPadding=(10, 12, 10, 12),
    backColor=CARD_BG,
)
style_footer = ParagraphStyle(
    'Footer', parent=styles['Normal'],
    fontName='Helvetica', fontSize=8.5, leading=11,
    textColor=MUTED, alignment=TA_CENTER,
)

# ─── Markdown → Flowables (very small subset, tuned for THIS document) ───

def clean_inline(s: str) -> str:
    """Convert markdown inline (*bold*, links, escapes) to reportlab-compatible HTML."""
    s = s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    # **bold** / *bold*
    s = re.sub(r'\*\*([^*]+?)\*\*', r'<b>\1</b>', s)
    s = re.sub(r'(?<![*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![*\w])', r'<i>\1</i>', s)
    # inline code `x` → monospace
    s = re.sub(r'`([^`]+?)`', r'<font name="Courier">\1</font>', s)
    return s


def parse_table(block_lines):
    """Parse a markdown table block into rows. Expects pipe-style."""
    rows = []
    for line in block_lines:
        line = line.strip()
        if not line or set(line.replace('|', '').strip()) <= set('-:'):
            continue
        cells = [c.strip() for c in line.strip('|').split('|')]
        rows.append(cells)
    return rows


def build_table(rows):
    if not rows:
        return None
    # Render all cells as paragraphs for wrapping + inline formatting
    cell_para_style = ParagraphStyle(
        'Cell', parent=style_body, fontSize=10, leading=13, spaceAfter=0
    )
    header_style = ParagraphStyle(
        'HCell', parent=cell_para_style, fontName='Helvetica-Bold', textColor=white
    )
    processed = []
    for i, row in enumerate(rows):
        style = header_style if i == 0 else cell_para_style
        processed.append([Paragraph(clean_inline(c), style) for c in row])
    num_cols = max(len(r) for r in processed)
    # Pad rows
    for r in processed:
        while len(r) < num_cols:
            r.append(Paragraph('', cell_para_style))
    # Column widths — distribute evenly
    available = 17 * cm
    col_w = [available / num_cols] * num_cols
    t = Table(processed, colWidths=col_w, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BURGUNDY),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, HexColor('#fbfaf5')]),
    ]))
    return t


def md_to_flowables(md_text):
    lines = md_text.split('\n')
    flow = []
    i = 0

    # Consume optional H1 + subtitle block at top
    while i < len(lines) and not lines[i].strip():
        i += 1
    if i < len(lines) and lines[i].startswith('# '):
        flow.append(Paragraph(clean_inline(lines[i][2:].strip()), style_title))
        i += 1
        # subtitle lines (before the first --- or blank)
        subtitle_lines = []
        while i < len(lines) and lines[i].strip() and not lines[i].startswith('---'):
            subtitle_lines.append(lines[i].strip())
            i += 1
        if subtitle_lines:
            joined = '<br/>'.join(clean_inline(l) for l in subtitle_lines)
            flow.append(Paragraph(joined, style_subtitle))
        flow.append(Spacer(1, 6))
        flow.append(HRFlowable(width='100%', thickness=2, color=GOLD, spaceAfter=18))

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Blank line
        if not stripped:
            i += 1
            continue

        # Horizontal rule
        if stripped == '---':
            flow.append(Spacer(1, 4))
            flow.append(HRFlowable(width='100%', thickness=0.5, color=BORDER, spaceBefore=6, spaceAfter=10))
            i += 1
            continue

        # H1 / H2 / H3
        if stripped.startswith('## '):
            flow.append(Paragraph(clean_inline(stripped[3:].strip()), style_h1))
            i += 1
            continue
        if stripped.startswith('### '):
            flow.append(Paragraph(clean_inline(stripped[4:].strip()), style_h2))
            i += 1
            continue
        if stripped.startswith('# '):
            flow.append(Paragraph(clean_inline(stripped[2:].strip()), style_title))
            i += 1
            continue

        # Italic meta line (starts with * and ends with *) -- treat as footer note
        if stripped.startswith('*') and stripped.endswith('*') and '*' not in stripped[1:-1]:
            flow.append(Paragraph(clean_inline(stripped[1:-1]), style_meta))
            i += 1
            continue

        # Blockquote (handoff sample)
        if stripped.startswith('>'):
            quote_lines = []
            while i < len(lines) and lines[i].lstrip().startswith('>'):
                ln = lines[i].lstrip()[1:].lstrip()
                quote_lines.append(clean_inline(ln))
                i += 1
            body = '<br/>'.join(ln if ln else '&nbsp;' for ln in quote_lines)
            flow.append(Paragraph(body, style_quote))
            continue

        # Table
        if '|' in stripped and (i + 1 < len(lines) and re.match(r'^\s*\|?[\s\-:|]+\|?\s*$', lines[i + 1])):
            block = []
            while i < len(lines) and '|' in lines[i] and lines[i].strip():
                block.append(lines[i])
                i += 1
            rows = parse_table(block)
            tbl = build_table(rows)
            if tbl:
                flow.append(Spacer(1, 4))
                flow.append(tbl)
                flow.append(Spacer(1, 6))
            continue

        # Bullet list
        if stripped.startswith('- ') or stripped.startswith('* ') and not stripped.startswith('**'):
            while i < len(lines):
                ls = lines[i].strip()
                if not ls:
                    break
                if not (ls.startswith('- ') or (ls.startswith('* ') and not ls.startswith('**'))):
                    break
                txt = ls[2:].strip()
                flow.append(Paragraph('• ' + clean_inline(txt), style_bullet))
                i += 1
            continue

        # Paragraph (consume until blank / structural element)
        para_lines = []
        while i < len(lines):
            ls = lines[i]
            s = ls.strip()
            if not s:
                break
            if s.startswith('#') or s.startswith('>') or s == '---':
                break
            if s.startswith('- ') or (s.startswith('* ') and not s.startswith('**')):
                break
            if '|' in s and (i + 1 < len(lines) and re.match(r'^\s*\|?[\s\-:|]+\|?\s*$', lines[i + 1])):
                break
            para_lines.append(s)
            i += 1
        if para_lines:
            text = ' '.join(para_lines)
            flow.append(Paragraph(clean_inline(text), style_body))

    return flow


def draw_page_footer(canvas, doc):
    canvas.saveState()
    page_num = canvas.getPageNumber()
    # Footer line + text
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.3)
    canvas.line(2 * cm, 1.5 * cm, A4[0] - 2 * cm, 1.5 * cm)
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(2 * cm, 1 * cm, 'Hamza Express · Ops Inbox Guide for Faheem · April 2026')
    canvas.drawRightString(A4[0] - 2 * cm, 1 * cm, f'Page {page_num}')
    canvas.restoreState()


def main():
    if not MD_PATH.exists():
        print(f'Markdown source not found: {MD_PATH}', file=sys.stderr)
        sys.exit(1)
    md_text = MD_PATH.read_text(encoding='utf-8')
    flowables = md_to_flowables(md_text)

    doc = SimpleDocTemplate(
        str(PDF_PATH), pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
        title='Ops Inbox Guide — Faheem',
        author='HN Hotels',
    )
    doc.build(flowables, onFirstPage=draw_page_footer, onLaterPages=draw_page_footer)
    print(f'Wrote {PDF_PATH}  ({PDF_PATH.stat().st_size / 1024:.1f} KB)')


if __name__ == '__main__':
    main()
