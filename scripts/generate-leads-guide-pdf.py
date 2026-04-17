#!/usr/bin/env python3
"""
Leads Dashboard — Daily Playbook (for Basheer, Faheem, Mumtaz)
Generates a simple visual guide.

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

# ── Page decorations ──────────────────────────────────────────────────
def footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(MUTE)
    canvas.setFont('Helvetica', 8)
    canvas.drawString(18*mm, 10*mm, 'Hamza Express — Leads Dashboard Playbook')
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
        title='Leads Dashboard — Playbook',
        author='Hamza Express',
    )

    story = []

    # ─── COVER ────────────────────────────────────────────────
    story.append(Spacer(1, 55*mm))
    story.append(Paragraph(
        '<font color="#C9A96E">HAMZA EXPRESS</font>',
        S('cv', fontSize=14, leading=18, fontName='Helvetica-Bold',
          textColor=GOLD, alignment=TA_CENTER)
    ))
    story.append(Spacer(1, 30*mm))
    story.append(Paragraph(
        '<font color="white">Leads Dashboard</font>',
        S('cv2', fontSize=44, leading=50, fontName='Helvetica-Bold',
          textColor=white, alignment=TA_CENTER)
    ))
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph(
        '<font color="#C9A96E">Daily Playbook</font>',
        S('cv3', fontSize=24, leading=28, fontName='Helvetica',
          textColor=GOLD, alignment=TA_CENTER)
    ))
    story.append(Spacer(1, 35*mm))
    story.append(Paragraph(
        '<font color="white">For Basheer, Faheem &amp; Mumtaz</font>',
        S('cv4', fontSize=13, leading=16, textColor=white, alignment=TA_CENTER)
    ))
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph(
        '<font color="#C9A96E">How to turn WhatsApp leads into orders and bookings</font>',
        S('cv5', fontSize=11, leading=14, textColor=GOLD, alignment=TA_CENTER)
    ))
    story.append(PageBreak())

    # ─── WHY THIS EXISTS ──────────────────────────────────────
    story.append(Paragraph('Why this dashboard matters', h1))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        'Every day Hamza Express spends money on Meta ads and Google ads to bring '
        'new people to our WhatsApp. Every scan of a station QR also creates a lead. '
        'If we do nothing with these leads, the money is wasted.',
        body
    ))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        '<b>This dashboard is where we convert.</b> It shows every person who '
        'messaged us, where they came from, what stage they are in, and what to '
        'do next.',
        body
    ))
    story.append(Spacer(1, 6*mm))

    # Roles
    story.append(Paragraph('Who does what', h2))
    roles_data = [
        [Paragraph('<b>Nihaf</b>', body_b), Paragraph('Sets up campaigns from office. Controls ad spend, budgets, pausing, targeting. Gets your optimisation notes.', body)],
        [Paragraph('<b>Basheer</b>', body_b), Paragraph('Owns sales &amp; marketing on-site. Triages every new lead. Replies on WhatsApp. Reports patterns back to Nihaf.', body)],
        [Paragraph('<b>Faheem</b>', body_b), Paragraph('Executes with Basheer — follow-ups, calls, tagging leads, bulk sweeps.', body)],
        [Paragraph('<b>Mumtaz</b>', body_b), Paragraph('Handles dine-in conversions — calls booking drops, confirms table bookings. Leads dashboard is a secondary tool for him.', body)],
    ]
    t = Table(roles_data, colWidths=[25*mm, 149*mm])
    t.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('BACKGROUND',(0,0),(0,-1), LIGHT),
        ('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),
        ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
        ('LINEBELOW',(0,0),(-1,-2),0.3, MED),
    ]))
    story.append(t)
    story.append(Spacer(1, 6*mm))

    # ─── ROLE BOUNDARY (explicit) ─────────────────────────────
    story.append(Paragraph('What you control vs what Nihaf controls', h2))
    story.append(Spacer(1, 2*mm))
    boundary_rows = [
        [Paragraph('<b>&#9989; &nbsp; You (Basheer &amp; Faheem) have full flexibility over:</b>',
                   S('bdy', fontSize=10, leading=13, textColor=GREEN, fontName='Helvetica-Bold')),
         Paragraph('<b>&#10060; &nbsp; You do NOT touch:</b>',
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
        '<b>The deal:</b> Nihaf owns the ad budget &amp; campaign decisions. You own every lead '
        'that walks through the door once it arrives. Full flexibility inside the leads '
        'dashboard — no flexibility on the ad platforms. Keeps the spend predictable and '
        'puts the conversion work in your hands.',
        BURGUNDY, white, align=TA_LEFT, pad=10, fs=10, bold=False
    ))
    story.append(Spacer(1, 5*mm))

    story.append(color_box(
        '&#9997; Rule of thumb: if a lead is stuck for more than 30 minutes with no action, '
        'it becomes cold. Be fast.',
        BURGUNDY, white, align=TA_LEFT, pad=10, fs=11, bold=False
    ))
    story.append(PageBreak())

    # ─── STEP 1: OPEN ────────────────────────────────────────
    story.append(Paragraph('Getting started', h1))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 2*mm))

    story.append(step(
        '1', 'Open the dashboard',
        'On your phone or laptop, open Chrome and go to:<br/>'
        '<font name="Helvetica-Bold" size="13" color="#3D1610">hamzaexpress.in/ops/leads/</font><br/><br/>'
        'Add this to your home screen so you can open it with one tap. '
        'It works on mobile, tablet and computer.'
    ))

    story.append(step(
        '2', 'Pick your name — one time only',
        'The first time you open, a small box will ask "Who are you?". '
        'Tap your name: <b>Basheer</b>, <b>Faheem</b>, <b>Mumtaz</b>, or <b>Nihaf</b>. '
        'This is important because every change you make is saved with your name. '
        'We can see later who did what. If you use a different phone, pick again.'
    ))

    story.append(step(
        '3', 'Look at the 4 big numbers on top',
        'These update every 30 seconds:'
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

    # ─── READING A LEAD CARD ─────────────────────────────────
    story.append(Paragraph('Reading a lead card', h1))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Each person who messaged us is one card. Here is what every part means:',
        body
    ))
    story.append(Spacer(1, 4*mm))

    # Mock lead card
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
        '<i>"Called at 3:15, asked for ₹50 discount. Said will pay in 10 min."</i>',
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

    # What each part means
    explain = [
        [Paragraph('<b>Name &amp; phone</b>', body_b), Paragraph('Who this person is. Phone is auto-filled from WhatsApp.', body)],
        [Paragraph('<b>Orange stripe on left</b>', body_b), Paragraph('Where they came from. The colour tells you the source — see next page.', body)],
        [Paragraph('<b>Stage badge</b>', body_b), Paragraph('Where they are in the funnel right now (new &rarr; ordered).', body)],
        [Paragraph('<b>Pink tag chips</b>', body_b), Paragraph('Labels you add — e.g. "hot", "called", "angry", "needs-discount".', body)],
        [Paragraph('<b>Score</b>', body_b), Paragraph('0 to 100. Higher = more likely to convert. Turns orange at 60+.', body)],
        [Paragraph('<b>Note line</b>', body_b), Paragraph('Last note you typed — shown so team knows context instantly.', body)],
    ]
    t = Table(explain, colWidths=[40*mm, 134*mm])
    t.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),
        ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LINEBELOW',(0,0),(-1,-2),0.3, MED),
    ]))
    story.append(t)
    story.append(PageBreak())

    # ─── STAGES ──────────────────────────────────────────────
    story.append(Paragraph('The 7 funnel stages', h1))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Every lead moves through these stages. The system auto-sets the stage, '
        'but you can change it when you know more.',
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

    # ─── SOURCES ─────────────────────────────────────────────
    story.append(Paragraph('Where leads come from', h1))
    story.append(hr(BURGUNDY, 1, 4))
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
    story.append(PageBreak())

    # ─── DAILY WORKFLOW ──────────────────────────────────────
    story.append(Paragraph('Your daily workflow', h1))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph('BASHEER &amp; FAHEEM — every 2 hours during shop hours', h2))
    bf_steps = [
        ('1', 'Open dashboard &rarr; tap <b>"Mine"</b> button.'),
        ('2', 'Scroll through your assigned leads in <b>PAYMENT PENDING</b> first — these are most urgent.'),
        ('3', 'For each one, tap the card &rarr; read the conversation in the Journey panel on the right.'),
        ('4', 'Decide: call them? Send a quick WhatsApp? Add a discount? Add a note explaining what you did.'),
        ('5', 'Change <b>Status</b> to Hot / Warm / Cold based on how the conversation went.'),
        ('6', 'Add tags like <b>"called"</b>, <b>"discount-needed"</b>, <b>"no-answer"</b> so Nihaf sees patterns.'),
        ('7', 'At end of shift, check the <b>"Stuck in payment"</b> segment — clean up anything older than 1 hour.'),
    ]
    for n, txt in bf_steps:
        n_p = Paragraph(f'<b>{n}</b>', S('n', fontSize=14, leading=16, fontName='Helvetica-Bold',
                                            textColor=BURGUNDY, alignment=TA_CENTER))
        txt_p = Paragraph(txt, body)
        r = Table([[n_p, txt_p]], colWidths=[9*mm, 165*mm])
        r.setStyle(TableStyle([
            ('VALIGN',(0,0),(-1,-1),'TOP'),
            ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),
            ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
        ]))
        story.append(r)
    story.append(Spacer(1, 6*mm))

    story.append(Paragraph('MUMTAZ — every 30 minutes', h2))
    mum_steps = [
        ('1', 'Open dashboard &rarr; in the segment dropdown pick <b>"Booking drops"</b>.'),
        ('2', 'Call each person on the list. Introduce yourself: "Hi, this is Mumtaz from Hamza Express..."'),
        ('3', 'If they confirm a booking time, change the stage manually to <b>BOOKED</b>.'),
        ('4', 'If not interested, add tag <b>"not-interested"</b> and change status to <b>Cold</b>.'),
        ('5', 'Write a note with the date/time they chose so kitchen is ready.'),
    ]
    for n, txt in mum_steps:
        n_p = Paragraph(f'<b>{n}</b>', S('n', fontSize=14, leading=16, fontName='Helvetica-Bold',
                                            textColor=PURPLE, alignment=TA_CENTER))
        txt_p = Paragraph(txt, body)
        r = Table([[n_p, txt_p]], colWidths=[9*mm, 165*mm])
        r.setStyle(TableStyle([
            ('VALIGN',(0,0),(-1,-1),'TOP'),
            ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),
            ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
        ]))
        story.append(r)
    story.append(PageBreak())

    # ─── WHAT YOU CAN DO ON A LEAD ───────────────────────────
    story.append(Paragraph('What you can change on a lead', h1))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Tap a lead card to open the details. You can change these fields — '
        'each change is saved with your name and timestamp:',
        body
    ))
    story.append(Spacer(1, 4*mm))

    actions = [
        ('Assign to someone',
         'Use the <b>Assignee</b> dropdown. Pick Basheer, Faheem, Mumtaz, or Nihaf. '
         'The person you pick will see it in their "Mine" queue.'),
        ('Change the stage',
         'Override the auto-detected stage. Use when you know better — e.g. you '
         'called them and they confirmed they\'ll pay later, move to PAYMENT PENDING manually.'),
        ('Set the status',
         'HOT / WARM / COLD / DND. <b>DND</b> means "do not disturb" — they told us to stop. '
         'These people won\'t get follow-up messages.'),
        ('Add tags',
         'Click <b>+ tag</b> &rarr; type short labels like "called", "no-answer", '
         '"asked-discount". Click the × on any tag to remove it.'),
        ('Set a score (0–100)',
         'Quick gut rating. Turns orange at 60+. Helps you sort by who\'s most likely to buy.'),
        ('Write a note',
         'Plain text. Write what you did — "called at 3pm, said will come Friday". '
         'The whole team sees it next time they open the lead.'),
    ]
    for title, desc in actions:
        story.append(Paragraph(f'<b>&#9632; {title}</b>', h3))
        story.append(Paragraph(desc, body))
        story.append(Spacer(1, 3*mm))

    story.append(Spacer(1, 2*mm))
    story.append(color_box(
        '&#128221; Every change is logged. Open the <b>Audit</b> tab inside a lead to see '
        'exactly who changed what, and when. No arguments about "I didn\'t do that".',
        BURGUNDY, white, align=TA_LEFT, pad=10, fs=11, bold=False
    ))
    story.append(PageBreak())

    # ─── WAVE 2.4 — REPLY ON WHATSAPP FROM THE DASHBOARD ─────
    story.append(Paragraph('Reply on WhatsApp — without leaving the dashboard', h1))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        'This is the biggest time-saver. Before, you had to open WhatsApp Web, '
        'search for the customer, type a reply, then come back here and add a note. '
        'Now everything happens in one screen.',
        body
    ))
    story.append(Spacer(1, 4*mm))

    # Visual mock of the reply box
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

    story.append(Paragraph('How to use it', h2))
    reply_steps = [
        ('1', 'Click any lead card &rarr; the Journey panel slides up &rarr; you land on the <b>Conversation</b> tab.'),
        ('2', 'Scroll down past the last message. You\'ll see a text box and a green <b>Send</b> button.'),
        ('3', 'Type your reply in natural language. Urdu, Hindi, English — all work.'),
        ('4', 'Press <b>Cmd+Enter</b> (Mac) or <b>Ctrl+Enter</b> (Windows) to send fast. Or just click Send.'),
        ('5', 'Your message appears instantly in the conversation with the label <b>"Staff &middot; Basheer"</b> (or whoever you are). The customer sees it on their WhatsApp exactly like any other message from us.'),
    ]
    for n, txt in reply_steps:
        n_p = Paragraph(f'<b>{n}</b>', S('n', fontSize=14, leading=16, fontName='Helvetica-Bold',
                                            textColor=BURGUNDY, alignment=TA_CENTER))
        txt_p = Paragraph(txt, body)
        r = Table([[n_p, txt_p]], colWidths=[9*mm, 165*mm])
        r.setStyle(TableStyle([
            ('VALIGN',(0,0),(-1,-1),'TOP'),
            ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),
            ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
        ]))
        story.append(r)
    story.append(Spacer(1, 5*mm))

    # Quick templates
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

    # ─── WAVE 2.5 — BULK ACTIONS ──────────────────────────────
    story.append(Paragraph('Work on many leads at once (bulk actions)', h1))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        'When 20 CTWA leads arrive in one evening, you don\'t need to open each card '
        'and change the assignee one by one. Select them all, apply the change once.',
        body
    ))
    story.append(Spacer(1, 5*mm))

    # Visual: bulk bar mock
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

    story.append(Paragraph('How to use it', h2))
    bulk_steps = [
        ('1', 'Every lead card now has a <b>small checkbox on the top-left corner</b>. Tick the ones you want to work on.'),
        ('2', 'As soon as you tick even one card, an orange bar slides in at the top of the screen. It says <b>"X selected"</b>.'),
        ('3', 'Use any of the dropdowns in that bar: <b>Assign &rarr;</b> pick a person. <b>Status &rarr;</b> pick new/called/interested/DND. <b>Stage &rarr;</b> change the funnel stage.'),
        ('4', 'The change is applied to <b>every ticked lead</b> in one go. You get a popup "Set assignee = faheem for 3 leads?" — click OK.'),
        ('5', 'You see a green toast: <b>"assignee &rarr; faheem — 3/3"</b>. Done.'),
        ('6', 'Use <b>+ Tag</b> to add the same tag to all selected (existing tags are kept). Use <b>+ Note</b> to append a timestamped note to all selected.'),
        ('7', 'Use <b>Clear</b> to deselect everyone. Or tick the "Select all visible" box at the top to grab the whole filtered list.'),
    ]
    for n, txt in bulk_steps:
        n_p = Paragraph(f'<b>{n}</b>', S('n', fontSize=14, leading=16, fontName='Helvetica-Bold',
                                            textColor=ORANGE, alignment=TA_CENTER))
        txt_p = Paragraph(txt, body)
        r = Table([[n_p, txt_p]], colWidths=[9*mm, 165*mm])
        r.setStyle(TableStyle([
            ('VALIGN',(0,0),(-1,-1),'TOP'),
            ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),
            ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
        ]))
        story.append(r)
    story.append(Spacer(1, 5*mm))

    # Common workflows
    story.append(Paragraph('3 workflows where this saves 20 minutes', h2))
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
        'you change a filter, your tickmarks stay. The bulk bar will still be there. '
        'Only <b>Clear</b> or reloading the whole page wipes it.',
        GOLD, INK, align=TA_LEFT, pad=10, fs=11, bold=False
    ))
    story.append(PageBreak())

    # ─── SEGMENTS ────────────────────────────────────────────
    story.append(Paragraph('Ready-made lists (segments)', h1))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'Instead of scrolling through all 127 leads, use these pre-built filters. '
        'They are already saved for you:',
        body
    ))
    story.append(Spacer(1, 4*mm))

    segs = [
        ('&#128293; Hot CTWA leads', 'People who clicked a Meta ad, in payment pending. Call first.', ORANGE),
        ('&#9888;&#65039; Stuck in payment', 'Got payment card but didn\'t pay in the last hour. Rescue these.', RED),
        ('&#128197; Booking drops', 'Tried to book dine-in, didn\'t finish. <b>Mumtaz queue</b>.', PURPLE),
        ('&#11088; VIP 3+ orders', 'Regulars. Send them a "thank you" note once a month.', GOLD),
        ('&#10052;&#65039; Cold but warm', 'Ordered once long ago, silent now. Nudge with a combo offer.', BLUE),
        ('&#10067; Unassigned', 'Nobody is working these yet. Basheer: assign them out.', MUTE),
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

    # ─── JOURNEY PANEL ───────────────────────────────────────
    story.append(Paragraph('Reading the Journey panel (right side)', h1))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        'When you click a lead, the right side of the screen opens. It has 3 tabs:',
        body
    ))
    story.append(Spacer(1, 4*mm))

    tabs_data = [
        [Paragraph('<b>Conversation</b>', body_b),
         Paragraph('Every WhatsApp message between us and the customer. Read this '
                   'before you call — you\'ll know their name, what they ordered, '
                   'where they got stuck.', body)],
        [Paragraph('<b>Orders &middot; Bookings</b>', body_b),
         Paragraph('List of all past orders (paid, cancelled, failed) and all '
                   'dine-in bookings. Shows money spent and last visit.', body)],
        [Paragraph('<b>Audit</b>', body_b),
         Paragraph('Full history of edits. "Basheer changed status new &rarr; hot '
                   'at 3:42 PM". This is the accountability layer.', body)],
    ]
    t = Table(tabs_data, colWidths=[40*mm, 134*mm])
    t.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('BACKGROUND',(0,0),(0,-1), LIGHT),
        ('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),
        ('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),
        ('LINEBELOW',(0,0),(-1,-2),0.3, MED),
    ]))
    story.append(t)
    story.append(Spacer(1, 8*mm))

    story.append(color_box(
        '&#128161; TIP — always read the Conversation tab before calling. If the customer '
        'already asked for a discount 2 hours ago and you don\'t mention it, they will '
        'feel unheard.',
        GOLD, INK, align=TA_LEFT, pad=10, fs=11, bold=False
    ))
    story.append(PageBreak())

    # ─── DAILY CHECKLIST ─────────────────────────────────────
    story.append(Paragraph('Daily checklist', h1))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph('Morning (12:00 PM shop open)', h2))
    morning = [
        'Open dashboard, check total leads count vs yesterday',
        'Check "Stuck in payment" — any leftovers from last night?',
        'Basheer: assign any "Unassigned" leads to Faheem or yourself',
        'Read Mumtaz\'s overnight notes on booking drops',
    ]
    for item in morning:
        story.append(Paragraph(f'&#9634; &nbsp; {item}', body))
        story.append(Spacer(1, 1*mm))

    story.append(Spacer(1, 5*mm))
    story.append(Paragraph('During the day (every 2 hrs)', h2))
    during = [
        'Open "Mine" — clear anything in PAYMENT PENDING',
        'Open "Hot CTWA leads" — call at least 5 of them',
        'Mumtaz: clear "Booking drops" queue every 30 min',
        'Add tags &amp; notes on every touchpoint',
    ]
    for item in during:
        story.append(Paragraph(f'&#9634; &nbsp; {item}', body))
        story.append(Spacer(1, 1*mm))

    story.append(Spacer(1, 5*mm))
    story.append(Paragraph('Evening (before closing)', h2))
    evening = [
        'Review today\'s total conversions in the "Ordered" stage',
        'Tag today\'s VIP orders (3+ lifetime) with <b>"vip"</b>',
        'Basheer: send WhatsApp voice note to Nihaf with 3 patterns you saw today',
        'Mark any DND requests — customers who asked us to stop',
    ]
    for item in evening:
        story.append(Paragraph(f'&#9634; &nbsp; {item}', body))
        story.append(Spacer(1, 1*mm))

    story.append(PageBreak())

    # ─── FAQ ─────────────────────────────────────────────────
    story.append(Paragraph('Common questions', h1))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 3*mm))

    faqs = [
        ('What if I click the wrong thing?',
         'Don\'t worry. Every change is in the Audit log. Just change it back. The person '
         'who did it is recorded, no one gets in trouble for mistakes.'),
        ('Can I work on the same lead as Faheem at the same time?',
         'Yes but you\'ll overwrite each other\'s changes. Better: use <b>Assignee</b> — '
         'once a lead has an owner, others skip it.'),
        ('A lead stopped replying — what do I do?',
         'Add tag <b>"silent"</b> and change status to <b>Warm</b> (not cold). They might '
         'come back tomorrow. If silent for 7 days, set status to <b>Cold</b>.'),
        ('Customer asked me to stop contacting them.',
         'Set status to <b>DND</b>. System will not send any nurture messages. Respect it.'),
        ('Where do I see how much Nihaf spent on the lead?',
         'The ad info shows at the top of the lead — ad name and campaign. Cost per lead is '
         'on the CTWA Cockpit page, not here.'),
        ('My phone doesn\'t show me as the actor anymore.',
         'Clear website data for hamzaexpress.in, or tap your name in the top-right corner '
         'and re-pick. It will ask again.'),
        ('What\'s the difference between stage and status?',
         '<b>Stage</b> = where in the funnel (new/engaged/booked/ordered). Auto-updates. '
         '<b>Status</b> = your judgement (hot/warm/cold/DND). You set it.'),
        ('I see a lead with "0 orders" but tag "vip". Fix it?',
         'No — they may have a pending order. Sync runs every few minutes. If wrong after '
         '30 min, tell Nihaf.'),
    ]
    for q, a in faqs:
        story.append(Paragraph(f'<b>Q: {q}</b>', h3))
        story.append(Paragraph(f'<b>A:</b> {a}', body))
        story.append(Spacer(1, 4*mm))

    story.append(PageBreak())

    # ─── CLOSING ─────────────────────────────────────────────
    story.append(Spacer(1, 40*mm))
    story.append(Paragraph('One number that matters', h1))
    story.append(hr(BURGUNDY, 1, 4))
    story.append(Spacer(1, 6*mm))

    story.append(color_box(
        'Payment pending &rarr; Ordered conversion rate.<br/><br/>'
        'Right now we lose most leads at the payment card. If Basheer + Faheem get this from '
        '<b>20%</b> to <b>40%</b>, we double our ad ROI without spending one extra rupee.<br/><br/>'
        'That is the game.',
        BURGUNDY, white, align=TA_CENTER, pad=18, fs=13, bold=False
    ))
    story.append(Spacer(1, 15*mm))

    story.append(Paragraph(
        '<font color="#64748b">Questions? Voice note to Nihaf. Suggestions? Also voice note. '
        'We improve this dashboard every week.</font>',
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
    print(f'✓ Wrote {OUT}')
    print(f'  Size: {os.path.getsize(OUT) / 1024:.1f} KB')

if __name__ == '__main__':
    build()
