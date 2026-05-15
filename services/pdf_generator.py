from io import BytesIO
import json
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from database.models import CarbonCredit

def generate_certificate_pdf(credit: CarbonCredit) -> BytesIO:
    """Generates a professional PDF Certificate of Carbon Sequestration."""
    buffer = BytesIO()
    
    # Set up the document
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=A4,
        rightMargin=40, leftMargin=40,
        topMargin=40, bottomMargin=40
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'TitleStyle', parent=styles['Heading1'],
        fontName='Helvetica-Bold', fontSize=22, spaceAfter=20,
        textColor=colors.HexColor('#2E8B57'), alignment=1
    )
    subtitle_style = ParagraphStyle(
        'SubtitleStyle', parent=styles['Heading2'],
        fontName='Helvetica-Bold', fontSize=14, spaceAfter=15,
        textColor=colors.HexColor('#333333'), alignment=1
    )
    normal_style = styles['Normal']
    normal_style.fontName = 'Helvetica'
    normal_style.fontSize = 10
    
    # Header
    elements.append(Paragraph("CarbonEngine Platform", subtitle_style))
    elements.append(Paragraph("CERTIFICATE OF CARBON SEQUESTRATION", title_style))
    elements.append(Spacer(1, 10))
    
    # Intro
    intro_text = "This certificate guarantees the verification and minting of a digital carbon asset backed by satellite telemetry and cryptographic proof."
    elements.append(Paragraph(intro_text, normal_style))
    elements.append(Spacer(1, 20))
    
    # Main details
    data = [
        ["Certificate ID:", credit.unique_code],
        ["Parcel ID:", str(credit.parcel_id)],
        ["Vintage Year:", credit.vintage_year],
        ["Status:", credit.status.value],
        ["Estimated CO2e:", f"{credit.estimated_co2e:.2f} Tonnes"],
    ]
    
    t = Table(data, colWidths=[120, 350])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8F9FA')),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#2E8B57')),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E9ECEF')),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 20))
    
    # Cryptographic Hash & Scientific details
    elements.append(Paragraph("Cryptographic Fingerprint & Payload", subtitle_style))
    hash_text = f"<b>Data Hash (SHA-256):</b><br/>{credit.data_hash}"
    elements.append(Paragraph(hash_text, normal_style))
    elements.append(Spacer(1, 10))
    
    payload_str = json.dumps(credit.raw_payload, indent=2) if credit.raw_payload else "{}"
    # Truncate payload if it's too long (e.g. huge polygons)
    if len(payload_str) > 1000:
        payload_str = payload_str[:1000] + "\n... [truncated]"
        
    payload_style = ParagraphStyle(
        'PayloadStyle', parent=normal_style,
        fontName='Courier', fontSize=8,
        textColor=colors.HexColor('#555555'),
        backColor=colors.HexColor('#F4F4F4'),
        borderPadding=10
    )
    elements.append(Paragraph(payload_str.replace('\n', '<br/>').replace(' ', '&nbsp;'), payload_style))
    elements.append(Spacer(1, 30))
    
    # Footer
    footer_text = "Verified via Google Earth Engine Sensor Fusion (Sentinel-1 & Sentinel-2)."
    elements.append(Paragraph(footer_text, ParagraphStyle('Footer', parent=normal_style, alignment=1, textColor=colors.gray)))
    
    # Build
    doc.build(elements)
    
    buffer.seek(0)
    return buffer
