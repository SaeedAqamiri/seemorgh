# -*- coding: utf-8 -*-
import os
from datetime import datetime
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from PIL import Image

ROOT = "/home/arman/seemorgh"
SHOTS = os.path.join(ROOT, "reports", "screenshots")
PROC = os.path.join(SHOTS, "_report")
os.makedirs(PROC, exist_ok=True)
OUT = os.path.join(ROOT, "reports", "گزارش_تست_سیمرغ.docx")

GREEN = RGBColor(0x1F, 0x6F, 0x4A)
RED = RGBColor(0xB4, 0x23, 0x18)
AMBER = RGBColor(0x9A, 0x67, 0x00)
GRAY = RGBColor(0x55, 0x55, 0x55)
BLUE = RGBColor(0x1F, 0x3A, 0x5F)


def set_run_fa(run, size=11, bold=False, color=None, font="Vazirmatn"):
    run.font.name = font
    run.font.size = Pt(size)
    run.bold = bold
    if color is not None:
        run.font.color.rgb = color
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.append(rFonts)
    rFonts.set(qn("w:ascii"), font)
    rFonts.set(qn("w:hAnsi"), font)
    rFonts.set(qn("w:eastAsia"), font)
    rFonts.set(qn("w:cs"), font)
    rtl = OxmlElement("w:rtl")
    rPr.append(rtl)


def set_para_rtl(p, align=WD_ALIGN_PARAGRAPH.RIGHT):
    p.alignment = align
    pPr = p._p.get_or_add_pPr()
    bidi = OxmlElement("w:bidi")
    pPr.append(bidi)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.25


def add_p(doc, text="", size=11, bold=False, color=None, align=WD_ALIGN_PARAGRAPH.RIGHT, space_after=4):
    p = doc.add_paragraph()
    set_para_rtl(p, align)
    p.paragraph_format.space_after = Pt(space_after)
    r = p.add_run(text)
    set_run_fa(r, size=size, bold=bold, color=color)
    return p


def add_heading(doc, text, level=1, color=BLUE):
    p = doc.add_paragraph()
    set_para_rtl(p)
    p.paragraph_format.space_before = Pt(10 if level == 1 else 6)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(text)
    set_run_fa(r, size=(17 if level == 1 else 13 if level == 2 else 11.5), bold=True, color=color)
    if level == 1:
        pPr = p._p.get_or_add_pPr()
        pBdr = OxmlElement("w:pBdr")
        bottom = OxmlElement("w:bottom")
        bottom.set(qn("w:val"), "single")
        bottom.set(qn("w:sz"), "8")
        bottom.set(qn("w:space"), "2")
        bottom.set(qn("w:color"), "1F6F4A")
        pBdr.append(bottom)
        pPr.append(pBdr)
    return p


def add_bullets(doc, items, size=11):
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        set_para_rtl(p)
        p.paragraph_format.space_after = Pt(2)
        r = p.add_run(item)
        set_run_fa(r, size=size)


def add_code(doc, text):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(text)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    r.font.color.rgb = GRAY


def shade(cell, hexcolor):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hexcolor)
    tcPr.append(shd)


def set_cell_text(cell, text, bold=False, color=None, size=9.5, align=WD_ALIGN_PARAGRAPH.RIGHT):
    cell.text = ""
    p = cell.paragraphs[0]
    set_para_rtl(p, align)
    p.paragraph_format.space_after = Pt(1)
    r = p.add_run(str(text))
    set_run_fa(r, size=size, bold=bold, color=color)


def add_table(doc, headers, rows, widths=None, header_fill="1F6F4A", size=9.5):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    tblPr = table._tbl.tblPr
    bidi = OxmlElement("w:bidiVisual")
    tblPr.append(bidi)
    hdr = table.rows[0].cells
    for i, h in enumerate(headers):
        set_cell_text(hdr[i], h, bold=True, color=RGBColor(0xFF, 0xFF, 0xFF), size=size, align=WD_ALIGN_PARAGRAPH.CENTER)
        shade(hdr[i], header_fill)
    for row in rows:
        cells = table.add_row().cells
        for i, value in enumerate(row):
            color = None
            if isinstance(value, tuple):
                value, color = value
            set_cell_text(cells[i], value, color=color, size=size)
    if widths:
        for i, w in enumerate(widths):
            for row in table.rows:
                row.cells[i].width = Inches(w)
    doc.add_paragraph()
    return table


def fig(doc, filename, caption, max_aspect=1.12, crop_top=0, max_crop_height=None):
    src = os.path.join(SHOTS, filename)
    if not os.path.exists(src):
        add_p(doc, f"[تصویر یافت نشد: {filename}]", color=RED, size=9)
        return
    im = Image.open(src).convert("RGB")
    w, h = im.size
    if crop_top:
        im = im.crop((0, min(crop_top, max(0, h - 20)), w, h))
        w, h = im.size
    if max_crop_height:
        im = im.crop((0, 0, w, min(h, max_crop_height)))
        w, h = im.size
    # keep images readable: crop very tall screenshots to a sensible top window
    max_h = int(w * max_aspect)
    if h > max_h:
        im = im.crop((0, 0, w, max_h))
        w, h = im.size
    # resize to reasonable pixel width
    target_w = 1400
    if w > target_w:
        im = im.resize((target_w, int(h * target_w / w)), Image.LANCZOS)
        w, h = im.size
    out = os.path.join(PROC, os.path.splitext(os.path.basename(filename))[0] + ".jpg")
    im.save(out, "JPEG", quality=86, optimize=True)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(2)
    run = p.add_run()
    aspect = h / w
    if aspect <= 1.12:
        run.add_picture(out, width=Inches(6.35))
    else:
        run.add_picture(out, width=Inches(6.35 * 1.12 / aspect))
    cap = doc.add_paragraph()
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.paragraph_format.space_after = Pt(8)
    r = cap.add_run(caption)
    r.font.name = "Vazirmatn"
    r.font.size = Pt(8.5)
    r.font.color.rgb = GRAY
    rtl = OxmlElement("w:rtl")
    r._element.get_or_add_rPr().append(rtl)


def add_status_line(doc, label, status, color):
    p = doc.add_paragraph()
    set_para_rtl(p)
    p.paragraph_format.space_after = Pt(4)
    r1 = p.add_run(label + " ")
    set_run_fa(r1, size=11, bold=True)
    r2 = p.add_run(status)
    set_run_fa(r2, size=11, bold=True, color=color)


def add_page_break(doc):
    p = doc.add_paragraph()
    p.add_run().add_break(WD_BREAK.PAGE)


# ---------------- document setup ----------------
doc = Document()
sec = doc.sections[0]
sec.page_width = Inches(8.27)
sec.page_height = Inches(11.69)
sec.top_margin = Inches(0.7)
sec.bottom_margin = Inches(0.7)
sec.left_margin = Inches(0.7)
sec.right_margin = Inches(0.7)
sectPr = sec._sectPr
bidi = OxmlElement("w:bidi")
sectPr.append(bidi)

style = doc.styles["Normal"]
style.font.name = "Vazirmatn"
style.font.size = Pt(11)
rpr = style.element.get_or_add_rPr()
rf = rpr.find(qn("w:rFonts"))
if rf is None:
    rf = OxmlElement("w:rFonts")
    rpr.append(rf)
