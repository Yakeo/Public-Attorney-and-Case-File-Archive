"""Generate synthetic OCR fixtures, never real client material.
Requires Pillow and reportlab. Usage: python scripts/make_ocr_fixtures.py
Outputs are ignored under .cache/e2e/fixtures.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas

out = Path(__file__).resolve().parents[1] / '.cache/e2e/fixtures'
out.mkdir(parents=True, exist_ok=True)
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 45)
lines = ['SYNTHETIC LEGAL TEST DOCUMENT', 'Case reference ALPHA 7426',
         'The hearing is scheduled on 17 November 2026.',
         'This fictional affidavit is for software testing only.',
         'No real client information appears in this document.']
image = Image.new('RGB', (1900, 1100), 'white')
draw = ImageDraw.Draw(image)
for i, line in enumerate(lines):
    draw.text((90, 100 + i * 140), line, font=font, fill='black')
for name, fmt in [('clear.png', 'PNG'), ('clear.jpg', 'JPEG'), ('clear.tiff', 'TIFF')]:
    image.save(out / name, fmt)
blank = Image.new('RGB', (1900, 1100), 'white')
blank.save(out / 'blank.png')
pdf = canvas.Canvas(str(out / 'scanned.pdf'), pagesize=(950, 550))
pdf.drawImage(str(out / 'clear.png'), 0, 0, width=950, height=550)
pdf.showPage()
second = image.copy()
ImageDraw.Draw(second).rectangle((0, 0, 1900, 1100), fill='white')
ImageDraw.Draw(second).text((90, 150), 'SECOND SCANNED PAGE BETA 7427', font=font, fill='black')
second.save(out / 'page-two.png')
pdf.drawImage(str(out / 'page-two.png'), 0, 0, width=950, height=550)
pdf.save()
pdf = canvas.Canvas(str(out / 'text.pdf'))
for i, line in enumerate(lines):
    pdf.drawString(40, 780 - i * 30, line)
pdf.save()
(out / 'corrupt.pdf').write_bytes(b'%PDF-1.4\nintentionally broken synthetic fixture')
(out / 'unsupported.txt').write_text('Unsupported synthetic file')
print(out)
