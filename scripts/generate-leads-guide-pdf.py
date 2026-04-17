#!/usr/bin/env python3
"""
Marketing Command Center — Complete User Guide
Generates a master visual guide covering Waves 1, 2.1, 2.2, 2.3, 2.4, 2.5, 2.7.

Run: python3 scripts/generate-leads-guide-pdf.py
Out: Leads-Dashboard-Playbook.pdf
"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether, Image
)
from reportlab.lib import colors

# Brand palette
BURGUNDY   = HexColor('#3D1610')
GOLD       = HexColor('#C9A96E')
CREAM      = HexColor('#FAF3E3')
ORANGE     = HexColor('#f97316')
GREEN      = HexColor('#22c55e')
BLUE       = HexColor('#3b82f6')
PURPLE     = HexColor('#a855f7')
CYAN       = HexColor('#06b6d4')
RED        = HexColor('#ef4444')
PINK       = HexColor('#ec4899')
INK        = HexColor('#1a1a1a')
BODY       = HexColor('#2d2d2d')
MUTE       = HexColor('#64748b')
LIGHT      = HexColor('#f1f5f9')
MED        = HexColor('#e2e8f0')
YELLOW     = HexColor('#fbbf24')
DARK_BG    = HexColor('#0f172a')

OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'Leads-Dashboard-Playbook.pdf'
)

# ── Styles ─────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

def S(name, **kw):
    base = {
        'fontName': 'Helvetica',
        'fontSize': 11,
        'leading': 15,
        'textColor': BODY,
        'alignment': TA_LEFT,
    }
    base.update(kw)
    return ParagraphStyle(name, **base)

title_big = S('title_big', fontSize=34, leading=40, fontName='Helvetica-Bold',
              textColor=BURGUNDY, alignment=TA_CENTER)
subtitle = S('subtitle', fontSize=14, leading=18, textColor=MUTE,
             alignment=TA_CENTER)
h1 = S('h1', fontSize=22, leading=26, fontName='Helvetica-Bold', textColor=BURGUNDY, spaceAfter=6)
h2 = S('h2', fontSize=16, leading=20, fontName='Helvetica-Bold', textColor=INK, spaceAfter=4)
h3 = S('h3', fontSize=12, leading=15, fontName='Helvetica-Bold', textColor=INK, spaceAfter=2)
body = S('body')
body_b = S('body_b', fontName='Helvetica-Bold')
small = S('small', fontSize=9, leading=12, textColor=MUTE)
callout = S('callout', fontSize=11, leading=15, textColor=white)
big_num = S('big_num', fontSize=28, leading=32, fontName='Helvetica-Bold',
            textColor=BURGUNDY, alignment=TA_CENTER)
kpi_label = S('kpi_label', fontSize=9, leading=11, textColor=MUTE, alignment=TA_CENTER)

# ── Helpers ────────────────────────────────────────────────────────────
def hr(color=MED, thickness=0.5, space=6):
    return HRFlowable(width="100%", thickness=thickness, color=color,
                      spaceBefore=space, spaceAfter=space)

def box(content, bg=LIGHT, border=MED, pad=8, radius=0):
    """Wrap a flowable in a colored box."""
    t = Table([[content]], colWidths=[174*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), bg),
        ('BOX', (0,0), (-1,-1), 0.5, border),
        ('LEFTPADDING',   (0,0), (-1,-1), pad),
        ('RIGHTPADDING',  (0,0), (-1,-1), pad),
        ('TOPPADDING',    (0,0), (-1,-1), pad),
        ('BOTTOMPADDING', (0,0), (-1,-1), pad),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    return t

def color_box(text, bg, text_color=white, align=TA_CENTER, pad=8, fs=11, bold=True):
    sty = S('cb', fontSize=fs, leading=fs+3,
            fontName='Helvetica-Bold' if bold else 'Helvetica',
            textColor=text_color, alignment=align)
    p = Paragraph(text, sty)
    t = Table([[p]], colWidths=[174*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), bg),
        ('LEFTPADDING',   (0,0), (-1,-1), pad),
        ('RIGHTPADDING',  (0,0), (-1,-1), pad),
        ('TOPPADDING',    (0,0), (-1,-1), pad),
        ('BOTTOMPADDING', (0,0), (-1,-1), pad),
    ]))
    return t

def step(num, title, body_text, color=BURGUNDY):
    """One numbered step: big number on left, content on right."""
    num_cell = Paragraph(f"<b>{num}</b>", S('n', fontSize=40, leading=44,
                                             fontName='Helvetica-Bold',
                                             textColor=color, alignment=TA_CENTER))
    title_p = Paragraph(title, h2)
    body_p = Paragraph(body_text, body)
    right = Table([[title_p], [body_p]], colWidths=[155*mm])
    right.setStyle(TableStyle([
        ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),
        ('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),2),
    ]))
    t = Table([[num_cell, right]], colWidths=[19*mm, 155*mm])
    t.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),
        ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),6),
    ]))
    return t

def mini_step(num, text, color=BURGUNDY):
    n_p = Paragraph(f'<b>{num}</b>', S('n', fontSize=14, leading=16, fontName='Helvetica-Bold',
                                        textColor=color, alignment=TA_CENTER))
    txt_p = Paragraph(text, body)
    r = Table([[n_p, txt_p]], colWidths=[9*mm, 165*mm])
    r.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),
        ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
    ]))
    return r

def badge(text, bg, fg=white):
    return f'<font color="{fg.hexval()}" backcolor="{bg.hexval()}"><b>&nbsp;{text}&nbsp;</b></font>'

def stage_badge_row():
    """Visual row of all stage badges."""
    stages = [
        ('NEW', BLUE),
        ('ENGAGED', YELLOW),
        ('PAYMENT PENDING', ORANGE),
        ('BOOKING DROPPED', RED),
        ('BOOKED', PURPLE),
        ('ORDERED', GREEN),
        ('LOST', MUTE),
    ]
    cells = []
    for text, c in stages:
        p = Paragraph(f"<b>{text}</b>", S('sb', fontSize=8, leading=10,
                                            textColor=white, alignment=TA_CENTER,
                                            fontName='Helvetica-Bold'))
        t = Table([[p]], colWidths=[23*mm])
        t.setStyle(TableStyle([
            ('BACKGROUND',(0,0),(-1,-1),c),
            ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),
            ('LEFTPADDING',(0,0),(-1,-1),2),('RIGHTPADDING',(0,0),(-1,-1),2),
        ]))
        cells.append(t)
    row = Table([cells], colWidths=[24.5*mm]*7)
    row.setStyle(TableStyle([
        ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),1),
        ('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0),
    ]))
    return row

def source_row():
    sources = [
        ('CTWA PAID', ORANGE, 'Meta ad — they clicked an ad on Facebook/Instagram'),
        ('GOOGLE PAID', BLUE, 'Google Ad — they searched and clicked'),
        ('STATION QR', PURPLE, 'Scanned a counter QR inside the shop'),
        ('ORGANIC', CYAN, 'Came on their own — no ad cost'),
    ]
    data = []
    for name, c, desc in sources:
        badge_p = Paragraph(f"<b>{name}</b>", S('sr', fontSize=9, leading=11,
                                                  textColor=white, alignment=TA_CENTER,
                                                  fontName='Helvetica-Bold'))
        b = Table([[badge_p]], colWidths=[30*mm])
        b.setStyle(TableStyle([
            ('BACKGROUND',(0,0),(-1,-1),c),
            ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),
        ]))
        data.append([b, Paragraph(desc, body)])
    t = Table(data, colWidths=[32*mm, 142*mm])
    t.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('LEFTPADDING',(0,0),(-1,-1),2),('RIGHTPADDING',(0,0),(-1,-1),2),
        ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),
        ('LINEBELOW',(0,0),(-1,-2),0.3, MED),
    ]))
    return t

def kpi_card(big, label, color=BURGUNDY):
    num = Paragraph(big, S('kpi_n', fontSize=22, leading=26,
                            fontName='Helvetica-Bold',
                            textColor=color, alignment=TA_CENTER))
    lab = Paragraph(label, kpi_label)
    t = Table([[num],[lab]], colWidths=[40*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1),LIGHT),
        ('BOX',(0,0),(-1,-1),0.5,MED),
        ('TOPPADDING',(0,0),(0,0),10),('BOTTOMPADDING',(0,0),(0,0),2),
        ('TOPPADDING',(0,1),(0,1),0),('BOTTOMPADDING',(0,1),(0,1),8),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
    ]))
    return t

def section_header(num, title, color=BURGUNDY):
    """Big numbered section title."""
    n_p = Paragraph(f'<font color="{color.hexval()}"><b>{num}</b></font>',
                    S('sh', fontSize=28, leading=32, fontName='Helvetica-Bold',
                      textColor=color, alignment=TA_CENTER))
    t_p = Paragraph(title, h1)
    r = Table([[n_p, t_p]], colWidths=[15*mm, 159*mm])
    r.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),
        ('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0),
    ]))
    return r

def labelled_table(rows, label_w=40, body_w=134, label_bg=LIGHT):
    """Render a 2-col table with bold labels on the left."""
    data = []
    for left, right in rows:
        l_p = Paragraph(f'<b>{left}</b>', body_b) if isinstance(left, str) else left
        r_p = Paragraph(right, body) if isinstance(right, str) else right
        data.append([l_p, r_p])
    t = Table(data, colWidths=[label_w*mm, body_w*mm])
    t.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('BACKGROUND',(0,0),(0,-1), label_bg),
        ('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),
        ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
        ('LINEBELOW',(0,0),(-1,-2),0.3, MED),
    ]))
    return t

# ── Page decorations ──────────────────────────────────────────────────
def footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(MUTE)
    canvas.setFont('Helvetica', 8)
    canvas.drawString(18*mm, 10*mm, 'Marketing Command Center — User Guide')
    canvas.drawRightString(192*mm, 10*mm, f'Page {doc.page}')
    canvas.restoreState()

def cover_bg(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(BURGUNDY)
    canvas.rect(0, 0, 210*mm, 297*mm, fill=1, stroke=0)
    # Gold stripe
    canvas.setFillColor(GOLD)
    canvas.rect(0, 200*mm, 210*mm, 1.2*mm, fill=1, stroke=0)
    canvas.rect(0, 95*mm, 210*mm, 1.2*mm, fill=1, stroke=0)
    canvas.restoreState()

# ── Build ──────────────────────────────────────────────────────────────
def build():
    doc = SimpleDocTemplate(
        OUT, pagesize=A4,
        topMargin=18*mm, bottomMargin=18*mm,
        leftMargin=18*mm, rightMargin=18*mm,
        title='Marketing Command Center — User Guide',
        author='Hamza Express',
    )

    story = []

    # ═══════════════════════════════════════════════════════════
    # COVER
    # ═══════════════════════════════════════════════════════════
    story.append(Spacer(1, 55*mm))
    story.append(Paragraph(
        '<font color="#C9A96E">HAMZA EXPRESS</font>',
        S('cv', fontSize=14, leading=18, fontName='Helvetica-Bold',
          textColor=GOLD, alignment=TA_CENTER)
    ))
    story.append(Spacer(1, 28*mm))
    story.append(Paragraph(
        '<font color="white">Marketing Command Center</font>',
        S('cv2', fontSize=36, leading=42, fontName='Helvetica-Bold',
          textColor=white, alignment=TA_CENTER)
    ))
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph(
        '<font color="#C9A96E">Complete User Guide</font>',
        S('cv3', fontSize=22, leading=26, fontName='Helvetica',
          textColor=GOLD, alignment=TA_CENTER)
    ))
    story.append(Spacer(1, 35*mm))
    story.append(Paragraph(
        '<font color="white">For Nihaf, Basheer, Faheem &amp; Mumtaz</font>',
        S('cv4', fontSize=13, leading=16, textColor=white, alignment=TA_CENTER)
    ))
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph(
        '<font color="#C9A96E">Every dashboard, every control, every audit trail — in one place</font>',
        S('cv5', fontSize=11, leading=14, textColor=GOLD, alignment=TA_CENTER)
    ))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════
    # SECTION 1 — How this guide is organized
    # ═══════════════════════════════════════════════════════════
    story.append(section_header('1', 'How this guide is organized'))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        'This is the complete user guide for every dashboard and every tool we have '
        'built to run marketing at Hamza Express. One document covers what Nihaf '
        'does from the office (ads, budgets, keywords) and what Basheer\'s team does '
        'on the shop floor (leads, replies, bookings).',
        body
    ))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        'Read the section that matches your role. When you hand over to the next person, '
        'send them the section number.',
        body
    ))
    story.append(Spacer(1, 6*mm))

    story.append(Paragraph('What you will find in this guide', h2))
    story.append(Spacer(1, 2*mm))
    toc_rows = [
        ('1', 'How this guide is organized', 'You are here. Table of contents + who should read what.'),
        ('2', 'Who does what — role boundary', 'Nihaf vs Basheer vs Faheem vs Mumtaz. What each person can click.'),
        ('3', 'The Leads Dashboard', 'Basheer &amp; Faheem\'s daily tool. Triage, reply, assign, tag, bulk.'),
        ('4', 'The Google Ads Cockpit', 'Nihaf only. KPIs, keywords, search terms, campaign controls, Google recommendations.'),
        ('5', 'The CTWA Cockpit', 'Nihaf only. Meta ad funnel, WABA conversion, per-ad combos, live campaign controls.'),
        ('6', 'Audit trail — who did what, when', 'Every change — in leads and in ads — is logged. Here is where to read it.'),
        ('7', '72-hour auto-nurture', 'The background robot that brings cold CTWA leads back.'),
        ('8', 'Troubleshooting + who to call', 'If something is wrong, start here.'),
    ]
    data = []
    for num, name, desc in toc_rows:
        n_p = Paragraph(f'<b>{num}</b>', S('tn', fontSize=14, leading=16,
                                             fontName='Helvetica-Bold',
                                             textColor=GOLD, alignment=TA_CENTER))
        nm_p = Paragraph(f'<b>{name}</b>', body_b)
        d_p = Paragraph(desc, small)
        right = Table([[nm_p], [d_p]], colWidths=[148*mm])
        right.setStyle(TableStyle([
            ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),
            ('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),1),
        ]))
        data.append([n_p, right])
    toc_t = Table(data, colWidths=[12*mm, 162*mm])
    toc_t.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('BACKGROUND',(0,0),(0,-1), HexColor('#3D1610')),
        ('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),
        ('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),
        ('LINEBELOW',(0,0),(-1,-2),0.3, MED),
    ]))
    story.append(toc_t)
    story.append(Spacer(1, 8*mm))

    story.append(color_box(
        '&#128221; <b>Rule of thumb:</b> if you are reading this on your phone at 8 AM before the shop '
        'opens, jump to <b>Section 3</b>. If you are Nihaf checking spend, jump to <b>Sections 4 and 5</b>.',
        BURGUNDY, white, align=TA_LEFT, pad=10, fs=11, bold=False
    ))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════
    # SECTION 2 — Who does what
    # ═══════════════════════════════════════════════════════════
    story.append(section_header('2', 'Who does what'))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        'Every day Hamza Express spends money on Meta ads and Google ads to bring '
        'new people to our WhatsApp. Every scan of a station QR also creates a lead. '
        'If we do nothing with these leads, the money is wasted. Clear role boundaries '
        'are what stop that from happening.',
        body
    ))
    story.append(Spacer(1, 5*mm))

    # Roles table (expanded)
    story.append(Paragraph('The four people in the system', h2))
    roles_data = [
        [Paragraph('<b>Nihaf</b>', body_b),
         Paragraph('Managing Director. Sets up campaigns from the office. Controls ad spend, '
                   'budgets, pausing, targeting. Reads recommendations from Google. '
                   'Reads patterns reported by Basheer. <b>Lives in:</b> '
                   '<i>/ops/google-cockpit/</i>, <i>/ops/ctwa-cockpit/</i>.', body)],
        [Paragraph('<b>Basheer</b>', body_b),
         Paragraph('Owns sales &amp; marketing on-site. Triages every new lead. Replies on '
                   'WhatsApp from the dashboard. Runs bulk sweeps. Sends Nihaf a voice '
                   'note at end of day with 3 patterns he saw. <b>Lives in:</b> <i>/ops/leads/</i>.',
                   body)],
        [Paragraph('<b>Faheem</b>', body_b),
         Paragraph('Executes with Basheer — follow-ups, calls, tagging leads, bulk sweeps, '
                   'closing the payment-pending queue. <b>Lives in:</b> <i>/ops/leads/</i>.', body)],
        [Paragraph('<b>Mumtaz</b>', body_b),
         Paragraph('Handles dine-in conversions — calls booking drops, confirms table '
                   'bookings, greets customers at the door. The leads dashboard is a '
                   'secondary tool for him. <b>Lives in:</b> <i>/ops/bookings/</i>, '
                   'occasionally <i>/ops/leads/</i> (Booking drops segment).', body)],
    ]
    t = Table(roles_data, colWidths=[25*mm, 149*mm])
    t.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('BACKGROUND',(0,0),(0,-1), LIGHT),
        ('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),
        ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),
        ('LINEBELOW',(0,0),(-1,-2),0.3, MED),
    ]))
    story.append(t)
    story.append(Spacer(1, 7*mm))

    # The three dashboards
    story.append(Paragraph('The three dashboards', h2))
    story.append(Spacer(1, 2*mm))
    dash_rows = [
        [Paragraph('<b>/ops/leads/</b>', body_b),
         Paragraph('<b>Who:</b> Basheer, Faheem, Mumtaz (for booking drops).<br/>'
                   '<b>What:</b> Every person who messaged us — triage, reply, tag, assign.',
                   body)],
        [Paragraph('<b>/ops/google-cockpit/</b>', body_b),
         Paragraph('<b>Who:</b> Nihaf only.<br/>'
                   '<b>What:</b> Google Ads search campaign — spend, keywords, quality score, '
                   'search terms, pause/resume/budget, Google recommendations.', body)],
        [Paragraph('<b>/ops/ctwa-cockpit/</b>', body_b),
         Paragraph('<b>Who:</b> Nihaf only.<br/>'
                   '<b>What:</b> Meta CTWA campaign — impressions, clicks, spend, funnel '
                   '(clicked &rarr; engaged &rarr; booked &rarr; ordered), per-ad combos, '
                   'live pause / resume / budget.', body)],
    ]
    t = Table(dash_rows, colWidths=[55*mm, 119*mm])
    t.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('BACKGROUND',(0,0),(0,-1), HexColor('#fff7ed')),
        ('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),
        ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),
        ('LINEBELOW',(0,0),(-1,-2),0.3, MED),
    ]))
    story.append(t)
    story.append(Spacer(1, 7*mm))

    # Explicit role boundary — green vs red
    story.append(Paragraph('What each team controls — explicitly', h2))
    story.append(Spacer(1, 2*mm))
    boundary_rows = [
        [Paragraph('<b>&#9989; &nbsp; Basheer &amp; Faheem have full flexibility over:</b>',
                   S('bdy', fontSize=10, leading=13, textColor=GREEN, fontName='Helvetica-Bold')),
         Paragraph('<b>&#10060; &nbsp; Only Nihaf touches:</b>',
                   S('bdn', fontSize=10, leading=13, textColor=RED, fontName='Helvetica-Bold'))],
        [Paragraph(
            '&bull; Assigning leads to yourself or Faheem<br/>'
            '&bull; Changing status (hot / warm / cold / DND)<br/>'
            '&bull; Changing stage manually<br/>'
            '&bull; Adding tags and notes<br/>'
            '&bull; <b>Replying on WhatsApp from the dashboard</b><br/>'
            '&bull; Bulk assigning, bulk tagging, bulk notes<br/>'
            '&bull; Deciding who follows up, when, how',
            S('bd', fontSize=10, leading=13)),
         Paragraph(
            '&bull; Pausing or enabling ads<br/>'
            '&bull; Changing ad budgets<br/>'
            '&bull; Adding or removing keywords<br/>'
            '&bull; Changing bid amounts<br/>'
            '&bull; Blocking search terms<br/>'
            '&bull; Applying / dismissing Google recs<br/>'
            '&bull; Targeting radius or audience<br/>'
            '&bull; Campaign launch / shutdown',
            S('bd', fontSize=10, leading=13))],
    ]
    bt = Table(boundary_rows, colWidths=[87*mm, 87*mm])
    bt.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('BACKGROUND',(0,0),(0,0), HexColor('#dcfce7')),
        ('BACKGROUND',(1,0),(1,0), HexColor('#fee2e2')),
        ('BACKGROUND',(0,1),(0,1), HexColor('#f0fdf4')),
        ('BACKGROUND',(1,1),(1,1), HexColor('#fef2f2')),
        ('BOX',(0,0),(0,-1),0.5,GREEN),
        ('BOX',(1,0),(1,-1),0.5,RED),
        ('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),
        ('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),
    ]))
    story.append(bt)
    story.append(Spacer(1, 5*mm))
    story.append(color_box(
        '<b>The deal:</b> Nihaf owns the ad budget &amp; campaign decisions. Basheer\'s team owns every lead '
        'that walks through the door once it arrives. Full flexibility inside the leads '
        'dashboard — no flexibility on the ad platforms. Keeps the spend predictable and '
        'puts the conversion work in the hands closest to the customer.',
        BURGUNDY, white, align=TA_LEFT, pad=10, fs=10, bold=False
    ))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════
    # SECTION 3 — The Leads Dashboard
    # ═══════════════════════════════════════════════════════════
    story.append(section_header('3', 'The Leads Dashboard'))
    story.append(Paragraph('<font color="#64748b"><i>hamzaexpress.in/ops/leads/</i> &nbsp; &bull; &nbsp; Basheer, Faheem, Mumtaz</font>',
                            S('sub3', fontSize=10, leading=12)))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'This is the bulk of Basheer and Faheem\'s daily work. Every WhatsApp contact — '
        'paid ad, organic, station QR — lands here. The goal: turn them into orders or '
        'bookings before they go cold.',
        body
    ))
    story.append(Spacer(1, 6*mm))

    # 3.1 Getting started
    story.append(Paragraph('3.1 &nbsp; Signing in &amp; setting your name', h2))
    story.append(Spacer(1, 2*mm))

    story.append(step(
        '1', 'Open the dashboard',
        'On your phone or laptop, open Chrome and go to:<br/>'
        '<font name="Helvetica-Bold" size="13" color="#3D1610">hamzaexpress.in/ops/leads/</font><br/><br/>'
        'Add this to your home screen so you can open it with one tap.'
    ))

    story.append(step(
        '2', 'Enter your PIN',
        'You will land on a PIN screen. Use your assigned staff PIN (1001, 1002, 0305, 3754, or 5882 for admin). '
        'The PIN unlocks the dashboard for 8 hours before asking again.'
    ))

    story.append(step(
        '3', 'Pick your "Acting as" name',
        'Top-right corner has an <b>Acting as</b> dropdown. Tap your name: '
        '<b>Basheer</b>, <b>Faheem</b>, <b>Mumtaz</b>, <b>Nihaf</b>, or <b>Naveen</b>. '
        'This is saved on your device in <i>hn_leads_actor</i> (localStorage) so '
        'you do it once. Every change you make is saved with this name in the '
        'audit log. If you use a different phone, pick again.'
    ))

    story.append(step(
        '4', 'Look at the 4 big numbers on top',
        'These update every 15 seconds:'
    ))
    k1 = kpi_card('127', 'Total Leads', BURGUNDY)
    k2 = kpi_card('18', 'Today', GREEN)
    k3 = kpi_card('5', 'Hot', ORANGE)
    k4 = kpi_card('12', 'My Queue', BLUE)
    kpi_row = Table([[k1, k2, k3, k4]], colWidths=[42.5*mm]*4)
    kpi_row.setStyle(TableStyle([
        ('LEFTPADDING',(0,0),(-1,-1),2),('RIGHTPADDING',(0,0),(-1,-1),2),
    ]))
    story.append(kpi_row)
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        '&bull; <b>My Queue</b> shows only leads assigned to you. This is your daily list.',
        body
    ))
    story.append(PageBreak())

    # 3.2 Reading a lead card
    story.append(Paragraph('3.2 &nbsp; Reading a lead card', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Each person who messaged us is one card. Here is what every part means:',
        body
    ))
    story.append(Spacer(1, 4*mm))

    mock_card_name = Paragraph('<b>Asif Khan</b>  <font color="#64748b" size="9">+91 98450 12345</font>', body)
    mock_card_stage = Paragraph(
        f'{badge("PAYMENT PENDING", ORANGE)} &nbsp; '
        f'<font color="{MUTE.hexval()}" size="9">CTWA PAID &bull; Ghee Rice combo &bull; 12 min ago</font>',
        body
    )
    mock_card_tags = Paragraph(
        f'{badge("hot", PINK)}&nbsp;{badge("called", PINK)}&nbsp;'
        f'<font color="{MUTE.hexval()}" size="9">Score: 72</font>',
        body
    )
    mock_card_note = Paragraph(
        '<i>"Called at 3:15, asked for &#8377;50 discount. Said will pay in 10 min."</i>',
        S('n', fontSize=10, leading=13, textColor=MUTE)
    )
    card_inner = Table([
        [mock_card_name],
        [mock_card_stage],
        [mock_card_tags],
        [mock_card_note],
    ], colWidths=[170*mm])
    card_inner.setStyle(TableStyle([
        ('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),
        ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),
    ]))
    card_outer = Table([[card_inner]], colWidths=[174*mm])
    card_outer.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1),LIGHT),
        ('LINEBEFORE',(0,0),(0,-1),4,ORANGE),
        ('BOX',(0,0),(-1,-1),0.5,MED),
        ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),8),
        ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),
    ]))
    story.append(card_outer)
    story.append(Spacer(1, 5*mm))

    explain = [
        ('Name &amp; phone', 'Who this person is. Phone is auto-filled from WhatsApp.'),
        ('Left stripe colour', 'Where they came from — Orange=CTWA, Blue=Google, Purple=Station QR, Cyan=Organic.'),
        ('Stage badge', 'Where they are in the funnel right now (new &rarr; ordered).'),
        ('Pink tag chips', 'Labels you add — e.g. "hot", "called", "angry", "needs-discount".'),
        ('Score', '0 to 100. Higher = more likely to convert. Turns orange at 60+.'),
        ('Note line', 'Last note you typed — shown so team knows context instantly.'),
        ('Checkbox (top-left)', 'Tick to add to the bulk-action selection (see section 3.7).'),
    ]
    story.append(labelled_table(explain))
    story.append(PageBreak())

    # 3.3 Stages
    story.append(Paragraph('3.3 &nbsp; The 7 funnel stages', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Every lead moves through these stages. The system auto-sets the stage based '
        'on WhatsApp events, but you can override it when you know more.',
        body
    ))
    story.append(Spacer(1, 5*mm))
    story.append(stage_badge_row())
    story.append(Spacer(1, 6*mm))

    stages_detail = [
        ('NEW',       'Just arrived. Hasn\'t added anything to cart yet. <b>Action:</b> wait 10 minutes, then if still new, send a welcome note.', BLUE),
        ('ENGAGED',   'They opened the menu or added items to cart. <b>Action:</b> if no movement in 15 min, call them.', YELLOW),
        ('PAYMENT PENDING', 'They got the UPI payment card but haven\'t paid. <b>Action:</b> call within 5 min — this is money walking away.', ORANGE),
        ('BOOKING DROPPED', 'Tried to book a table, didn\'t finish. <b>Mumtaz action:</b> call and confirm.', RED),
        ('BOOKED',    'Table is confirmed for dine-in. <b>Action:</b> none — Mumtaz has the booking.', PURPLE),
        ('ORDERED',   'Paid and order went to kitchen. <b>Action:</b> none — mark as HOT for future repeat calls.', GREEN),
        ('LOST',      'Manually marked as gone cold. Won\'t get nurture messages. Use rarely.', MUTE),
    ]
    rows = []
    for name, desc, c in stages_detail:
        b_p = Paragraph(f'<b>{name}</b>', S('sd', fontSize=9, leading=11, textColor=white,
                                               alignment=TA_CENTER, fontName='Helvetica-Bold'))
        b_t = Table([[b_p]], colWidths=[30*mm])
        b_t.setStyle(TableStyle([
            ('BACKGROUND',(0,0),(-1,-1),c),
            ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),
        ]))
        rows.append([b_t, Paragraph(desc, body)])
    t = Table(rows, colWidths=[33*mm, 141*mm])
    t.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('LEFTPADDING',(0,0),(-1,-1),2),('RIGHTPADDING',(0,0),(-1,-1),6),
        ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LINEBELOW',(0,0),(-1,-2),0.3, MED),
    ]))
    story.append(t)
    story.append(PageBreak())

    # 3.4 Sources
    story.append(Paragraph('3.4 &nbsp; Where leads come from', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'The coloured stripe on the left edge of each lead tells you the source. '
        'This matters because some sources cost us money per click, and we must '
        'convert them fastest:',
        body
    ))
    story.append(Spacer(1, 5*mm))
    story.append(source_row())
    story.append(Spacer(1, 6*mm))

    story.append(color_box(
        '&#128293; Priority order: <b>CTWA PAID &gt; GOOGLE PAID &gt; STATION QR &gt; ORGANIC</b>. '
        'Paid leads cost money — every unanswered one is a loss. Call or message within '
        '5 minutes if you can.',
        ORANGE, white, align=TA_LEFT, pad=10, fs=11, bold=False
    ))
    story.append(Spacer(1, 6*mm))

    # 3.5 Filters + search
    story.append(Paragraph('3.5 &nbsp; Filters and search', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'At the top of the list you have quick filter buttons plus a search box. '
        'Combine these to narrow down the 127 leads to just the ones that need you now.',
        body
    ))
    story.append(Spacer(1, 4*mm))
    filter_rows = [
        ('All / Mine', 'Start here. "Mine" shows only leads assigned to you.'),
        ('Stage buttons', 'New / Engaged / Payment / Book Drop / Ordered / Booked.'),
        ('Status dropdown', 'Hot / Warm / Cold / DND.'),
        ('Source dropdown', 'CTWA / Google / Station QR / Organic.'),
        ('Assignee dropdown', 'Show leads belonging to a specific person — including "Unassigned".'),
        ('Tag dropdown', 'Filter by any tag you\'ve used (e.g. "called", "discount").'),
        ('Search box', 'Type a name or phone fragment — filters the list live as you type.'),
    ]
    story.append(labelled_table(filter_rows))
    story.append(PageBreak())

    # 3.6 What you can change on a lead
    story.append(Paragraph('3.6 &nbsp; What you can change on a lead', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Tap a lead card to open the details panel. You can change these fields — '
        'each change is saved with your name and timestamp to the <b>lead_audit</b> table:',
        body
    ))
    story.append(Spacer(1, 4*mm))

    actions = [
        ('Assign to someone',
         'Use the <b>Assignee</b> dropdown. Options: Unassigned / Basheer / Faheem / Mumtaz / Nihaf / Naveen. '
         'The person you pick will see it in their "Mine" queue.'),
        ('Change the stage',
         'Override the auto-detected stage. Use when you know better — e.g. you '
         'called them and they confirmed they\'ll pay later, move to PAYMENT PENDING manually.'),
        ('Set the status',
         'HOT / WARM / COLD / DND. <b>DND</b> means "do not disturb" — they told us to stop. '
         'These people will not get the 72-hour nurture messages.'),
        ('Add tags',
         'Click <b>+ tag</b> &rarr; type short labels like "called", "no-answer", '
         '"asked-discount". Click the &times; on any tag to remove it. Existing tags '
         'autocomplete as you type.'),
        ('Set a score (0–100)',
         'Quick gut rating. Turns orange at 60+. Helps you sort by who\'s most likely to buy.'),
        ('Write a note',
         'Plain text. Write what you did — "called at 3pm, said will come Friday". '
         'The whole team sees it next time they open the lead.'),
        ('Reply on WhatsApp',
         'See section 3.8 — this is the big one.'),
    ]
    for title, desc in actions:
        story.append(Paragraph(f'<b>&#9632; {title}</b>', h3))
        story.append(Paragraph(desc, body))
        story.append(Spacer(1, 3*mm))

    story.append(Spacer(1, 2*mm))
    story.append(color_box(
        '&#128221; Every change is logged. Open the <b>Audit</b> tab inside a lead to see '
        'exactly who changed what, and when. No arguments about "I didn\'t do that". See Section 6.',
        BURGUNDY, white, align=TA_LEFT, pad=10, fs=11, bold=False
    ))
    story.append(PageBreak())

    # 3.7 Bulk actions (Wave 2.5)
    story.append(Paragraph('3.7 &nbsp; Bulk actions — many leads at once', h2))
    story.append(Paragraph('<font color="#f97316"><b>Wave 2.5</b></font>', small))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        'When 20 CTWA leads arrive in one evening, you don\'t need to open each card '
        'and change the assignee one by one. Select them all, apply the change once.',
        body
    ))
    story.append(Spacer(1, 5*mm))

    bulk_header = Paragraph(
        '<font color="#f97316" size="12"><b>3 selected</b></font> &nbsp;&nbsp; '
        '<font color="#64748b" size="9">ASSIGN</font> '
        '<font color="#f1f5f9" backcolor="#1a2234" size="10">&nbsp;Faheem &nbsp;&#9662;&nbsp;</font> &nbsp; '
        '<font color="#64748b" size="9">STATUS</font> '
        '<font color="#f1f5f9" backcolor="#1a2234" size="10">&nbsp;Called &nbsp;&#9662;&nbsp;</font> &nbsp; '
        '<font color="#64748b" size="9">STAGE</font> '
        '<font color="#f1f5f9" backcolor="#1a2234" size="10">&nbsp;Engaged &nbsp;&#9662;&nbsp;</font> &nbsp; '
        '<font color="#f97316" backcolor="#fff7ed" size="10">&nbsp;+ Tag&nbsp;</font> '
        '<font color="#f97316" backcolor="#fff7ed" size="10">&nbsp;+ Note&nbsp;</font> &nbsp; '
        '<font color="#ef4444" backcolor="#fef2f2" size="10">&nbsp;Clear&nbsp;</font>',
        S('bulk', fontSize=10, leading=14)
    )
    bulk_table = Table([[bulk_header]], colWidths=[174*mm])
    bulk_table.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1),HexColor('#fff7ed')),
        ('BOX',(0,0),(-1,-1),1,ORANGE),
        ('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),
        ('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10),
    ]))
    story.append(bulk_table)
    story.append(Spacer(1, 5*mm))

    story.append(Paragraph('How to use it', h3))
    bulk_steps = [
        ('1', 'Every lead card has a <b>small checkbox on the top-left corner</b>. Tick the ones you want to work on.'),
        ('2', 'As soon as you tick even one card, an orange bar slides in at the top. It says <b>"X selected"</b>.'),
        ('3', 'Use the dropdowns: <b>Assign &rarr;</b> pick a person. <b>Status &rarr;</b> new/called/interested/DND. <b>Stage &rarr;</b> change the funnel stage.'),
        ('4', 'The change is applied to <b>every ticked lead</b> in one go. You get a confirmation popup — click OK.'),
        ('5', 'Green toast: <b>"assignee &rarr; faheem — 3/3"</b>. Done.'),
        ('6', 'Use <b>+ Tag</b> to add the same tag to every selected (existing tags are kept). Use <b>+ Note</b> to append a timestamped note.'),
        ('7', 'Use <b>Clear</b> to deselect everyone. Or tick "Select all visible" to grab the whole filtered list.'),
    ]
    for n, txt in bulk_steps:
        story.append(mini_step(n, txt, ORANGE))
    story.append(Spacer(1, 5*mm))

    # Common workflows
    story.append(Paragraph('3 workflows where this saves 20 minutes', h3))
    wf_rows = [
        ('Basheer, 8 AM',
         'Filter <b>CTWA</b> + Date <b>Today</b> &rarr; "Select all visible" &rarr; Assign &rarr; <b>Faheem</b>. '
         'All overnight CTWA leads go to Faheem\'s queue in 3 clicks.',
         CYAN),
        ('Faheem, end of shift',
         'Filter <b>"Mine"</b> &rarr; Select all visible &rarr; <b>+ Note</b> &rarr; type "Called, no answer, '
         'follow up tomorrow". Every one of your leads gets the same timestamped note appended.',
         BLUE),
        ('Mumtaz, after lunch rush',
         'Filter <b>"Booked"</b> &rarr; tick the ones who actually arrived &rarr; Status &rarr; '
         '<b>Converted</b>. Captures the conversion in 30 seconds instead of 5 minutes.',
         PURPLE),
    ]
    for who, what, c in wf_rows:
        who_p = Paragraph(f'<b>{who}</b>',
                           S('wf', fontSize=10, leading=13, textColor=white,
                             fontName='Helvetica-Bold', alignment=TA_LEFT))
        who_t = Table([[who_p]], colWidths=[50*mm])
        who_t.setStyle(TableStyle([
            ('BACKGROUND',(0,0),(-1,-1),c),
            ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
            ('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),
        ]))
        what_p = Paragraph(what, body)
        r = Table([[who_t, what_p]], colWidths=[52*mm, 122*mm])
        r.setStyle(TableStyle([
            ('VALIGN',(0,0),(-1,-1),'TOP'),
            ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),6),
            ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),
            ('LINEBELOW',(0,0),(-1,-2),0.3, MED),
        ]))
        story.append(r)
    story.append(Spacer(1, 5*mm))

    story.append(color_box(
        '&#128161; <b>Selection persists.</b> If the page auto-refreshes (every 15 seconds) or '
        'you change a filter, your tickmarks stay. Only <b>Clear</b> or reloading the whole page wipes it.',
        GOLD, INK, align=TA_LEFT, pad=10, fs=11, bold=False
    ))
    story.append(PageBreak())

    # 3.8 Reply on WhatsApp (Wave 2.4)
    story.append(Paragraph('3.8 &nbsp; Reply on WhatsApp from the dashboard', h2))
    story.append(Paragraph('<font color="#22c55e"><b>Wave 2.4</b></font>', small))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        'This is the biggest time-saver. Before, you had to open WhatsApp Web, '
        'search for the customer, type a reply, then come back here and add a note. '
        'Now everything happens in one screen.',
        body
    ))
    story.append(Spacer(1, 4*mm))

    reply_header = Paragraph('<b>Conversation (inside a lead)</b>',
                              S('rh', fontSize=10, leading=13, textColor=MUTE))
    reply_customer = Paragraph(
        '<font color="#22c55e" size="9"><b>Customer</b></font> &nbsp; '
        '<font color="#64748b" size="8">2:15 PM</font><br/>'
        'Bhai, combo ka rate kya hai?',
        S('rm1', fontSize=10, leading=13)
    )
    reply_staff = Paragraph(
        '<font color="#f97316" size="9"><b>Staff &middot; Basheer</b></font> &nbsp; '
        '<font color="#64748b" size="8">2:16 PM</font><br/>'
        'Hi! Ghee Rice Combo is \u20B9139 with dal, sherwa, salad free.',
        S('rm2', fontSize=10, leading=13)
    )
    reply_input = Paragraph(
        '<font color="#64748b" size="9">You\'re replying as <b><font color="#06b6d4">Basheer</font></b>. '
        'Every reply is logged to the customer\'s journey + audit trail.</font><br/><br/>'
        '<font color="#94a3b8" size="10">[&nbsp;Type a WhatsApp reply to the customer\u2026&nbsp;]</font> '
        '<font color="#22c55e" backcolor="#dcfce7"><b> &nbsp;Send&nbsp; </b></font>',
        S('ri', fontSize=10, leading=13)
    )
    reply_box = Table([
        [reply_header],
        [reply_customer],
        [reply_staff],
        [reply_input],
    ], colWidths=[174*mm])
    reply_box.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1),LIGHT),
        ('BOX',(0,0),(-1,-1),0.5,MED),
        ('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),
        ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
        ('LINEBELOW',(0,0),(-1,-2),0.3, MED),
        ('BACKGROUND',(0,3),(0,3), HexColor('#fff7ed')),
        ('LINEABOVE',(0,3),(0,3),1, ORANGE),
    ]))
    story.append(reply_box)
    story.append(Spacer(1, 6*mm))

    story.append(Paragraph('How to use it', h3))
    reply_steps = [
        ('1', 'Click any lead card &rarr; the Journey panel slides up &rarr; you land on the <b>Conversation</b> tab.'),
        ('2', 'Scroll down past the last message. You\'ll see a text box and a green <b>Send</b> button.'),
        ('3', 'Type your reply in natural language. Urdu, Hindi, English — all work. Max 4000 characters.'),
        ('4', 'Press <b>Cmd+Enter</b> (Mac) or <b>Ctrl+Enter</b> (Windows) to send fast. Or click Send.'),
        ('5', 'Your message appears instantly with the label <b>"Staff &middot; Basheer"</b>. The customer sees it on their WhatsApp.'),
    ]
    for n, txt in reply_steps:
        story.append(mini_step(n, txt))
    story.append(Spacer(1, 5*mm))

    story.append(Paragraph('4 quick templates (above the text box)', h3))
    story.append(Paragraph(
        'One click fills the text box — you can then edit before sending:', body
    ))
    story.append(Spacer(1, 2*mm))
    tmpl_rows = [
        ['&#128075; <b>Intro</b>', '"Hi! This is Basheer from Hamza Express. How can I help?"'],
        ['&#127869; <b>Order nudge</b>', '"Is there anything I can help you order? We\'re open 12 PM to 12:30 AM."'],
        ['&#128197; <b>Booking</b>', '"Would you like to book a table? I can help you pick a time."'],
        ['&#128591; <b>Recovery</b>', '"Apologies for the delay. What would you like to try today?"'],
    ]
    for label, text in tmpl_rows:
        l_p = Paragraph(label, S('tl', fontSize=10, leading=12))
        t_p = Paragraph(f'<i>{text}</i>', S('tt', fontSize=10, leading=13, textColor=MUTE))
        r = Table([[l_p, t_p]], colWidths=[35*mm, 139*mm])
        r.setStyle(TableStyle([
            ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
            ('LEFTPADDING',(0,0),(-1,-1),4),('RIGHTPADDING',(0,0),(-1,-1),4),
            ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
            ('LINEBELOW',(0,0),(-1,-2),0.3, MED),
        ]))
        story.append(r)
    story.append(Spacer(1, 5*mm))

    story.append(color_box(
        '&#9888;&#65039; <b>Important:</b> Your reply is a real WhatsApp message. The customer '
        'will reply to YOU. Don\'t send test messages. Don\'t send jokes. Don\'t copy-paste '
        'personal stuff — treat this like a formal business message from Hamza Express.',
        ORANGE, white, align=TA_LEFT, pad=10, fs=11, bold=False
    ))
    story.append(PageBreak())

    # 3.9 Journey panel
    story.append(Paragraph('3.9 &nbsp; The Journey panel (right side)', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'When you click a lead, the right side of the screen opens with the full '
        'customer context. It has 3 tabs:',
        body
    ))
    story.append(Spacer(1, 4*mm))

    tabs_data = [
        ('Conversation',
         'Every WhatsApp message between us and the customer (wa_messages table). '
         'Read this before you call — you\'ll know their name, what they ordered, '
         'where they got stuck. This is where you reply (section 3.8).'),
        ('Orders &middot; Bookings',
         'List of all past orders (paid, cancelled, failed) and all dine-in bookings. '
         'Shows lifetime money spent and last visit.'),
        ('Audit',
         'Full history of edits from the <b>lead_audit</b> D1 table — "Basheer changed '
         'status new &rarr; hot at 3:42 PM". This is the accountability layer.'),
    ]
    story.append(labelled_table(tabs_data))
    story.append(Spacer(1, 6*mm))

    story.append(color_box(
        '&#128161; TIP — always read the Conversation tab before calling. If the customer '
        'already asked for a discount 2 hours ago and you don\'t mention it, they will '
        'feel unheard.',
        GOLD, INK, align=TA_LEFT, pad=10, fs=11, bold=False
    ))
    story.append(Spacer(1, 6*mm))

    # 3.10 Segments
    story.append(Paragraph('3.10 &nbsp; Ready-made lists (segments)', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Instead of scrolling through all 127 leads, use these pre-built filter '
        'combinations. They live in the <b>Segments</b> dropdown:',
        body
    ))
    story.append(Spacer(1, 4*mm))

    segs = [
        ('&#128293; Paid no-replies', 'CTWA/Google clicks that never replied. Dead spend if ignored.', ORANGE),
        ('&#9888;&#65039; Stuck in payment', 'Got payment card but didn\'t pay in the last hour. Rescue these.', RED),
        ('&#128197; Booking drops', 'Tried to book dine-in, didn\'t finish. <b>Mumtaz queue</b>.', PURPLE),
        ('&#11088; VIP 3+ orders', 'Regulars. Send them a "thank you" note once a month.', GOLD),
        ('&#10052;&#65039; Cold for 3 days', 'Were engaged, now silent for 72+ hours. Nudge with a combo offer.', BLUE),
        ('&#10067; Unassigned', 'Nobody owns these yet. Basheer: sweep and assign to Faheem.', MUTE),
    ]
    for name, desc, c in segs:
        b_p = Paragraph(name, S('sg', fontSize=11, leading=13, textColor=white,
                                   fontName='Helvetica-Bold', alignment=TA_LEFT))
        b_t = Table([[b_p]], colWidths=[60*mm])
        b_t.setStyle(TableStyle([
            ('BACKGROUND',(0,0),(-1,-1),c),
            ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),
            ('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),
        ]))
        d_p = Paragraph(desc, body)
        r = Table([[b_t, d_p]], colWidths=[62*mm, 112*mm])
        r.setStyle(TableStyle([
            ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
            ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),6),
            ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
        ]))
        story.append(r)
        story.append(Spacer(1, 3*mm))
    story.append(PageBreak())

    # 3.11 Daily workflow
    story.append(Paragraph('3.11 &nbsp; Your daily workflow', h2))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph('Morning (12:00 PM shop open)', h3))
    morning = [
        'Open dashboard, check total leads count vs yesterday',
        'Check "Stuck in payment" segment — any leftovers from last night?',
        'Basheer: bulk-assign "Unassigned" leads to Faheem or yourself',
        'Read Mumtaz\'s overnight notes on booking drops',
    ]
    for item in morning:
        story.append(Paragraph(f'&#9634; &nbsp; {item}', body))
        story.append(Spacer(1, 1*mm))

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph('During the day (every 2 hrs)', h3))
    during = [
        'Open "Mine" — clear anything in PAYMENT PENDING',
        'Open "Paid no-replies" — call or WhatsApp-reply within 5 min',
        'Mumtaz: clear "Booking drops" queue every 30 min',
        'Add tags &amp; notes on every touchpoint',
    ]
    for item in during:
        story.append(Paragraph(f'&#9634; &nbsp; {item}', body))
        story.append(Spacer(1, 1*mm))

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph('Evening (before closing)', h3))
    evening = [
        'Review today\'s conversions in the "Ordered" stage',
        'Tag today\'s VIP orders (3+ lifetime) with <b>"vip"</b>',
        'Basheer: send voice note to Nihaf with 3 patterns you saw today',
        'Mark any DND requests — customers who asked us to stop',
    ]
    for item in evening:
        story.append(Paragraph(f'&#9634; &nbsp; {item}', body))
        story.append(Spacer(1, 1*mm))
    story.append(Spacer(1, 5*mm))

    story.append(Paragraph('Auto-refresh and safety', h3))
    story.append(Paragraph(
        'The dashboard auto-refreshes every <b>15 seconds</b>. Your selections, open '
        'lead panel, and typed (unsent) reply text all survive the refresh. Only '
        'reloading the whole page wipes state.',
        body
    ))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════
    # SECTION 4 — Google Ads Cockpit
    # ═══════════════════════════════════════════════════════════
    story.append(section_header('4', 'The Google Ads Cockpit'))
    story.append(Paragraph('<font color="#64748b"><i>hamzaexpress.in/ops/google-cockpit/</i> &nbsp; &bull; &nbsp; Nihaf only</font>',
                            S('sub4', fontSize=10, leading=12)))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Live view of the Hamza Express Google Search campaign (ID 23748431244, '
        'budget &#8377;500/day). Everything read is live from the Google Ads API. '
        'Everything you write flows through /api/ads-control and lands in ads_control_log.',
        body
    ))
    story.append(Spacer(1, 6*mm))

    # 4.1 Header + actor
    story.append(Paragraph('4.1 &nbsp; Header and "Acting as"', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'The header has an <b>Acting as</b> dropdown (same pattern as the leads '
        'dashboard, but stored in localStorage as <b>ads_control_actor</b>). Set it '
        'once and every pause/resume/budget change you make is attributed to that '
        'name in the audit trail.',
        body
    ))
    story.append(Spacer(1, 6*mm))

    # 4.2 KPI tiles (Wave 1)
    story.append(Paragraph('4.2 &nbsp; KPI tiles (Wave 1)', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Top of the page: unified KPI strip — follows the funnel from spend to '
        'impressions to conversions. Fatigue badges light up when a keyword is '
        'overspending, quality-score pills flag weak keywords, first-page CPC '
        'estimates show the minimum bid needed to show on page one.',
        body
    ))
    story.append(Spacer(1, 4*mm))

    kpi_tiles = [
        ('Impressions', 'How often the ad was shown.'),
        ('Clicks', 'Taps on the ad.'),
        ('Spend', '&#8377; spent today / selected period.'),
        ('CTR', 'Click-through rate — clicks &divide; impressions.'),
        ('Avg CPC', 'Average cost per click.'),
        ('Avg CPM', 'Cost per 1000 impressions.'),
        ('Conversions', 'Calls, WhatsApp taps, site visits tracked as conv.'),
        ('Impression Share', 'How much of the eligible market our ad reached.'),
        ('Top', 'Share shown above organic results.'),
        ('Abs Top', 'Share shown in the #1 position.'),
        ('Status', 'ENABLED / PAUSED / ending.'),
    ]
    story.append(labelled_table(kpi_tiles, label_w=50, body_w=124))
    story.append(Spacer(1, 5*mm))

    story.append(Paragraph('Urgency bar', h3))
    story.append(Paragraph(
        'A single-line banner at the very top surfaces the most urgent signal across '
        'all campaigns — e.g. "Budget exhausted at 11:32 AM today" or "3 keywords '
        'rated Poor quality". Same bar appears on the CTWA cockpit, so both read '
        'off the same <i>/api/urgency</i> feed.',
        body
    ))
    story.append(PageBreak())

    # 4.3 Ad groups + search position
    story.append(Paragraph('4.3 &nbsp; Ad Group Performance &amp; Search Position', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Ad Group table: bid / impressions / clicks / CTR / spend per ad group. '
        'Search Position cards: how often we appear at the top of the page vs '
        'below organic. Drops in Abs Top share usually mean competitors have '
        'outbid us.',
        body
    ))
    story.append(Spacer(1, 6*mm))

    # 4.4 Organic Reach
    story.append(Paragraph('4.4 &nbsp; Organic Reach', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Two tabs under the Organic section — these are FREE impressions, no ad spend:',
        body
    ))
    story.append(Spacer(1, 3*mm))
    organic_rows = [
        ('&#128205; Google Maps &amp; GBP',
         'Google Business Profile views, calls, direction requests. Place ID '
         '<i>ChIJ-QQjtHEXrjsR-Z1RIEm2arg</i>. Data via Business Profile API.'),
        ('&#128269; Organic Search',
         'Google Search Console impressions, clicks, avg position. The queries '
         'people typed that landed them on hamzaexpress.in.'),
    ]
    story.append(labelled_table(organic_rows, label_w=50, body_w=124))
    story.append(Spacer(1, 6*mm))

    # 4.5 Keyword Performance + Quality Score (Wave 1)
    story.append(Paragraph('4.5 &nbsp; Keyword Performance with Quality Score (Wave 1)', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Table of all 8 active keywords (4 "near me" + 4 "shivajinagar") with '
        'inline-editable bids and a Quality Score pill per row:',
        body
    ))
    story.append(Spacer(1, 4*mm))

    qs_rows = [
        ('excellent (8-10)',
         'Green pill. Google loves this keyword — cheap clicks, strong position. Leave alone.'),
        ('good (6-7)',
         'Blue pill. Healthy. Monitor weekly.'),
        ('poor (1-5)',
         'Red pill. Landing page relevance or ad copy is weak. Rewrite RSA or pause.'),
        ('unrated (null/0)',
         'Grey pill. New keyword — not enough data yet. Wait 7 days.'),
    ]
    story.append(labelled_table(qs_rows, label_w=40, body_w=134))
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph(
        'Click any bid cell to edit inline. Enter a new &#8377; amount, tab out, and it '
        'fires POST /api/ads-control with action=bid — the new CPC is live on Google '
        'within 30 seconds.',
        body
    ))
    story.append(Spacer(1, 6*mm))

    # 4.6 Daily Trend
    story.append(Paragraph('4.6 &nbsp; Daily Trend', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Stacked area chart of clicks + spend + conversions over the last 30 days. '
        'Useful for spotting weekday/weekend patterns and the effect of budget '
        'changes over time.',
        body
    ))
    story.append(PageBreak())

    # 4.7 What People Actually Searched + Wave 2.2
    story.append(Paragraph('4.7 &nbsp; What People Actually Searched', h2))
    story.append(Paragraph('<font color="#3b82f6"><b>Wave 2.2 — one-click Block</b></font>', small))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'The "Search Terms" panel lists the actual phrases people typed on Google '
        'that triggered our ad — not the keywords WE bid on. This is where you '
        'spot waste:',
        body
    ))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        '<b>Example:</b> we bid on "biryani near me" but the search term was '
        '"biryani recipe" &rarr; wasted click. Block it.',
        body
    ))
    story.append(Spacer(1, 4*mm))

    st_steps = [
        ('1', 'Scroll to the <b>Search Terms</b> table. Each row shows the term, impressions, clicks, spend.'),
        ('2', 'Click the <b>Block</b> button at the end of the row.'),
        ('3', 'Confirm the popup — the term is added as a <b>PHRASE-match negative keyword</b> at campaign level.'),
        ('4', 'The row flips to "Blocked" (grey, disabled) without waiting for the next Google sync.'),
        ('5', 'Every block lands in <i>ads_control_log</i> with your actor name and the reason.'),
    ]
    for n, txt in st_steps:
        story.append(mini_step(n, txt, BLUE))
    story.append(Spacer(1, 5*mm))

    story.append(color_box(
        '&#128161; The "Add negative" box in the campaign-controls strip (section 4.8) does '
        'the same thing manually — type any phrase and block it pre-emptively.',
        GOLD, INK, align=TA_LEFT, pad=10, fs=11, bold=False
    ))
    story.append(Spacer(1, 6*mm))

    # 4.8 Campaign controls (Wave 2.1)
    story.append(Paragraph('4.8 &nbsp; Campaign controls strip (Wave 2.1)', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Top of the page. One horizontal strip, four actions. Every click hits '
        '<b>POST /api/ads-control</b> with <i>platform=google</i> and the change is '
        'audited before it returns.',
        body
    ))
    story.append(Spacer(1, 4*mm))

    ctrl_rows = [
        ('Pause',
         'Immediately sets campaign status = PAUSED. Use when spend is running '
         'away or something is broken on the landing page.'),
        ('Resume',
         'Sets status = ENABLED. The campaign starts spending again.'),
        ('Daily budget',
         'Enter a rupee amount (&ge; &#8377;50) and press Apply. Budget is converted '
         'to micros (&#8377;500 &rarr; 500,000,000) and pushed via campaignBudgets:mutate.'),
        ('Add negative',
         'Type a phrase to block pre-emptively. PHRASE match by default. '
         'Same effect as the per-row Block button in section 4.7.'),
    ]
    story.append(labelled_table(ctrl_rows, label_w=40, body_w=134))
    story.append(Spacer(1, 4*mm))

    story.append(color_box(
        '&#9888;&#65039; <b>These controls live on the Google campaign.</b> Pause = real spend '
        'stops. Budget change = real budget changes. Treat every click as intentional. '
        'Every change is logged to <b>ads_control_log</b> with your actor name and '
        'before-after state.',
        ORANGE, white, align=TA_LEFT, pad=10, fs=11, bold=False
    ))
    story.append(Spacer(1, 4*mm))

    story.append(Paragraph('API shape (for reference)', h3))
    story.append(box(Paragraph(
        'POST /api/ads-control<br/>'
        '<font name="Courier" size="10">'
        '{ "platform": "google", "action": "pause|resume|budget|bid|negative", '
        '"value": 500, "actor": "Nihaf" }'
        '</font>',
        S('api', fontSize=10, leading=14)),
        bg=HexColor('#0f172a'), border=MED, pad=10
    ))
    story.append(PageBreak())

    # 4.9 Google Recommendations (Wave 2.7)
    story.append(Paragraph('4.9 &nbsp; Google Recommendations panel', h2))
    story.append(Paragraph('<font color="#a855f7"><b>Wave 2.7 — NEW</b></font>', small))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        'Google\'s own recommendations engine — the same feed you see under '
        '"Recommendations" in the Google Ads UI — rendered as clickable cards '
        'inside the cockpit, next to the metrics the rec is reacting to. Served '
        'by <b>GET /api/google-recommendations</b> and acted on with '
        '<b>POST /api/google-recommendations</b>.',
        body
    ))
    story.append(Spacer(1, 5*mm))

    story.append(Paragraph('What each card shows', h3))
    card_parts = [
        ('Icon + plain-English title',
         'Not "KEYWORD_MATCH_TYPE_RECOMMENDATION" — plain English like "Change keyword match type", translated by <i>titleFor()</i>.'),
        ('Subtitle', 'What Google specifically suggests. E.g. "\'biryani near me\' &rarr; BROAD".'),
        ('Current &rarr; Potential delta chips',
         'Impressions, clicks, cost, conversions delta if you apply. Green = improvement.'),
        ('Apply button',
         'Calls POST /api/google-recommendations with action=apply. The change goes live on Google.'),
        ('Dismiss button',
         'Hides the card. Still audited (action=rec_dismiss).'),
    ]
    story.append(labelled_table(card_parts, label_w=52, body_w=122))
    story.append(Spacer(1, 5*mm))

    story.append(Paragraph('Recommendation types you\'ll see', h3))
    story.append(Paragraph(
        'The <i>titleFor()</i> helper covers these types (icon &#124; title):',
        body
    ))
    story.append(Spacer(1, 2*mm))
    rec_types = [
        ('&#127919; KEYWORD', 'Add a new keyword Google found'),
        ('&#128257; KEYWORD_MATCH_TYPE', 'Change keyword match type'),
        ('&#128176; CAMPAIGN_BUDGET', 'Campaign is limited by budget'),
        ('&#128200; FORECASTING_CAMPAIGN_BUDGET', 'Budget forecast recommendation'),
        ('&#8596;&#65039; MOVE_UNUSED_BUDGET', 'Move unused budget from another campaign'),
        ('&#128221; TEXT_AD', 'Create a new ad'),
        ('&#129302; RESPONSIVE_SEARCH_AD', 'Create a responsive search ad'),
        ('&#9999;&#65039; RESPONSIVE_SEARCH_AD_ASSET', 'Add headlines or descriptions'),
        ('&#128170; RSA_IMPROVE_AD_STRENGTH', 'Improve ad strength'),
        ('&#128279; SITELINK_ASSET', 'Add sitelink extensions'),
        ('&#127991;&#65039; CALLOUT_ASSET', 'Add callout extensions'),
        ('&#128222; CALL_ASSET', 'Add a call extension'),
        ('&#128203; STRUCTURED_SNIPPET_ASSET', 'Add structured snippets'),
        ('&#127919; TARGET_CPA_OPT_IN', 'Switch to Target CPA bidding'),
        ('&#128070; MAXIMIZE_CLICKS_OPT_IN', 'Switch to Maximise Clicks'),
        ('&#9989; MAXIMIZE_CONVERSIONS_OPT_IN', 'Switch to Maximise Conversions'),
        ('&#127760; USE_BROAD_MATCH_KEYWORD', 'Try broad match keywords'),
        ('&#11015;&#65039; LOWER_CPC', 'Lower your max CPC'),
        ('&#9889; ENHANCED_CPC_OPT_IN', 'Turn on Enhanced CPC'),
        ('&#129309; SEARCH_PARTNERS_OPT_IN', 'Opt in to Search Partners'),
    ]
    # render in 2 columns
    for i in range(0, len(rec_types), 2):
        left = rec_types[i]
        right = rec_types[i+1] if i+1 < len(rec_types) else ('', '')
        l_p = Paragraph(f'<b>{left[0]}</b> &nbsp; {left[1]}', S('rt', fontSize=9, leading=12))
        r_p = Paragraph(f'<b>{right[0]}</b> &nbsp; {right[1]}', S('rt', fontSize=9, leading=12)) if right[0] else Paragraph('', body)
        r = Table([[l_p, r_p]], colWidths=[87*mm, 87*mm])
        r.setStyle(TableStyle([
            ('VALIGN',(0,0),(-1,-1),'TOP'),
            ('LEFTPADDING',(0,0),(-1,-1),2),('RIGHTPADDING',(0,0),(-1,-1),2),
            ('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2),
        ]))
        story.append(r)
    story.append(Spacer(1, 6*mm))

    story.append(color_box(
        '&#9888;&#65039; <b>Apply changes the live campaign.</b> Always check the delta '
        'chips before clicking. A rec that promises "+150 impressions" for "+&#8377;300 spend" '
        'is not obviously a win — verify it fits the daily budget. Every apply and '
        'dismiss is recorded in ads_control_log as <b>rec_apply</b> / <b>rec_dismiss</b>.',
        RED, white, align=TA_LEFT, pad=10, fs=11, bold=False
    ))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════
    # SECTION 5 — CTWA Cockpit
    # ═══════════════════════════════════════════════════════════
    story.append(section_header('5', 'The CTWA Cockpit'))
    story.append(Paragraph('<font color="#64748b"><i>hamzaexpress.in/ops/ctwa-cockpit/</i> &nbsp; &bull; &nbsp; Nihaf only</font>',
                            S('sub5', fontSize=10, leading=12)))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Live Meta CTWA (Click-to-WhatsApp) campaign view. Campaign ID '
        '120243729366800505 &bull; Ad account act_634959029638544 &bull; &#8377;1500/day '
        '&bull; Males 18-35 &bull; 3km from Hamza Express. Merges Meta Ads API '
        'metrics with D1 funnel data in one view.',
        body
    ))
    story.append(Spacer(1, 6*mm))

    # 5.1 Control strip (Wave 2.3)
    story.append(Paragraph('5.1 &nbsp; Live campaign controls (Wave 2.3)', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Same pattern as the Google cockpit — top-of-page strip with Pause, Resume, '
        'and Daily Budget input. Routes through <b>POST /api/ads-control</b> with '
        '<i>platform=meta</i>. Budget mutations hit the ad-set (not the campaign) '
        'because that\'s where Meta carries daily_budget for CTWA.',
        body
    ))
    story.append(Spacer(1, 4*mm))

    meta_ctrl_rows = [
        ('Pause / Resume',
         'Flips campaign status between PAUSED and ACTIVE via Graph API v25.0.'),
        ('Daily budget',
         'Meta INR account is in paise — &#8377;1500 = 150,000 paise. UI accepts rupees, '
         'backend converts.'),
        ('Status pill',
         'Next to the controls — live read of campaign.status + effective_status '
         '(ACTIVE / PAUSED / ARCHIVED).'),
        ('Audit log link',
         'Opens <i>/api/ads-control?action=log&amp;platform=meta</i> in a new tab — '
         'shows the last 20 Meta-side changes.'),
    ]
    story.append(labelled_table(meta_ctrl_rows, label_w=40, body_w=134))
    story.append(Spacer(1, 5*mm))

    story.append(color_box(
        '&#128161; <b>Meta does not use negative keywords.</b> CTWA is audience-targeted, not '
        'search-term-targeted — so the negative-keyword UI is Google-only. For Meta, '
        'adjust audience targeting in the Meta Ads Manager UI directly.',
        GOLD, INK, align=TA_LEFT, pad=10, fs=11, bold=False
    ))
    story.append(PageBreak())

    # 5.2 KPI strip
    story.append(Paragraph('5.2 &nbsp; Unified KPI strip', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Single row of KPIs — follows the funnel from ad spend to revenue. Previous '
        'versions had two separate strips that duplicated metrics; this merges them:',
        body
    ))
    story.append(Spacer(1, 4*mm))

    kpi_meta = [
        ('Ad Spend', '&#8377; spent on the campaign, with CPM &middot; CPC below.'),
        ('Impressions', 'With reach and frequency (how many times each person saw it).'),
        ('Clicks', 'Link clicks that landed in WhatsApp, with CTR.'),
        ('Conversations', 'WhatsApp threads that started. Shows cost per message.'),
        ('Msg Depth 2/3+', 'How many threads had &ge;2 or &ge;3 messages — engaged replies.'),
        ('Orders', 'Paid orders from CTWA leads, with conversion rate.'),
        ('Bookings', 'Dine-in bookings from CTWA, with conversion rate.'),
        ('Revenue', 'GMV from CTWA orders. ROAS and AOV below.'),
        ('Cost / Order', 'Spend &divide; orders. The number to drive down.'),
        ('Engagement', 'Reactions + saves + shares + comments on the ads.'),
    ]
    story.append(labelled_table(kpi_meta, label_w=40, body_w=134))
    story.append(Spacer(1, 6*mm))

    # 5.3 Funnel
    story.append(Paragraph('5.3 &nbsp; WABA funnel stages from D1', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'The five-step funnel, with drop-off percentages between each step. Read from '
        'the D1 <b>wa_sessions</b> + <b>wa_orders</b> + <b>wa_bookings</b> tables:',
        body
    ))
    story.append(Spacer(1, 4*mm))

    funnel_rows = [
        ('Ad Taps', 'Meta-reported link clicks'),
        ('Messaged', 'Taps that actually sent a WhatsApp message'),
        ('Viewed Combos', 'Opened the Meta catalog or got the MPM card'),
        ('Ordered', 'Paid orders completed'),
        ('Booked Table', 'Dine-in bookings confirmed'),
    ]
    story.append(labelled_table(funnel_rows, label_w=40, body_w=134))
    story.append(Spacer(1, 5*mm))

    # 5.4 Per-ad combo performance
    story.append(Paragraph('5.4 &nbsp; Per-ad combo performance', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        '5 ads live, one per combo (Ghee Rice, Kheema, Zafrani etc.). Table shows '
        'each ad\'s impressions / clicks / spend / orders / revenue. Best-performing '
        'row is highlighted green with a left-border accent so the winner is '
        'instantly visible. Fatigue badge ("Cold" / "Hot") per row flags spending '
        'without conversations.',
        body
    ))
    story.append(Spacer(1, 6*mm))

    # 5.5 CTWA vs direct organic
    story.append(Paragraph('5.5 &nbsp; CTWA paid vs direct-organic WhatsApp', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Side-by-side comparison of customers we acquired via paid CTWA vs those '
        'who found us organically (source-tagged as <i>ctwa</i> or <i>organic</i> in '
        '/api/leads). For each group: total customers, orders, revenue, average LTV.',
        body
    ))
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph(
        'The useful number is <b>AOV delta</b> — if CTWA buyers spend less per order '
        'than organic, the creative is pulling discount hunters. If higher, the ad '
        'is attracting the right crowd.',
        body
    ))
    story.append(Spacer(1, 6*mm))

    story.append(Paragraph('Conversation messages feed', h3))
    story.append(Paragraph(
        'Bottom of the cockpit: live feed of inbound WhatsApp messages from CTWA '
        'leads — with badge (ordered / booked / browsing), so Nihaf can spot in '
        'real time whether the ads are bringing in engaged messages or just noise.',
        body
    ))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════
    # SECTION 6 — Audit trail
    # ═══════════════════════════════════════════════════════════
    story.append(section_header('6', 'Audit trail'))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        'Two audit tables. Every change in our marketing system — from a tag on '
        'a lead to a &#8377;500 budget bump — lands in one of them with actor name, '
        'timestamp, before value, and after value. No arguments, no guessing.',
        body
    ))
    story.append(Spacer(1, 6*mm))

    # lead_audit
    story.append(Paragraph('6.1 &nbsp; lead_audit — everything in the leads dashboard', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Every edit in <i>/ops/leads/</i> — assign, stage change, status change, tag '
        'add/remove, note edit, WhatsApp reply sent — writes a row to this table.',
        body
    ))
    story.append(Spacer(1, 4*mm))

    lead_audit_fields = [
        ('wa_id', 'Customer\'s WhatsApp ID (the phone number).'),
        ('actor', 'Who did it — the name from hn_leads_actor.'),
        ('action', 'assign / stage / status / tag_add / tag_remove / note / reply / score.'),
        ('before_val', 'JSON of the previous value.'),
        ('after_val', 'JSON of the new value.'),
        ('ts', 'UTC timestamp of the change.'),
        ('meta', 'Optional extra — e.g. reply body, tag text.'),
    ]
    story.append(labelled_table(lead_audit_fields, label_w=35, body_w=139))
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph(
        '<b>Where to read it:</b> inside any lead, the <b>Audit</b> tab of the Journey '
        'panel. Or query directly: <i>GET /api/leads?action=audit&amp;wa_id=&lt;phone&gt;</i>.',
        body
    ))
    story.append(Spacer(1, 6*mm))

    # ads_control_log
    story.append(Paragraph('6.2 &nbsp; ads_control_log — everything in the ad cockpits', h2))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Every call to <i>/api/ads-control</i> (Google or Meta) writes one row. Every '
        'call to <i>/api/google-recommendations</i> (apply or dismiss) writes one row. '
        'Covers both platforms, all actions.',
        body
    ))
    story.append(Spacer(1, 4*mm))

    ads_fields = [
        ('id', 'Auto-increment primary key.'),
        ('ts', 'UTC timestamp.'),
        ('platform', '<b>google</b> or <b>meta</b>.'),
        ('action', 'pause / resume / budget / bid / negative / status / <b>rec_apply</b> / <b>rec_dismiss</b>.'),
        ('resource_id', 'Campaign ID, ad-set ID, ad-group ID, or recommendation resource name.'),
        ('before_val', 'JSON of the state before the change (or null for creates).'),
        ('after_val', 'JSON of the state after the change.'),
        ('actor', 'Name from ads_control_actor (Nihaf / Basheer / Faheem / System).'),
        ('reason', 'Optional free-text ("budget bump for weekend peak").'),
        ('success', '1 if the API call succeeded, 0 if it failed.'),
        ('error', 'Error message if the API call failed.'),
        ('response', 'Raw JSON response from Meta / Google (truncated to 2000 chars).'),
    ]
    story.append(labelled_table(ads_fields, label_w=35, body_w=139))
    story.append(PageBreak())

    story.append(Paragraph('Where to read it', h3))
    where_rows = [
        ('Google tab', '<i>/api/ads-control?action=log&amp;platform=google&amp;limit=50</i> — a link in the Google cockpit header opens this.'),
        ('Meta tab', '<i>/api/ads-control?action=log&amp;platform=meta&amp;limit=50</i> — link in the CTWA cockpit header.'),
        ('Combined', '<i>/api/ads-control?action=log&amp;limit=100</i> — most recent activity across both platforms.'),
        ('Filter by action', 'Add <i>&amp;action=budget</i> to see only budget changes, etc.'),
    ]
    story.append(labelled_table(where_rows, label_w=40, body_w=134))
    story.append(Spacer(1, 6*mm))

    story.append(Paragraph('How to read one row', h3))
    story.append(Paragraph(
        'Example row from <b>ads_control_log</b>:',
        body
    ))
    story.append(Spacer(1, 2*mm))
    story.append(box(Paragraph(
        '<font name="Courier" size="9">'
        '{<br/>'
        '&nbsp;&nbsp;"id": 412, "ts": "2026-04-17T10:32:11Z",<br/>'
        '&nbsp;&nbsp;"platform": "google", "action": "budget",<br/>'
        '&nbsp;&nbsp;"resourceId": "23748431244",<br/>'
        '&nbsp;&nbsp;"before": { "amountINR": 500 },<br/>'
        '&nbsp;&nbsp;"after":  { "amountINR": 750 },<br/>'
        '&nbsp;&nbsp;"actor": "Nihaf",<br/>'
        '&nbsp;&nbsp;"reason": "friday dinner rush",<br/>'
        '&nbsp;&nbsp;"success": true<br/>'
        '}'
        '</font>',
        S('row', fontSize=9, leading=13, textColor=white)),
        bg=DARK_BG, border=MED, pad=10
    ))
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph(
        'Reads as: "At 10:32 AM UTC on 17 April, Nihaf changed the Google campaign '
        'daily budget from &#8377;500 to &#8377;750 because of the Friday dinner rush. '
        'The API accepted the change." Every field is there so nothing is ambiguous.',
        body
    ))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════
    # SECTION 7 — 72-hour auto-nurture
    # ═══════════════════════════════════════════════════════════
    story.append(section_header('7', '72-hour auto-nurture'))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        'Between the moment a CTWA lead first contacts us and the moment they go '
        'cold (or convert), there is a 72-hour window where we can gently bring '
        'them back. The nurture engine handles this automatically — no manual work '
        'for Basheer\'s team — but it is important to know it exists, because '
        'customers will ask you about messages you didn\'t personally send.',
        body
    ))
    story.append(Spacer(1, 6*mm))

    story.append(Paragraph('How it works', h2))
    nurture_steps = [
        ('1', 'Every hour, a Cloudflare Cron hits <b>GET /api/nurture?action=run</b>.'),
        ('2', 'The engine finds CTWA leads who haven\'t paid yet, haven\'t booked yet, and have a null or low nurture_stage.'),
        ('3', 'For each one, it checks how many hours have passed since their <b>ctwa_first_contact</b>.'),
        ('4', 'It picks the right template based on <b>trigger_hours</b> (24h, 48h, or 71h).'),
        ('5', 'Personalizes the message — replaces <i>{combo}</i> and <i>{ad}</i> with the ad headline the lead originally came from.'),
        ('6', 'Sends the WhatsApp message (text or interactive buttons).'),
        ('7', 'Bumps <b>nurture_stage</b> on the session so we don\'t re-send.'),
    ]
    for n, txt in nurture_steps:
        story.append(mini_step(n, txt, PURPLE))
    story.append(Spacer(1, 6*mm))

    story.append(Paragraph('The 3 templates', h2))
    story.append(Paragraph(
        'Stored in the <b>nurture_templates</b> D1 table. Each has: stage (1/2/3), '
        'trigger_hours, message_text, optional button_1 / button_2, active flag.',
        body
    ))
    story.append(Spacer(1, 3*mm))

    tmpl_list = [
        ('Stage 1 — 24 hours',
         'Gentle reminder. "You showed interest in {combo} yesterday — still want to grab it today?"'),
        ('Stage 2 — 48 hours',
         'Second nudge with a specific hook. E.g. limited-time combo, weekend special.'),
        ('Stage 3 — 71 hours',
         'Final attempt. After 72h the lead is considered cold — no more nurture.'),
    ]
    story.append(labelled_table(tmpl_list, label_w=45, body_w=129))
    story.append(Spacer(1, 6*mm))

    story.append(color_box(
        '&#128161; <b>Customer reply halts nurture.</b> If the lead messages us at any point, '
        'the main whatsapp.js flow picks up the conversation. The nurture engine only '
        'sends automated messages to genuinely silent leads.',
        GOLD, INK, align=TA_LEFT, pad=10, fs=11, bold=False
    ))
    story.append(Spacer(1, 4*mm))

    story.append(color_box(
        '&#128204; <b>Customers marked DND skip nurture entirely.</b> If Basheer marks '
        'someone as DND in the leads dashboard, they will never receive a nurture message. '
        'Respect the setting.',
        BURGUNDY, white, align=TA_LEFT, pad=10, fs=11, bold=False
    ))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════
    # SECTION 8 — Troubleshooting
    # ═══════════════════════════════════════════════════════════
    story.append(section_header('8', 'Troubleshooting'))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 3*mm))

    faqs = [
        ('I can\'t see a lead that just came in',
         'Pull down to refresh, or wait 15 seconds for auto-refresh. Then check your '
         'filters — if you\'re on "Mine" it only shows your assigned leads. Switch to '
         '"All" briefly to confirm the lead exists.'),
        ('I replied but the customer didn\'t get it',
         'Open the lead &rarr; Audit tab. If the reply row shows <b>reply_failed</b>, '
         'it means Meta\'s API rejected the message (usually because the 24-hour '
         'conversation window closed). WhatsApp Nihaf with the wa_id.'),
        ('I clicked Apply on a Google recommendation by mistake',
         'Check <i>/api/ads-control?action=log&amp;platform=google</i> — find the '
         '<b>rec_apply</b> row with your actor name. WhatsApp Nihaf with the '
         'resource_name and he can reverse it from the Google Ads UI.'),
        ('I paused the campaign by mistake',
         'Just click Resume on the same strip. Both actions are instant. Both are logged.'),
        ('My "Acting as" name reset to default',
         'Clear website data for hamzaexpress.in, or tap your name in the top-right '
         'corner and re-pick. It will ask again.'),
        ('The KPI numbers look stale',
         'Meta and Google APIs cache for up to 60 seconds. Hard-refresh the page. '
         'If still stale after 5 minutes, WhatsApp Nihaf — it may be a rate-limit.'),
        ('A customer asked me to stop contacting them',
         'Set status to <b>DND</b> on their lead. They stop getting nurture messages. '
         'Respect it. If they open a new thread on their own, you can still reply.'),
        ('What\'s the difference between stage and status?',
         '<b>Stage</b> = where in the funnel (auto-updates from WhatsApp events). '
         '<b>Status</b> = your human judgement (hot/warm/cold/DND). You set it.'),
        ('Something is broken / I don\'t know what to do',
         'WhatsApp Nihaf with: a screenshot, the time it happened, and the customer\'s '
         'phone number (if a specific lead). Don\'t click around to "fix" it — every '
         'click is logged and makes debugging harder.'),
    ]
    for q, a in faqs:
        story.append(Paragraph(f'<b>Q: {q}</b>', h3))
        story.append(Paragraph(f'<b>A:</b> {a}', body))
        story.append(Spacer(1, 3*mm))

    story.append(Spacer(1, 4*mm))

    # Contact card
    story.append(Paragraph('Who to call', h2))
    contact_rows = [
        ('Nihaf (MD)',
         'WhatsApp: 8008002049 &bull; Escalate anything broken, any surprise spend, any suspicious lead.'),
        ('Leads dashboard', '<i>hamzaexpress.in/ops/leads/</i>'),
        ('Google cockpit', '<i>hamzaexpress.in/ops/google-cockpit/</i>'),
        ('CTWA cockpit', '<i>hamzaexpress.in/ops/ctwa-cockpit/</i>'),
        ('Bookings dashboard', '<i>hamzaexpress.in/ops/bookings/</i>'),
        ('Audit log (Google)', '<i>/api/ads-control?action=log&amp;platform=google&amp;limit=50</i>'),
        ('Audit log (Meta)', '<i>/api/ads-control?action=log&amp;platform=meta&amp;limit=50</i>'),
    ]
    story.append(labelled_table(contact_rows, label_w=45, body_w=129))
    story.append(PageBreak())

    # ─── CLOSING ─────────────────────────────────────────────
    story.append(Spacer(1, 40*mm))
    story.append(Paragraph('One number that matters', h1))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 6*mm))

    story.append(color_box(
        'Payment pending &rarr; Ordered conversion rate.<br/><br/>'
        'We lose most leads at the payment card. If Basheer + Faheem move this from '
        '<b>20%</b> to <b>40%</b>, we double our ad ROI without spending one extra rupee. '
        'Nihaf\'s job is to keep the spend efficient. The team\'s job is to close.<br/><br/>'
        'That is the game.',
        BURGUNDY, white, align=TA_CENTER, pad=18, fs=13, bold=False
    ))
    story.append(Spacer(1, 15*mm))

    story.append(Paragraph(
        '<font color="#64748b">Questions? Voice note to Nihaf. Suggestions? Also voice note. '
        'We improve this system every week.</font>',
        S('cl', fontSize=10, leading=13, textColor=MUTE, alignment=TA_CENTER)
    ))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        '<font color="#C9A96E"><b>Hamza Express &middot; Est. 1918 &middot; Let\'s go.</b></font>',
        S('cl2', fontSize=11, leading=14, textColor=GOLD, alignment=TA_CENTER)
    ))

    # ─── BUILD ───────────────────────────────────────────────
    def first_page(canvas, doc):
        cover_bg(canvas, doc)
    def later_pages(canvas, doc):
        footer(canvas, doc)

    doc.build(story, onFirstPage=first_page, onLaterPages=later_pages)
    print(f'[ok] Wrote {OUT}')
    print(f'     Size: {os.path.getsize(OUT) / 1024:.1f} KB')

if __name__ == '__main__':
    build()