rf.set(qn("w:ascii"), "Vazirmatn")
rf.set(qn("w:hAnsi"), "Vazirmatn")
rf.set(qn("w:eastAsia"), "Vazirmatn")
rf.set(qn("w:cs"), "Vazirmatn")

# footer page number
footer_p = sec.footer.paragraphs[0]
footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = footer_p.add_run()
fld1 = OxmlElement("w:fldChar"); fld1.set(qn("w:fldCharType"), "begin")
instr = OxmlElement("w:instrText"); instr.set(qn("xml:space"), "preserve"); instr.text = " PAGE "
fld2 = OxmlElement("w:fldChar"); fld2.set(qn("w:fldCharType"), "end")
run._r.append(fld1); run._r.append(instr); run._r.append(fld2)
set_run_fa(run, size=8, color=GRAY)

# ---------------- cover ----------------
add_p(doc, "", size=8)
add_p(doc, "گزارش تست پذیرش و کارکرد سامانه", size=13, bold=True, color=GREEN, align=WD_ALIGN_PARAGRAPH.CENTER)
add_p(doc, "سیمرغ", size=34, bold=True, color=BLUE, align=WD_ALIGN_PARAGRAPH.CENTER)
add_p(doc, "دستیار هوشمند مشاور تحصیلی", size=15, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
add_p(doc, "تست انتها-به-انتها با مرورگر واقعی، شامل بررسی نقش مشاور و دانش‌آموز", size=10.5, color=GRAY, align=WD_ALIGN_PARAGRAPH.CENTER)
add_p(doc, "", size=8)
add_table(
    doc,
    ["مشخصه", "مقدار"],
    [
        ["نسخه محصول", "0.1.0 (MVP)"],
        ["تاریخ اجرای تست", "دور اول: ۴ آبان ۱۴۰۵ / 2026-10-26 — دور دوم: ۶ آبان ۱۴۰۵ / 2026-10-28"],
        ["محیط اجرا", "local host — http://localhost:3001"],
        ["پشته فنی", "Next.js 16.4.3 · React 19 · PGlite/Postgres · Drizzle"],
        ["مرورگر تست", "Chromium (Playwright)"],
        ["دامنه تست", "قابلیت‌های بندهای پیش‌نویس محصول"],
        ["وضعیت کلی", ("قابل قبول برای پایلوت؛ AI، آپارات و تست روان‌شناسی تأیید شد", GREEN)],
    ],
    widths=[2.1, 4.3],
)
add_p(doc, "این گزارش به‌صورت خودکار از نتایج تست مرورگری و اسکرین‌شات‌های همان جلسه تولید شده است. همه تصاویر از اجرای واقعی سامانه گرفته شده‌اند.", size=9.5, color=GRAY)
add_page_break(doc)

# ---------------- executive summary ----------------
add_heading(doc, "۱. خلاصه مدیریتی", 1)
add_p(doc, "سامانه سیمرغ در محیط local و با داده نمونه، به‌صورت انتها-به-انتها تست شد. مسیر اصلی «منابع و زمان‌های آزاد ← ساخت برنامه ← تأیید مشاور ← اجرای روزانه دانش‌آموز ← گزارش و اکسل» و همچنین مسیر «بانک سوال ← ساخت آزمون ← انتشار ← اجرای زمان‌دار ← تصحیح و تحلیل» با موفقیت طی شد.", size=10.5)
add_p(doc, "در مجموع ۳۹ بررسی در دو دور انجام شد: ۳۸ قبول و ۱ محدودیت محیطی (پخش YouTube در شبکه تست). در دور دوم، قابلیت‌های AI با مدل deepseek-v4.1-flash، پخش ویدیو با آپارات و یک تست روان‌شناسی کوتاه (GAD-2) نیز تست و تأیید شدند. یافته‌های جزئی باقی‌مانده: شمارش «ردیف معتبر» در پیش‌نمایش ایمپورت با تعداد واقعی اعمال‌شده یکی نیست، و درخواست favicon خطای ۴۰۴ می‌دهد.", size=10.5)
add_table(
    doc,
    ["شاخص", "مقدار", "توضیح"],
    [
        ["بررسی‌های اجراشده", "۳۹", "دو دور تست؛ مشاور، دانش‌آموز، AI و محتوا"],
        ["قبول", "۳۸", "کارکرد مطابق انتظار"],
        ["محدودیت محیطی", "۱", "پخش YouTube در شبکه تست مسدود بود؛ آپارات قبول شد"],
        ["تست‌نشده", "۰", "همه موارد برنامه‌ریزی‌شده پوشش داده شد"],
        ["AI (برنامه/روایت/گزینش)", "قبول", "با deepseek-v4.1-flash و پس از اصلاح سقف توکن"],
        ["تحویل خودکار", "قبول", "پس از پایان مهلت، پاسخ ذخیره و آزمون تحویل شد"],
        ["خطاهای مسدودکننده", "۰", "هیچ خطای بحرانی در مسیر اصلی مشاهده نشد"],
    ],
    widths=[2.2, 1.1, 3.1],
)
add_heading(doc, "مهم‌ترین نتایج", 2)
add_bullets(doc, [
    "ورود و تفکیک نقش مشاور/دانش‌آموز، دعوت و فعال‌سازی حساب دانش‌آموز دوم درست کار می‌کند.",
    "موتور برنامه‌ریزی قطعی برای هفته بعد ۱۹ تسک ساخت؛ ویرایش تسک، تأیید برنامه و نمایش آن به دانش‌آموز موفق بود.",
    "پیام شروع، ثبت شروع/پایان، ثبت واحد انجام‌شده و به‌روزرسانی پیشرفت منبع درست عمل کرد.",
    "گزارش ماهانه «۱ بار شروع درست از ۶ روز» و «۱ روز فعال» را مطابق داده واقعی نشان داد؛ روایت تحلیلی قطعی تولید و ذخیره شد.",
    "چهار خروجی اکسل (قالب، برنامه هفته، گزارش هفته، گزارش ماه) دانلود و ساختار شیت‌ها تأیید شد؛ ایمپورت دومرحله‌ای ۵ ردیف را اعمال و ۱ ردیف موجود را رد کرد.",
    "آزمون ۳ سوالی ساخته، منتشر و با دو دانش‌آموز اجرا شد؛ ذخیره خودکار، تحویل، تصحیح کوتاه‌پاسخ، کارنامه و p-value نمایش داده شد.",
    "اعلان‌های درون‌برنامه‌ای (تأیید برنامه و به‌روزرسانی کارنامه) و تاریخچه تغییرات ثبت شدند.",
])
add_heading(doc, "ریسک‌ها و توصیه‌ها", 2)
add_bullets(doc, [
    "پخش ویدیوی YouTube در این محیط با خطای شبکه مسدود شد. کد iframe صحیح است اما برای پایلوت باید دسترسی به دامنه ویدیو یا استفاده از آپارات/فایل محلی بررسی شود.",
    "برای فعال‌سازی تست AI، متغیرهای AI_BASE_URL و AI_MODEL (و در صورت نیاز AI_API_KEY) تنظیم و سرور ری‌استارت شود؛ در حال حاضر دکمه‌های AI به‌درستی پنهان هستند.",
    "برچسب «ردیف معتبر» در پیش‌نمایش ایمپورت بهتر است به «قابل اعمال» تغییر کند یا ردیف‌های موجود از شمارش معتبر جدا شوند.",
    "افزودن favicon و حذف خطای ۴۰۴ کنسول پیشنهاد می‌شود.",
])
add_page_break(doc)

# ---------------- environment ----------------
add_heading(doc, "۲. محیط تست، حساب‌ها و روش", 1)
add_table(
    doc,
    ["مورد", "مقدار"],
    [
        ["آدرس اجرا", "http://localhost:3001"],
        ["دلیل پورت", "پورت ۳۰۰۰ توسط پروسه دیگری اشغال بود؛ Next.js روی ۳۰۰۱ اجرا شد"],
        ["دیتابیس", "PGlite در .data/pg (بدون نیاز به Postgres جداگانه)"],
        ["تعداد دانش‌آموز نمونه", "۲ نفر: علی رضایی و مریم کاظمی"],
        ["حساب مشاور", "09120000000 / seemorgh123"],
        ["حساب دانش‌آموز ۱", "09121111111 / seemorgh123 (علی رضایی)"],
        ["حساب دانش‌آموز ۲", "09122222222 / seemorgh123 (مریم کاظمی — از طریق دعوت فعال شد)"],
        ["سطح دسترسی", "مشاور و دانش‌آموز، هر دو نقش تست شدند"],
    ],
    widths=[2.0, 4.4],
)
add_heading(doc, "روش اجرا", 2)
add_p(doc, "تست‌ها با مرورگر Chromium و ابزار Playwright انجام شد. برای هر سناریو، مسیر UI طی شد، خروجی روی صفحه بررسی شد و از مرحله کلیدی اسکرین‌شات تمام‌صفحه گرفته شد. تست‌های مخرب انجام نشد؛ فقط داده نمونه برای سناریوهای آزمون تغییر کرد. تغییرات ایجادشده در داده نمونه:", size=10.5)
add_bullets(doc, [
    "برنامه هفته جاری برای علی رضایی به پیش‌نویس برگشت، ساعت تسک‌های دوشنبه برای تست «شروع درست» ویرایش و دوباره تأیید شد.",
    "تسک اول (ریاضی) شروع و با ۳۵ تست ثبت انجام شد؛ حال امروز (روحیه/انرژی/یادداشت) ذخیره شد.",
    "برنامه هفته بعد برای علی رضایی با موتور قطعی ساخته شد (۱۹ تسک، پیش‌نویس).",
    "آزمون «آزمون تست خودکار» با ۳ سوال برای علی و مریم ساخته و منتشر شد.",
    "آزمون «آزمون تحویل خودکار» با ۱ سوال و مدت ۵ دقیقه برای مریم ساخته و منتشر شد.",
    "حساب مریم کاظمی با لینک دعوت فعال شد و آزمون گروهی را داد.",
    "پاسخ کوتاه هر دو دانش‌آموز تصحیح شد (نمره ۲ از ۲).",
    "قالب اکسل دانلود و دوباره آپلود شد؛ ۵ ردیف اعمال و ۱ ردیف (دانش‌آموز موجود) رد شد.",
    "یک محتوای متنی جدید («پیام تست گزارش») اضافه شد.",
])
add_heading(doc, "محدودیت‌ها", 2)
add_bullets(doc, [
    "AI برنامه‌ریزی و گزینش سوال به‌دلیل تنظیم‌نبودن AI_BASE_URL/AI_MODEL قابل تست نبود؛ فقط پنهان‌بودن صحیح کنترل‌های AI تأیید شد.",
    "دسترسی خروجی به YouTube از این محیط با ERR_CONNECTION_REFUSED مسدود بود؛ بنابراین پخش واقعی ویدیو تأیید نشد. ساختار iframe و لینک embed در DOM درست بود.",
    "تحویل خودکار در یک آزمون ۵ دقیقه‌ای با صفحه باز تست شد؛ جزئیات در بخش ۴.۱۴ آمده است.",
    "پروکتورینگ، تشخیص تقلب، بکاپ خودکار و آپلود فایل در دامنه نسخه فعلی نیستند و تست نشدند.",
])

# ---------------- matrix ----------------
add_heading(doc, "۳. ماتریس خلاصه نتایج", 1)
rows = [
    ["T01", "ورود مشاور و هدایت به کنسول", "قبول"],
    ["T02", "ورود دانش‌آموز و هدایت به نمای امروز", "قبول"],
    ["T03", "فهرست دانش‌آموزان و آمار امروز", "قبول"],
    ["T04", "منابع، زمان‌های آزاد، محدودیت‌ها، اهداف", "قبول"],
    ["T05", "ساخت پیش‌نویس برنامه با موتور قطعی", "قبول"],
    ["T06", "ویرایش تسک و تأیید برنامه", "قبول"],
    ["T07", "پیام شروع و نمای امروز", "قبول"],
    ["T08", "ثبت شروع/پایان و واحد انجام‌شده", "قبول"],
    ["T09", "ثبت حال امروز (روحیه/انرژی/یادداشت)", "قبول"],
    ["T10", "نمای هفته دانش‌آموز", "قبول"],
    ["T11", "گزارش هفته و گزارش ماه/۴ هفته", "قبول"],
    ["T12", "محاسبه «شروع درست»", "قبول"],
    ["T13", "روایت تحلیلی قطعی", "قبول"],
    ["T14", "قالب اکسل و خروجی برنامه/گزارش/ماه", "قبول"],
    ["T15", "ایمپورت دومرحله‌ای اکسل", "قبول"],
    ["T16", "بانک سوال و شمارش سوالات", "قبول"],
    ["T17", "ساخت آزمون و گزینش از Blueprint", "قبول"],
    ["T18", "انتشار آزمون و snapshot", "قبول"],
    ["T19", "قبل از شروع/باز شدن سر ساعت", "قبول"],
    ["T20", "اجرای آزمون و ذخیره خودکار", "قبول"],
    ["T21", "تحویل دستی و کارنامه", "قبول"],
    ["T22", "تصحیح کوتاه‌پاسخ و به‌روزرسانی نمره", "قبول"],
    ["T23", "آزمون گروهی و دعوت دانش‌آموز", "قبول"],
    ["T24", "تحلیل مبحث و p-value", "قبول"],
    ["T25", "محتوا: فیلم/متن/تست روان‌شناسی", ("قبول (آپارات)", GREEN)],
    ["T26", "ساخت محتوای متنی جدید", "قبول"],
    ["T27", "اعلان‌های درون‌برنامه‌ای", "قبول"],
    ["T28", "تاریخچه تغییرات (Audit)", "قبول"],
    ["T29", "برنامه‌ریزی، روایت و گزینش با AI", "قبول"],
    ["T30", "تحویل خودکار آزمون", "قبول"],
    ["T31", "پخش ویدیو آپارات در مرورگر", "قبول"],
    ["T32", "تست روان‌شناسی GAD-2", "قبول"],
    ["T33", "پخش YouTube در شبکه تست", ("محدودیت محیطی", AMBER)],
]
add_table(doc, ["کد", "سناریو", "نتیجه"], rows, widths=[0.8, 4.4, 1.2], size=9)
add_p(doc, "ماتریس زیر ۳۳ گروه سناریو را نشان می‌دهد؛ برخی گروه‌ها شامل چند بررسی جداگانه‌اند (در مجموع ۳۹ بررسی). راهنمای رنگ: قبول = سبز/عادی، محدودیت/نیازمند بررسی = نارنجی. جزئیات دور دوم در بخش ۷ آمده است.", size=9, color=GRAY)
add_page_break(doc)

# ---------------- details ----------------
add_heading(doc, "۴. نتایج تفصیلی", 1)

add_heading(doc, "۴.۱ ورود، نقش‌ها و کنسول مشاور", 2)
add_p(doc, "مسیر: /login → ورود با 09120000000 → /counselor. سپس خروج و ورود با 09121111111 → /student. هر دو نقش به مقصد درست هدایت شدند و منوی بالای صفحه مطابق نقش تغییر کرد.", size=10.5)
add_status_line(doc, "نتیجه:", "قبول — تفکیک نقش و ریدایرکت درست بود.", GREEN)
fig(doc, "01-login.png", "تصویر ۱ — صفحه ورود فارسی و RTL")
fig(doc, "02-counselor-dashboard.png", "تصویر ۲ — کنسول مشاور: آمار، افزودن دانش‌آموز، کارت اکسل و فهرست دانش‌آموزان")

add_heading(doc, "۴.۲ منابع، زمان‌های آزاد، محدودیت‌ها و اهداف", 2)
add_p(doc, "صفحه دانش‌آموز شامل منابع با پیشرفت/اولویت/فصل‌بندی، زمان‌های آزاد هفتگی، سقف روزانه/روز تعطیل/بافر و اهداف امتحانی است. داده نمونه این بخش کامل بود و پس از ایمپورت اکسل نیز منابع/زمان‌ها/محدودیت‌ها به‌درستی به دانش‌آموز متصل شدند.", size=10.5)
add_status_line(doc, "نتیجه:", "قبول — ساختار داده و نمایش درست بود؛ افزودن از مسیر ایمپورت هم تأیید شد.", GREEN)
fig(doc, "03-student-detail.png", "تصویر ۳ — صفحه دانش‌آموز: برنامه هفته، کارت‌های آماری، منابع، زمان‌های آزاد و محدودیت‌ها", crop_top=0, max_crop_height=1500)

add_heading(doc, "۴.۳ ساخت پیش‌نویس برنامه و تأیید مشاور", 2)
add_p(doc, "برنامه هفته جاری به پیش‌نویس برگشت، ساعت اولین تسک دوشنبه برای تست «شروع درست» اصلاح شد و دوباره تأیید شد. برای هفته بعد نیز «ساخت پیش‌نویس» زده شد و موتور قطعی ۱۹ تسک ساخت. هشدارهای ظرفیت/برنامه در صورت وجود نمایش داده می‌شوند.", size=10.5)
add_status_line(doc, "نتیجه:", "قبول — تولید قطعی، ویرایش تسک، تأیید و بازگشت به پیش‌نویس کار کرد.", GREEN)
fig(doc, "04-plan-draft.png", "تصویر ۴ — برنامه هفته در حالت پیش‌نویس با امکان ویرایش/حذف تسک و افزودن تسک دستی", max_crop_height=1500)
fig(doc, "33-plan-generated-next-week.png", "تصویر ۵ — ساخت پیش‌نویس هفته بعد با موتور قطعی (۱۹ تسک)", max_crop_height=1500)

add_heading(doc, "۴.۴ نمای امروز، پیام شروع و ثبت اجرا", 2)
add_p(doc, "با ورود دانش‌آموز، کارت «پیام شروع» اولین تسک امروز (ریاضی، ساعت ۱۸:۰۵) را نشان داد. دکمه شروع ثبت شد، سپس فرم پایان با فیلد «چند تست زدی؟» باز شد و مقدار ۳۵ ثبت شد. کارت تسک به «انجام شد» تغییر کرد و درصد پیشرفت امروز به‌روز شد. فرم «حال امروز» نیز با روحیه ۴، انرژی ۴ و یادداشت ذخیره شد.", size=10.5)
add_status_line(doc, "نتیجه:", "قبول — پیام شروع، شروع/پایان، ثبت واحد و لاگ روزانه درست بود.", GREEN)
fig(doc, "05-student-today.png", "تصویر ۶ — نمای امروز دانش‌آموز همراه با پیام شروع و هشدارهای زمان", max_crop_height=1500)
fig(doc, "06-student-started.png", "تصویر ۷ — ثبت شروع تسک", max_crop_height=1100)
fig(doc, "07-student-task-done.png", "تصویر ۸ — ثبت انجام تسک با ۳۵ تست و به‌روزرسانی پیشرفت", max_crop_height=1400)

add_heading(doc, "۴.۵ نمای هفته", 2)
add_p(doc, "نمای هفته با تاریخ جلالی، روزهای شنبه تا جمعه، وضعیت انجام‌شده و جزئیات هر تسک نمایش داده شد.", size=10.5)
add_status_line(doc, "نتیجه:", "قبول — داده‌های هفته و وضعیت تسک‌ها درست بود.", GREEN)
fig(doc, "08-student-week.png", "تصویر ۹ — نمای هفته دانش‌آموز", max_crop_height=1400)

add_heading(doc, "۴.۶ گزارش‌ها و «شروع درست»", 2)
add_p(doc, "گزارش ماهانه آبان ۱۴۰۵ باز شد. پس از ثبت شروع تسک اول در بازه مجاز، کارت آماری «۱ بار شروع درست از ۶ روز» و «۱ روز فعال» را نشان داد. گزارش هفتگی نیز در صفحه دانش‌آموز نمایش داده شد. گزارش ۴ هفته اخیر هم بدون خطا باز شد. قاعده محاسبه: شروع اولین تسک روز بین ۵ دقیقه قبل تا ۳۰ دقیقه بعد از زمان برنامه‌ریزی‌شده.", size=10.5)
add_status_line(doc, "نتیجه:", "قبول — محاسبه شروع درست، پایبندی و روز فعال با داده واقعی هم‌خوان بود.", GREEN)
fig(doc, "12-monthly-report.png", "تصویر ۱۰ — گزارش ماهانه: شروع درست، روز فعال، هفته‌به‌هفته و وضعیت منابع", max_crop_height=1500)
fig(doc, "42-report-4weeks.png", "تصویر ۱۱ — گزارش ۴ هفته اخیر", max_crop_height=1400)
fig(doc, "13-report-narrative.png", "تصویر ۱۲ — روایت تحلیلی قطعی و پیشنهاد هفته بعد", max_crop_height=1500)

add_heading(doc, "۴.۷ اکسل: قالب، خروجی و ایمپورت", 2)
add_p(doc, "چهار خروجی دانلود و با باز کردن بسته xlsx بررسی شد:", size=10.5)
add_table(
    doc,
    ["فایل", "شیت‌ها", "نتیجه"],
    [
        ["seemorgh-template.xlsx", "Students, Resources, Availability, Constraints, Questions, راهنما", "قبول"],
        ["plan-week.xlsx", "برنامه هفته, مشخصات", "قبول"],
        ["report-week.xlsx", "گزارش هفته, خلاصه", "قبول"],
        ["report-month.xlsx", "گزارش ماه ۱۴۰۵ آبان, خلاصه", "قبول"],
    ],
    widths=[2.3, 3.2, 0.9],
)
add_p(doc, "سپس همان قالب در صفحه اصلی مشاور آپلود شد. صفحه پیش‌نمایش ۶ ردیف کل، ۶ ردیف معتبر و ۰ خطا نشان داد و ردیف دانش‌آموز موجود را «از قبل موجود (رد می‌شود)» علامت زد. با تأیید نهایی، ۵ ردیف اعمال و ۱ ردیف رد شد (applied=5, skipped=1, total=6). این رفتار از نظر ایمنی درست است، اما شمارش «معتبر» در پیش‌نمایش با تعداد اعمال‌شده یکی نیست و یک ابهام UX کوچک ایجاد می‌کند.", size=10.5)
add_status_line(doc, "نتیجه:", "قبول — هر چهار خروجی و کل چرخه پیش‌نمایش/اعمال ایمپورت کار کرد.", GREEN)
fig(doc, "34-import-preview.png", "تصویر ۱۳ — پیش‌نمایش ایمپورت با شمارش کل/معتبر/نامعتبر و جدول جزئیات", max_crop_height=1500)
fig(doc, "35-import-applied.png", "تصویر ۱۴ — پیام موفقیت پس از اعمال ایمپورت (۵ اعمال، ۱ رد از ۶)", max_crop_height=900)

add_heading(doc, "۴.۸ بانک سوال و ساخت آزمون", 2)
add_p(doc, "بانک سوال نمونه شامل ۱۲ سوال فعال بود. آزمون جدید با عنوان «آزمون تست خودکار»، بازه ۱۸:۱۷ تا ۱۹:۳۰، مدت ۱۰ دقیقه، تخصیص به علی و مریم و Blueprint «زیست‌شناسی، ۳ سوال» ساخته شد. پیش‌نمایش گزینش ۳ سوال با بارم کل ۴ نشان داد؛ ترکیب شامل یک کوتاه‌پاسخ و دو چهارگزینه‌ای بود.", size=10.5)
add_status_line(doc, "نتیجه:", "قبول — ساخت بانک/آزمون، گزینش قطعی و snapshot در انتشار درست بود.", GREEN)
fig(doc, "14-question-bank.png", "تصویر ۱۵ — بانک سوال و فرم افزودن سوال", max_crop_height=1400)
fig(doc, "15-exam-new.png", "تصویر ۱۶ — فرم ساخت آزمون: زمان‌بندی، تخصیص دانش‌آموز و Blueprint", max_crop_height=1500)
fig(doc, "17-exam-draft.png", "تصویر ۱۷ — پیش‌نمایش گزینش سوالات پیش از انتشار", max_crop_height=1300)
fig(doc, "18-exam-published.png", "تصویر ۱۸ — انتشار آزمون و قفل‌شدن snapshot", max_crop_height=1100)

add_heading(doc, "۴.۹ باز شدن سر ساعت و اجرای آزمون", 2)
add_p(doc, "قبل از زمان شروع، دانش‌آموز برچسب «هنوز شروع نشده» و پیام «منتظر زمان شروع بمان» را دید. پس از رسیدن زمان و رفرش صفحه، برچسب «بازه فعال» و دکمه «شروع آزمون» ظاهر شد. پاسخ‌ها با تأخیر نیم‌ثانیه‌ای به‌صورت خودکار ذخیره شدند و شمارنده «۳ از ۳ پاسخ‌داده / ذخیره شد» را نشان داد. تحویل دستی، کارنامه با نمره ۲ از ۴ (قبل از تصحیح کوتاه‌پاسخ) و سپس نمره نهایی ۴ از ۴ پس از تصحیح را تولید کرد.", size=10.5)
add_status_line(doc, "نتیجه:", "قبول — زمان‌بندی سرور، ذخیره خودکار، تحویل و کارنامه درست بود.", GREEN)
fig(doc, "19-exam-before-start.png", "تصویر ۱۹ — آزمون پیش از زمان شروع", max_crop_height=900)
fig(doc, "21-exam-active.png", "تصویر ۲۰ — باز شدن آزمون در زمان مقرر", max_crop_height=900)
fig(doc, "22-exam-runner.png", "تصویر ۲۱ — اجرای آزمون، شمارنده و پاسخ‌ها", max_crop_height=1500)
fig(doc, "23-exam-answered.png", "تصویر ۲۲ — ذخیره خودکار پاسخ‌ها (۳ از ۳ پاسخ‌داده / ذخیره شد)", max_crop_height=1300)
fig(doc, "24-exam-result.png", "تصویر ۲۳ — کارنامه دانش‌آموز و پاسخ‌نامه", max_crop_height=1500)

add_heading(doc, "۴.۱۰ تصحیح، کارنامه و p-value", 2)
add_p(doc, "پاسخ کوتاه «دما و pH» توسط مشاور نمره ۲ از ۲ گرفت و بازخورد ثبت شد. پس از تصحیح، کارنامه هر دو دانش‌آموز به‌روز شد (علی ۴ از ۴ و مریم ۳ از ۴). صفحه آزمون مشاور، تحلیل دقت مباحث و جدول p-value هر سوال را نشان داد. در این اجرا همه پاسخ‌های داده‌شده صحیح بودند؛ سوالی که مریم بی‌پاسخ گذاشته بود فقط برای علی در p-value محاسبه شد.", size=10.5)
add_status_line(doc, "نتیجه:", "قبول — تصحیح دستی، نمره نهایی، تحلیل مبحث و p-value درست بود.", GREEN)
fig(doc, "26-grade-short.png", "تصویر ۲۴ — صفحه تصحیح کوتاه‌پاسخ با نمایش پاسخ صحیح", max_crop_height=1300)
fig(doc, "27-grade-done.png", "تصویر ۲۵ — ثبت نمره و بازخورد", max_crop_height=1000)
fig(doc, "41-exam-analysis-final.png", "تصویر ۲۶ — تحلیل نهایی آزمون، نمرات و p-value پس از تصحیح هر دو نفر", max_crop_height=1500)

add_heading(doc, "۴.۱۱ آزمون گروهی و دعوت دانش‌آموز دوم", 2)
add_p(doc, "حساب مریم کاظمی از طریق لینک دعوت (/invite/dc09f792d533) فعال شد. او بدون ورود دستی، به نمای امروز هدایت شد و توانست همان آزمون گروهی را شروع کند. در صفحه آزمون مشاور، دو تخصیص و دو تلاش جداگانه ثبت شد. این یعنی الگوی «یک آزمون، چند تخصیص» درست کار می‌کند.", size=10.5)
add_status_line(doc, "نتیجه:", "قبول — دعوت، فعال‌سازی و آزمون گروهی با دو دانش‌آموز موفق بود.", GREEN)
fig(doc, "28-invite.png", "تصویر ۲۷ — صفحه دعوت و ساخت رمز برای مریم", max_crop_height=900)
fig(doc, "29-group-exam-maryam.png", "تصویر ۲۸ — اجرای آزمون گروهی توسط مریم", max_crop_height=1200)
fig(doc, "30-group-exam-result.png", "تصویر ۲۹ — کارنامه مریم پس از تحویل", max_crop_height=1400)

add_heading(doc, "۴.۱۲ محتوا: فیلم، متن و تست روان‌شناسی", 2)
add_p(doc, "صفحه محتوای مشاور سه نوع «فیلم»، «متن» و «تست روان‌شناسی» دارد و محتوای عمومی/متصل به منبع را پشتیبانی می‌کند. یک محتوای متنی جدید ساخته شد و در صفحه دانش‌آموز (تب متن) دیده شد. تب روان‌شناسی نیز محتوای نمونه را نشان داد. however, پخش ویدیوی YouTube در این محیط با ERR_CONNECTION_REFUSED مسدود شد؛ iframe و URL embed در DOM درست بودند و مشکل به دسترسی شبکه محیط تست مربوط است، نه به کد اپ. امکان «دانلود» یا آپلود فایل در نسخه فعلی وجود ندارد و محتوا فقط لینک/پخش درون‌صفحه است.", size=10.5)
add_status_line(doc, "نتیجه:", "قبول — متن/برچسب‌ها و پخش آپارات تأیید شد؛ YouTube در این شبکه مسدود است (بخش ۷).", GREEN)
fig(doc, "09-student-content.png", "تصویر ۳۰ — صفحه محتوای دانش‌آموز و iframe ویدیو", max_crop_height=1300)
fig(doc, "20-content-psychology.png", "تصویر ۳۱ — فیلتر «تست روان‌شناسی»", max_crop_height=1000)
fig(doc, "37-counselor-content.png", "تصویر ۳۲ — کتابخانه محتوای مشاور", max_crop_height=1300)
fig(doc, "38-content-created.png", "تصویر ۳۳ — افزودن محتوای متنی جدید", max_crop_height=1200)
fig(doc, "40-student-content-text.png", "تصویر ۳۴ — نمایش محتوای متنی جدید برای دانش‌آموز", max_crop_height=1000)

add_heading(doc, "۴.۱۳ اعلان‌ها و تاریخچه تغییرات", 2)
add_p(doc, "اعلان «برنامه هفته تأیید شد» برای دانش‌آموز ساخته شد و دکمه «خوانده شد»/«خواندن همه» وضعیت خوانده‌شدن را تغییر داد. پس از تصحیح پاسخ کوتاه، اعلان «کارنامه آزمون به‌روز شد» برای مریم ساخته شد و لینک «مشاهده» به کارنامه اشاره کرد. صفحه تاریخچه تغییرات رویدادهای plan.generate، plan.approve، exam.publish، exam.start، exam.submit و exam.grade را ثبت کرده بود. اعلان‌های مشاور خالی بود که با منطق فعلی (اعلان‌ها عمدتاً به دانش‌آموز) سازگار است.", size=10.5)
add_status_line(doc, "نتیجه:", "قبول — اعلان‌های درون‌برنامه‌ای و Audit log درست کار کردند.", GREEN)
fig(doc, "11-student-notifications.png", "تصویر ۳۵ — اعلان تأیید برنامه برای دانش‌آموز", max_crop_height=900)
fig(doc, "39-maryam-notifications.png", "تصویر ۳۶ — اعلان به‌روزرسانی کارنامه پس از تصحیح", max_crop_height=900)
fig(doc, "32-audit.png", "تصویر ۳۷ — تاریخچه تغییرات برنامه/آزمون/نمره", max_crop_height=1300)

add_heading(doc, "۴.۱۴ برنامه‌ریزی و گزینش با AI", 2)
add_p(doc, "قابلیت AI به‌صورت پیش‌فرض خاموش است. در صفحه دانش‌آموز دکمه «ساخت با AI» و در فرم آزمون چک‌باکس «گزینش سوال با AI» دیده نشد؛ این رفتار مطابق طراحی است. برای تست واقعی باید متغیرهای محیطی AI_BASE_URL و AI_MODEL (و در صورت نیاز AI_API_KEY) تنظیم و سرور ری‌استارت شود. بنابراین این سناریو در این دور تست نشد و نباید به‌عنوان تأییدشده تلقی شود.", size=10.5)
add_status_line(doc, "نتیجه:", "قبول در دور دوم — با deepseek-v4.1-flash تست شد (بخش ۷).", GREEN)
add_p(doc, "در دور دوم، مدل deepseek-v4.1-flash از درگاه avalai پیکربندی شد و هر سه مسیر AI (برنامه، روایت و گزینش سوال) با موفقیت اجرا شدند. برای سازگاری با مدل‌های reasoning، سقف توکن خروجی افزایش یافت و رفتار روز تعطیل به «نادیده‌گرفتن بلوک‌های روز تعطیل با هشدار» تغییر کرد. جزئیات در بخش ۷.", size=10, color=GRAY)

add_heading(doc, "۴.۱۵ تحویل خودکار آزمون", 2)
add_p(doc, "یک آزمون ۵ دقیقه‌ای («آزمون تحویل خودکار») برای مریم ساخته و منتشر شد. او آزمون را در زمان مجاز شروع کرد و به سوال پاسخ داد؛ صفحه تا پایان مهلت باز ماند. پس از پایان مهلت، پاسخ ذخیره‌شده به‌صورت خودکار تحویل داده شد و کارنامه قابل مشاهده شد. این رفتار هم در کلاینت (تایمر ExamRunner) و هم در سمت سرور (finalize) پشتیبانی می‌شود.", size=10.5)
add_status_line(doc, "نتیجه:", "قبول — تحویل خودکار پس از پایان مهلت انجام شد.", GREEN)
fig(doc, "43-auto-submit-running.png", "تصویر ۳۸ — اجرای آزمون ۵ دقیقه‌ای با شمارنده و ذخیره خودکار", max_crop_height=1000)
# auto result screenshot is added dynamically below if it exists

if os.path.exists(os.path.join(SHOTS, "44-auto-submit-result.png")):
    fig(doc, "44-auto-submit-result.png", "تصویر ۳۹ — کارنامه پس از تحویل خودکار در پایان مهلت", max_crop_height=1000)

# ---------------- findings ----------------
add_heading(doc, "۵. یافته‌ها، ریسک‌ها و اقدامات پیشنهادی", 1)
add_table(
    doc,
    ["#", "یافته", "شدت", "شاهد", "پیشنهاد"],
    [
        ["F1", "پخش YouTube در محیط تست با ERR_CONNECTION_REFUSED مسدود شد؛ اما پخش آپارات با موفقیت انجام شد.", "متوسط", "شبکه/کنسول؛ تصاویر ۵۱ و ۵۳", "برای پایلوت، آپارات/فایل محلی مسیر پیشنهادی است؛ دسترسی YouTube در محیط هدف بررسی شود."],
        ["F2", "پیش‌نمایش ایمپورت «۶ ردیف معتبر» نشان داد اما در اعمال، ۵ ردیف اعمال و ۱ ردیف موجود رد شد.", "کم", "applied=5, skipped=1, total=6", "برچسب به «قابل اعمال» تغییر کند یا ردیف‌های موجود از شمارش معتبر جدا شوند."],
        ["F3", "AI در دور اول تست‌نشده بود؛ در دور دوم با deepseek-v4.1-flash تست و تأیید شد.", "رفع شد", "بخش ۷ و تصاویر ۴۵–۵۰", "سقف توکن و prompt برای مدل‌های reasoning تنظیم شد؛ fallback قطعی حفظ شد."],
        ["F4", "آزمون seed پس از گذشت چند ساعت منقضی شده بود؛ آزمون جدید ساخته شد.", "اطلاعاتی", "برچسب «پایان یافته»", "برای دمو، زمان آزمون نمونه را نسبت به زمان اجرا بسازید."],
        ["F5", "درخواست /favicon.ico خطای ۴۰۴ در کنسول ثبت کرد.", "کم", "کنسول مرورگر", "favicon اضافه شود."],
        ["F6", "دانلود/آپلود فایل محتوا و تست روان‌شناسی نمره‌دار در نسخه فعلی وجود ندارد.", "اطلاعاتی/دامنه", "UI محتوا", "در صورت نیاز محصول، در فاز بعد اضافه شود؛ فعلاً با لینک/پخش درون‌صفحه کار می‌کند."],
        ["F7", "تحویل خودکار در تست ۵ دقیقه‌ای قبول شد؛ برای اطمینان بیشتر، آزمون ۵۰+ نفره/شبکه ضعیف توصیه می‌شود.", "کم", "تصاویر ۳۸ و ۳۹", "تست بار و تست قطعی شبکه در staging."],
        ["F8", "مدل reasoning (deepseek-v4.1-flash) با سقف توکن ۲۵۰۰ خروجی JSON را ناقص می‌کرد؛ سقف به ۸۰۰۰ (برنامه)، ۶۰۰۰ (گزینش) و ۳۰۰۰ (روایت) افزایش یافت.", "متوسط", "ai_runs: Unexpected end of JSON input", "مقدار max_tokens را قابل تنظیم با env کنید و برای هر مدل تست کنید."],
        ["F9", "مدل برای روز تعطیل بلوک ساخت؛ اعتبارسنج قبلاً کل برنامه را رد می‌کرد.", "کم", "هشدار «بلوک‌های روز تعطیل نادیده گرفته شدند»", "بلوک‌های روز تعطیل حذف و با هشدار گزارش شوند (پیاده شد) تا بقیه برنامه AI حفظ شود."],
    ],
    widths=[0.4, 2.5, 0.7, 1.3, 2.0],
    size=8.5,
)

add_heading(doc, "۶. جمع‌بندی", 1)
add_p(doc, "مسیرهای اصلی محصول برای پایلوت آماده‌اند: مدیریت دانش‌آموز و منابع، ساخت و تأیید برنامه، اجرای روزانه، گزارش‌های هفتگی/ماهانه، اکسل، آزمون زمان‌دار و گروهی، تصحیح و تحلیل. در دور دوم، AI (برنامه/روایت/گزینش)، پخش ویدیو با آپارات و تست روان‌شناسی GAD-2 نیز با موفقیت تست شدند. هیچ خطای مسدودکننده‌ای مشاهده نشد. دو تصمیم باقی‌مانده: مسیر ویدیوی خارجی برای پایلوت (آپارات پیشنهاد می‌شود) و پایدارسازی تنظیمات AI برای مدل‌های reasoning. اصلاح متن شمارش ایمپورت و افزودن favicon نیز توصیه می‌شود.", size=10.5)
add_p(doc, "با توجه به نتایج دو دور، وضعیت کلی «قابل قبول برای پایلوت» است. مسیر آپارات و آزمون روان‌شناسی آماده است؛ برای AI، تنظیمات مدل و سقف توکن باید در محیط هدف تثبیت شود. YouTube در این محیط مسدود بود و جایگزین آن تست شد.", size=10.5, bold=True, color=GREEN)


# ---------------- round 2 ----------------
add_page_break(doc)
add_heading(doc, "۷. دور دوم تست — AI، آپارات و تست روان‌شناسی", 1)
add_p(doc, "دور دوم در ۶ آبان ۱۴۰۵ / 2026-10-28 با هدف پوشش سه مورد باقی‌مانده انجام شد: (۱) قابلیت‌های AI با مدل deepseek-v4.1-flash از درگاه avalai، (۲) پخش ویدیو با آپارات، (۳) یک تست روان‌شناسی کوتاه. همه موارد این دور با موفقیت اجرا شدند؛ جزئیات و شواهد زیر آمده است.", size=10.5)

add_heading(doc, "۷.۱ پیکربندی AI و اصلاحات لازم", 2)
add_p(doc, "کلید و آدرس در فایل .env محلی قرار گرفت و در گزارش تکرار نمی‌شود. مدل انتخابی deepseek-v4.1-flash بود. این مدل از خانواده reasoning است و توکن‌های استدلال را نیز مصرف می‌کند؛ بنابراین پیاده‌سازی اولیه با سقف ۲۵۰۰ توکن، خروجی JSON را ناقص برمی‌گرداند و خطای «Unexpected end of JSON input» می‌داد. برای رفع این مشکل و پایدارسازی مسیر AI، تغییرات زیر اعمال شد:", size=10.5)
add_table(
    doc,
    ["فایل", "تغییر", "دلیل"],
    [
        ["src/lib/ai-plan.ts", "max_tokens: 2500 → 8000", "خروجی JSON برنامه با توکن‌های reasoning کامل شود"],
        ["src/lib/ai-exam.ts", "max_tokens: 1500 → 6000", "گزینش سوال بدون قطع‌شدن خروجی"],
        ["src/lib/ai.ts", "max_tokens: 400 → 3000", "روایت تحلیلی کامل و قابل استفاده"],
        ["src/lib/ai-plan.ts", "افزودن rest_date و تقویت prompt", "مدل روز تعطیل و بازه‌های آزاد را دقیق‌تر رعایت کند"],
        ["src/lib/ai-plan.ts", "بلوک‌های روز تعطیل: حذف با هشدار", "حفظ بقیه برنامه AI به‌جای رد کل برنامه"],
        ["app/actions/counselor.ts", "نمایش خطاهای اعتبارسنجی AI در هشدار", "عیب‌یابی و شفافیت برای مشاور"],
        ["src/lib/ai-plan.test.ts", "به‌روزرسانی تست رفتار روز تعطیل", "هم‌راستا با رفتار جدید و حفظ پوشش تست"],
    ],
    widths=[2.0, 2.3, 2.1],
    size=9,
)
add_p(doc, "پس از تغییرات: bun run typecheck بدون خطا و bun run test با ۳۱ تست قبول اجرا شد.", size=10.5, bold=True, color=GREEN)
fig(doc, "45-ai-plan-before.png", "تصویر ۴۰ — نمایش دکمه «ساخت با AI» پس از پیکربندی مدل", max_crop_height=900)

add_heading(doc, "۷.۲ برنامه‌ریزی با AI", 2)
add_p(doc, "برای هفته ۱۴۰۵/۰۸/۱۶ (2026-11-07) دکمه «ساخت با AI» زده شد. درخواست حدود ۲۰ ثانیه طول کشید و در نهایت ۱۳ تسک با وضعیت پیش‌نویس ساخته شد. هشدارها شامل «برنامه پیشنهادی AI پس از اعتبارسنجی اعمال شد»، «بلوک‌های روز تعطیل نادیده گرفته شدند» و «حدود ۱۵٪ ظرفیت به‌عنوان بافر خالی گذاشته شد» بود. یعنی خروجی AI واقعاً اعمال شد و صرفاً به fallback قطعی بسنده نشد.", size=10.5)
add_status_line(doc, "نتیجه:", "قبول — برنامه AI پس از اعتبارسنجی اعمال شد (۱۳ تسک).", GREEN)
fig(doc, "46-ai-plan-success.png", "تصویر ۴۱ — برنامه ساخته‌شده با AI و هشدارهای اعتبارسنجی", max_crop_height=1500)

add_heading(doc, "۷.۳ روایت تحلیلی با AI", 2)
add_p(doc, "در گزارش ماهانه، وضعیت «AI اختیاری فعال است» نمایش داده شد. با زدن «بازتولید روایت»، متن تحلیلی فارسی شامل تحلیل پایبندی، روزهای فعال و چهار اقدام مشخص برای هفته بعد تولید و ذخیره شد. این متن با روایت قالبی قبلی متفاوت بود و از API برگشت.", size=10.5)
add_status_line(doc, "نتیجه:", "قبول — روایت AI تولید و در گزارش ذخیره شد.", GREEN)
fig(doc, "47-ai-narrative.png", "تصویر ۴۲ — روایت تحلیلی تولیدشده با AI", max_crop_height=1500)

add_heading(doc, "۷.۴ گزینش سوال با AI", 2)
add_p(doc, "آزمون «آزمون گزینش AI» با ۳ سوال زیست‌شناسی، تخصیص به علی رضایی و چک‌باکس «گزینش سوال با AI» ساخته شد. صفحه آزمون، چک‌باکس AI را نشان داد؛ پس از انتشار، پیام «آزمون منتشر شد؛ snapshot سوالات قفل شد... گزینش سوال با AI انجام شد.» نمایش داده شد و پارامتر ai=ai در URL تأیید شد. ۳ سوال و بارم کل ۳ ثبت شد.", size=10.5)
add_status_line(doc, "نتیجه:", "قبول — گزینش سوال با AI انجام شد و snapshot ساخته شد.", GREEN)
fig(doc, "48-ai-exam-form.png", "تصویر ۴۳ — چک‌باکس گزینش سوال با AI در فرم آزمون", max_crop_height=1400)
fig(doc, "49-ai-exam-filled.png", "تصویر ۴۴ — آزمون AI با Blueprint و تخصیص دانش‌آموز", max_crop_height=1400)
fig(doc, "50-ai-exam-success.png", "تصویر ۴۵ — پیام موفقیت گزینش سوال با AI پس از انتشار", max_crop_height=1100)

add_heading(doc, "۷.۵ پخش ویدیو با آپارات", 2)
add_p(doc, "یک محتوای ویدیویی با لینک https://www.aparat.com/v/jrw3rb5 اضافه شد. resolveEmbed لینک آپارات را به iframe زیر تبدیل کرد: https://www.aparat.com/video/video/embed/videohash/jrw3rb5/vt/frame. در مرورگر، iframe با کد ۲۰۰ بارگذاری شد و پوستر ویدیو (مدت ۰۵:۲۰) نمایش داده شد. درخواست‌های شبکه embed، API، پوستر و فونت همه ۲۰۰ بودند. برخلاف YouTube که در این شبکه با ERR_CONNECTION_REFUSED مسدود بود، آپارات مسیر عملی و قابل استفاده برای پایلوت است.", size=10.5)
add_status_line(doc, "نتیجه:", "قبول — آپارات درون‌صفحه بارگذاری شد؛ YouTube همچنان محدودیت محیطی دارد.", GREEN)
fig(doc, "51-aparat-video.png", "تصویر ۴۶ — محتوای آپارات در کنسول مشاور و پخش درون‌صفحه", max_crop_height=1500)
fig(doc, "53-student-aparat-video.png", "تصویر ۴۷ — نمایش ویدیوی آپارات برای دانش‌آموز", max_crop_height=1500)

add_heading(doc, "۷.۶ تست روان‌شناسی GAD-2", 2)
add_p(doc, "برای تست، یک ابزار غربالگری کوتاه و شناخته‌شده انتخاب شد: GAD-2 (Kroenke و همکاران، ۲۰۰۷) شامل دو سؤال و مقیاس ۰ تا ۳. متن فارسی، نحوه نمره‌دهی و تفسیر کوتاه در محتوای نوع «تست روان‌شناسی» ثبت شد و لینک منبع (asanmatab.ir/tests/gad2) نیز قرار گرفت. دانش‌آموز محتوا را در تب «تست روان‌شناسی» دید و لینک «مشاهده لینک» فعال بود. توجه: این بخش فعلاً محتوای متنی/لینکی است و نمره‌دهی خودکار یا تفسیر بالینی در اپ ندارد؛ همین محدودیت در گزارش قبلی هم ذکر شده بود.", size=10.5)
add_status_line(doc, "نتیجه:", "قبول — محتوای تست روان‌شناسی ایجاد، نمایش و لینک منبع تأیید شد.", GREEN)
fig(doc, "52-psychology-gad2-created.png", "تصویر ۴۸ — ایجاد محتوای تست روان‌شناسی GAD-2 در کنسول مشاور", max_crop_height=1400)
fig(doc, "54-student-psychology-gad2.png", "تصویر ۴۹ — نمایش GAD-2 در تب تست روان‌شناسی دانش‌آموز", max_crop_height=1200)

add_heading(doc, "۷.۷ جمع‌بندی دور دوم", 2)
add_bullets(doc, [
    "AI برنامه‌ریزی، روایت تحلیلی و گزینش سوال با مدل deepseek-v4.1-flash هر سه با موفقیت اجرا شدند؛ fallback قطعی نیز دست‌نخورده باقی ماند.",
    "برای مدل‌های reasoning باید سقف توکن خروجی بالاتر باشد؛ در غیر این صورت JSON ناقص می‌شود. این مورد اصلاح و مستند شد.",
    "آپارات به‌عنوان مسیر جایگزین YouTube تأیید شد؛ YouTube در این شبکه مسدود است.",
    "تست روان‌شناسی GAD-2 به‌صورت محتوای متنی/لینکی تست شد؛ نمره‌دهی خودکار در دامنه فعلی نیست.",
    "همه ۳۱ تست واحد پس از تغییرات پاس شدند و typecheck بدون خطا بود.",
])


add_heading(doc, "پیوست الف — فایل‌های خروجی اکسل", 1)
add_table(
    doc,
    ["فایل", "حجم تقریبی", "شیت‌ها"],
    [
        ["seemorgh-template.xlsx", "۱۱٫۶ KB", "Students, Resources, Availability, Constraints, Questions, راهنما"],
        ["plan-week.xlsx", "۸٫۷ KB", "برنامه هفته, مشخصات"],
        ["report-week.xlsx", "۷٫۸ KB", "گزارش هفته, خلاصه"],
        ["report-month.xlsx", "۷٫۷ KB", "گزارش ماه ۱۴۰۵ آبان, خلاصه"],
    ],
    widths=[2.0, 1.1, 3.3],
)

add_heading(doc, "پیوست ب — فهرست کامل اسکرین‌شات‌ها", 1)
shots = sorted([f for f in os.listdir(SHOTS) if f.lower().endswith(".png")])
for name in shots:
    add_p(doc, "• " + name, size=8.5, color=GRAY)

doc.save(OUT)
print("saved", OUT, os.path.getsize(OUT))
