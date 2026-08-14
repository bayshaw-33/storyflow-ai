#!/usr/bin/env python3
"""Generate the confidential KIIKIS 2.0 strategic whitepaper."""

from __future__ import annotations

import json
import math
import random
from pathlib import Path
from typing import Any, Iterable

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader


ROOT = Path(__file__).resolve().parents[1]
MANUSCRIPT = ROOT / "docs/whitepaper/kiikis-whitepaper-2.0-zh.json"
OUTPUT = ROOT / "output/pdf/kiikis-whitepaper-2.0-zh.pdf"
LOGO_LOCKUP = ROOT / "public/brand/kiikis-logo-header.png"
LOGO_MARK = ROOT / "public/brand/kiikis-cat-mark.png"
PAGE_W, PAGE_H = A4
MARGIN = 52


def register_fonts() -> tuple[str, str]:
    font_path = Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf")
    if not font_path.exists():
        raise FileNotFoundError(f"Missing embeddable CJK font: {font_path}")
    pdfmetrics.registerFont(TTFont("KiikisCJK", str(font_path)))
    return "KiikisCJK", "KiikisCJK"


def rgba(hex_value: str, alpha: float = 1.0) -> Color:
    base = HexColor(hex_value)
    return Color(base.red, base.green, base.blue, alpha=alpha)


def set_fill(pdf: canvas.Canvas, value: str | Color, alpha: float = 1.0) -> None:
    color = rgba(value, alpha) if isinstance(value, str) else value
    pdf.setFillColor(color)
    if hasattr(pdf, "setFillAlpha"):
        pdf.setFillAlpha(alpha)


def set_stroke(pdf: canvas.Canvas, value: str | Color, alpha: float = 1.0) -> None:
    color = rgba(value, alpha) if isinstance(value, str) else value
    pdf.setStrokeColor(color)
    if hasattr(pdf, "setStrokeAlpha"):
        pdf.setStrokeAlpha(alpha)


def reset_alpha(pdf: canvas.Canvas) -> None:
    if hasattr(pdf, "setFillAlpha"):
        pdf.setFillAlpha(1)
    if hasattr(pdf, "setStrokeAlpha"):
        pdf.setStrokeAlpha(1)


def draw_image_contain(
    pdf: canvas.Canvas,
    image_path: Path,
    x: float,
    y: float,
    width: float,
    height: float,
) -> None:
    image = ImageReader(str(image_path))
    image_width, image_height = image.getSize()
    scale = min(width / image_width, height / image_height)
    draw_width = image_width * scale
    draw_height = image_height * scale
    pdf.drawImage(
        image,
        x + (width - draw_width) / 2,
        y + (height - draw_height) / 2,
        width=draw_width,
        height=draw_height,
        preserveAspectRatio=True,
        mask="auto",
    )


def split_text(pdf: canvas.Canvas, text: str, font: str, size: float, width: float) -> list[str]:
    lines: list[str] = []
    for explicit in text.split("\n"):
        if not explicit:
            lines.append("")
            continue
        current = ""
        for character in explicit:
            candidate = current + character
            if current and pdf.stringWidth(candidate, font, size) > width:
                lines.append(current.rstrip())
                current = character.lstrip()
            else:
                current = candidate
        if current:
            lines.append(current.rstrip())
    return lines


def draw_lines(
    pdf: canvas.Canvas,
    lines: Iterable[str],
    x: float,
    y: float,
    font: str,
    size: float,
    leading: float,
    color: str,
) -> float:
    set_fill(pdf, color)
    pdf.setFont(font, size)
    cursor = y
    for line in lines:
        pdf.drawString(x, cursor, line)
        cursor -= leading
    reset_alpha(pdf)
    return cursor


def draw_wrapped(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    width: float,
    font: str,
    size: float,
    leading: float,
    color: str,
) -> float:
    return draw_lines(pdf, split_text(pdf, text, font, size, width), x, y, font, size, leading, color)


def round_rect(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
    fill: str,
    stroke: str,
    radius: float = 14,
    fill_alpha: float = 1.0,
    stroke_alpha: float = 1.0,
) -> None:
    set_fill(pdf, fill, fill_alpha)
    set_stroke(pdf, stroke, stroke_alpha)
    pdf.setLineWidth(0.8)
    pdf.roundRect(x, y, width, height, radius, stroke=1, fill=1)
    reset_alpha(pdf)


def draw_brand(pdf: canvas.Canvas, fonts: tuple[str, str], palette: dict[str, str]) -> None:
    draw_image_contain(pdf, LOGO_LOCKUP, MARGIN, PAGE_H - 64, 84, 34)


def draw_background(pdf: canvas.Canvas, palette: dict[str, str], page_number: int) -> None:
    set_fill(pdf, palette["background"])
    pdf.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)

    random.seed(4200 + page_number)
    for _ in range(28):
        x = random.uniform(20, PAGE_W - 20)
        y = random.uniform(40, PAGE_H - 40)
        r = random.choice((0.35, 0.45, 0.6, 0.8))
        set_fill(pdf, palette["text"], random.uniform(0.05, 0.16))
        pdf.circle(x, y, r, stroke=0, fill=1)

    set_fill(pdf, palette["purple"], 0.035)
    pdf.circle(PAGE_W + 40, PAGE_H - 120, 190, stroke=0, fill=1)
    set_fill(pdf, palette["cyan"], 0.025)
    pdf.circle(-60, 150, 165, stroke=0, fill=1)
    reset_alpha(pdf)


def title_lines(page: dict[str, Any]) -> list[str]:
    title = page["title"]
    if page["layout"] == "cover" and "，" in title:
        left, right = title.split("，", 1)
        return [left + "，", right]
    return title.split("\n")


def draw_header(
    pdf: canvas.Canvas,
    page: dict[str, Any],
    fonts: tuple[str, str],
    palette: dict[str, str],
) -> float:
    body_font, bold_font = fonts
    set_fill(pdf, palette["cyan"])
    pdf.setFont("Helvetica-Bold", 8.5)
    pdf.drawString(MARGIN, PAGE_H - 92, page["kicker"])
    pdf.setLineWidth(2)
    set_stroke(pdf, palette["purple"])
    pdf.line(MARGIN, PAGE_H - 104, MARGIN + 34, PAGE_H - 104)

    y = PAGE_H - 146
    set_fill(pdf, palette["text"])
    pdf.setFont(bold_font, 28)
    for line in title_lines(page):
        pdf.drawString(MARGIN, y, line)
        y -= 36

    subtitle = page.get("subtitle")
    if subtitle:
        y -= 5
        y = draw_wrapped(pdf, subtitle, MARGIN, y, PAGE_W - MARGIN * 2, body_font, 12.2, 19, palette["muted"])
    reset_alpha(pdf)
    return y - 18


def draw_footer(
    pdf: canvas.Canvas,
    page_number: int,
    total_pages: int,
    fonts: tuple[str, str],
    palette: dict[str, str],
) -> None:
    font, _ = fonts
    set_stroke(pdf, palette["line"], 0.7)
    pdf.setLineWidth(0.45)
    pdf.line(MARGIN, 41, PAGE_W - MARGIN, 41)
    set_fill(pdf, palette["muted"], 0.75)
    pdf.setFont("Helvetica", 6.6)
    pdf.drawString(MARGIN, 26, "KIIKIS · CONFIDENTIAL · LIMITED DISTRIBUTION")
    pdf.setFont(font, 6.6)
    page_label = f"{page_number:02d} / {total_pages:02d}"
    pdf.drawRightString(PAGE_W - MARGIN, 26, page_label)
    reset_alpha(pdf)


def draw_body(
    pdf: canvas.Canvas,
    page: dict[str, Any],
    y: float,
    fonts: tuple[str, str],
    palette: dict[str, str],
    width: float | None = None,
) -> float:
    font, _ = fonts
    width = width or PAGE_W - MARGIN * 2
    for paragraph in page.get("body", []):
        y = draw_wrapped(pdf, paragraph, MARGIN, y, width, font, 10.7, 18.5, palette["text"])
        y -= 9
    return y


def draw_tags(
    pdf: canvas.Canvas,
    tags: list[str],
    x: float,
    y: float,
    palette: dict[str, str],
) -> None:
    for tag in tags:
        width = pdf.stringWidth(tag, "Helvetica-Bold", 7.2) + 21
        round_rect(pdf, x, y - 6, width, 24, palette["surface"], palette["line"], 12)
        set_fill(pdf, palette["cyan"])
        pdf.setFont("Helvetica-Bold", 7.2)
        pdf.drawCentredString(x + width / 2, y + 2, tag)
        x += width + 8


def draw_cover(
    pdf: canvas.Canvas,
    page: dict[str, Any],
    fonts: tuple[str, str],
    palette: dict[str, str],
) -> None:
    font, bold = fonts
    cx, cy = PAGE_W * 0.71, PAGE_H * 0.67
    for radius, color, alpha in (
        (128, palette["purple"], 0.10),
        (92, palette["cyan"], 0.09),
        (55, palette["gold"], 0.08),
    ):
        set_stroke(pdf, color, alpha)
        pdf.setLineWidth(0.8)
        pdf.circle(cx, cy, radius, stroke=1, fill=0)
    for angle, color in ((25, palette["purple"]), (145, palette["cyan"]), (258, palette["gold"])):
        r = 92
        x = cx + math.cos(math.radians(angle)) * r
        y = cy + math.sin(math.radians(angle)) * r
        set_fill(pdf, color, 0.85)
        pdf.circle(x, y, 4, stroke=0, fill=1)
    set_fill(pdf, palette["purple"], 0.28)
    pdf.circle(cx, cy, 38, stroke=0, fill=1)
    set_fill(pdf, palette["text"], 0.92)
    pdf.circle(cx, cy, 12, stroke=0, fill=1)

    set_fill(pdf, palette["cyan"])
    pdf.setFont("Helvetica-Bold", 9)
    draw_image_contain(pdf, LOGO_LOCKUP, MARGIN, PAGE_H - 151, 160, 65)
    pdf.drawString(MARGIN, PAGE_H - 174, page["kicker"])

    y = 390
    pdf.setFont(bold, 35)
    for line in title_lines(page):
        pdf.drawString(MARGIN, y, line)
        y -= 48
    y -= 8
    y = draw_wrapped(pdf, page["subtitle"], MARGIN, y, 410, font, 14, 23, palette["cyan"])
    y -= 18
    y = draw_wrapped(pdf, page["body"][0], MARGIN, y, 430, font, 11, 19, palette["muted"])
    draw_tags(pdf, page["tags"], MARGIN, 128, palette)
    set_fill(pdf, palette["muted"])
    pdf.setFont(font, 7.5)
    pdf.drawString(MARGIN, 76, "KIIKIS Strategic Whitepaper 2.0 · 2026.08")
    pdf.drawString(MARGIN, 60, "Confidential · Limited Distribution")
    pdf.drawString(MARGIN, 44, "本版本已省略专有技术与实施细节")
    reset_alpha(pdf)


def draw_cards(
    pdf: canvas.Canvas,
    cards: list[dict[str, str]],
    y_top: float,
    fonts: tuple[str, str],
    palette: dict[str, str],
    columns: int = 3,
) -> None:
    font, bold = fonts
    gap = 12
    width = (PAGE_W - MARGIN * 2 - gap * (columns - 1)) / columns
    rows = math.ceil(len(cards) / columns)
    height = 118 if rows == 1 else 108
    for i, card in enumerate(cards):
        col = i % columns
        row = i // columns
        x = MARGIN + col * (width + gap)
        y = y_top - (row + 1) * height - row * gap
        round_rect(pdf, x, y, width, height, palette["surface"], palette["line"], 13)
        set_fill(pdf, palette["purple"] if i % 2 == 0 else palette["cyan"])
        pdf.circle(x + 17, y + height - 21, 3.3, stroke=0, fill=1)
        set_fill(pdf, palette["text"])
        pdf.setFont(bold, 11.5)
        pdf.drawString(x + 28, y + height - 25, card["title"])
        draw_wrapped(pdf, card["text"], x + 16, y + height - 49, width - 32, font, 8.7, 14.2, palette["muted"])


def draw_statement(
    pdf: canvas.Canvas,
    page: dict[str, Any],
    y: float,
    fonts: tuple[str, str],
    palette: dict[str, str],
) -> None:
    font, bold = fonts
    y = draw_body(pdf, page, y, fonts, palette, 430)
    box_y = 230
    round_rect(pdf, MARGIN, box_y, PAGE_W - MARGIN * 2, 170, palette["surface"], palette["purple"], 20, 1, 0.45)
    set_fill(pdf, palette["purple"], 0.30)
    pdf.circle(MARGIN + 42, box_y + 124, 22, stroke=0, fill=1)
    set_fill(pdf, palette["text"])
    pdf.setFont("Helvetica-Bold", 28)
    pdf.drawCentredString(MARGIN + 42, box_y + 115, "“")
    lines = split_text(pdf, page["quote"], bold, 17, PAGE_W - MARGIN * 2 - 92)
    draw_lines(pdf, lines, MARGIN + 76, box_y + 126, bold, 17, 27, palette["text"])


def draw_layers(
    pdf: canvas.Canvas,
    page: dict[str, Any],
    y: float,
    fonts: tuple[str, str],
    palette: dict[str, str],
) -> None:
    font, bold = fonts
    layer_height = 75
    gap = 8
    for i, layer in enumerate(page["layers"]):
        width = PAGE_W - MARGIN * 2 - i * 18
        x = MARGIN + i * 9
        box_y = y - (i + 1) * layer_height - i * gap
        accent = palette["gold"] if i == 0 else (palette["purple"] if i % 2 else palette["cyan"])
        round_rect(pdf, x, box_y, width, layer_height, palette["surface"], accent, 14, 1, 0.38)
        set_fill(pdf, accent)
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(x + 15, box_y + 45, layer["index"])
        set_fill(pdf, palette["text"])
        pdf.setFont(bold, 12.5)
        pdf.drawString(x + 48, box_y + 45, layer["title"])
        draw_wrapped(pdf, layer["text"], x + 48, box_y + 24, width - 66, font, 8.6, 12.4, palette["muted"])


def draw_universe(
    pdf: canvas.Canvas,
    page: dict[str, Any],
    y: float,
    fonts: tuple[str, str],
    palette: dict[str, str],
) -> None:
    font, bold = fonts
    draw_body(pdf, page, y, fonts, palette, 430)
    cx, cy = PAGE_W / 2, 248
    for radius in (78, 132, 182):
        set_stroke(pdf, palette["line"], 0.8)
        pdf.setLineWidth(0.8)
        pdf.circle(cx, cy, radius, stroke=1, fill=0)
    set_fill(pdf, palette["purple"], 0.32)
    pdf.circle(cx, cy, 50, stroke=0, fill=1)
    set_fill(pdf, palette["text"])
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawCentredString(cx, cy + 2, "UNIVERSE")
    for i, label in enumerate(page["nodes"]):
        angle = math.radians(-5 + i * 45)
        radius = 132 if i % 2 == 0 else 182
        x = cx + math.cos(angle) * radius
        node_y = cy + math.sin(angle) * radius
        set_stroke(pdf, palette["line"], 0.8)
        pdf.line(cx, cy, x, node_y)
        set_fill(pdf, palette["cyan"] if i % 2 else palette["purple"], 0.92)
        pdf.circle(x, node_y, 11, stroke=0, fill=1)
        set_fill(pdf, palette["text"])
        pdf.setFont(font, 8.5)
        text_width = pdf.stringWidth(label, font, 8.5)
        pdf.drawString(x - text_width / 2, node_y - 25, label)


def draw_pipeline(
    pdf: canvas.Canvas,
    page: dict[str, Any],
    y: float,
    fonts: tuple[str, str],
    palette: dict[str, str],
) -> None:
    font, bold = fonts
    start_y = y - 22
    width = 152
    height = 104
    gap_x = 16
    gap_y = 18
    for i, item in enumerate(page["pipeline"]):
        row, col = divmod(i, 3)
        x = MARGIN + col * (width + gap_x)
        box_y = start_y - (row + 1) * height - row * gap_y
        round_rect(pdf, x, box_y, width, height, palette["surface"], palette["line"], 13)
        set_fill(pdf, palette["purple"] if i < 3 else palette["cyan"], 0.24)
        pdf.circle(x + 26, box_y + 71, 15, stroke=0, fill=1)
        set_fill(pdf, palette["text"])
        pdf.setFont("Helvetica-Bold", 8.5)
        pdf.drawCentredString(x + 26, box_y + 68, f"{i + 1:02d}")
        pdf.setFont(bold, 11)
        pdf.drawString(x + 50, box_y + 68, item["title"])
        draw_wrapped(pdf, item["text"], x + 17, box_y + 39, width - 34, font, 8.5, 13.5, palette["muted"])
    round_rect(pdf, MARGIN, 147, PAGE_W - MARGIN * 2, 52, palette["surfaceAlt"], palette["purple"], 12, 1, 0.35)
    draw_wrapped(pdf, page["note"], MARGIN + 18, 178, PAGE_W - MARGIN * 2 - 36, font, 9, 14, palette["text"])


def draw_steps(
    pdf: canvas.Canvas,
    page: dict[str, Any],
    y: float,
    fonts: tuple[str, str],
    palette: dict[str, str],
) -> None:
    font, bold = fonts
    for i, step in enumerate(page["steps"]):
        box_y = y - 78 - i * 89
        set_fill(pdf, palette["purple"] if i % 2 == 0 else palette["cyan"], 0.22)
        pdf.circle(MARGIN + 27, box_y + 26, 19, stroke=0, fill=1)
        set_fill(pdf, palette["text"])
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawCentredString(MARGIN + 27, box_y + 23, f"{i + 1:02d}")
        round_rect(pdf, MARGIN + 58, box_y, PAGE_W - MARGIN * 2 - 58, 54, palette["surface"], palette["line"], 12)
        draw_wrapped(pdf, step, MARGIN + 75, box_y + 33, PAGE_W - MARGIN * 2 - 92, font, 9.4, 14, palette["text"])
        if i < len(page["steps"]) - 1:
            set_stroke(pdf, palette["line"])
            pdf.line(MARGIN + 27, box_y + 7, MARGIN + 27, box_y - 16)
    set_fill(pdf, palette["gold"])
    pdf.setFont(bold, 13)
    pdf.drawCentredString(PAGE_W / 2, 130, page["quote"])


def draw_identities(
    pdf: canvas.Canvas,
    page: dict[str, Any],
    y: float,
    fonts: tuple[str, str],
    palette: dict[str, str],
) -> None:
    font, bold = fonts
    card_w = 150
    gap = 18
    box_y = 274
    for i, item in enumerate(page["identities"]):
        x = MARGIN + i * (card_w + gap)
        accent = (palette["cyan"], palette["purple"], palette["gold"])[i]
        round_rect(pdf, x, box_y, card_w, 260, palette["surface"], accent, 18, 1, 0.5)
        set_fill(pdf, accent, 0.2)
        pdf.circle(x + card_w / 2, box_y + 195, 34, stroke=0, fill=1)
        set_fill(pdf, accent)
        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawCentredString(x + card_w / 2, box_y + 192, item["label"])
        lines = split_text(pdf, item["title"], bold, 11.5, card_w - 28)
        draw_lines(pdf, lines, x + 14, box_y + 132, bold, 11.5, 18, palette["text"])
        draw_wrapped(pdf, item["text"], x + 14, box_y + 79, card_w - 28, font, 8.5, 14, palette["muted"])
    round_rect(pdf, MARGIN, 170, PAGE_W - MARGIN * 2, 58, palette["surfaceAlt"], palette["line"], 12)
    draw_wrapped(pdf, page["note"], MARGIN + 18, 205, PAGE_W - MARGIN * 2 - 36, font, 9, 14, palette["text"])


def draw_timeline(
    pdf: canvas.Canvas,
    items: list[dict[str, str]],
    y_top: float,
    fonts: tuple[str, str],
    palette: dict[str, str],
) -> None:
    font, bold = fonts
    line_x = MARGIN + 30
    set_stroke(pdf, palette["line"])
    pdf.setLineWidth(1.3)
    pdf.line(line_x, y_top - 10, line_x, y_top - 240)
    for i, item in enumerate(items):
        y = y_top - i * 112
        set_fill(pdf, palette["purple"] if i < 2 else palette["gold"])
        pdf.circle(line_x, y, 6, stroke=0, fill=1)
        set_fill(pdf, palette["cyan"])
        pdf.setFont(bold, 9)
        pdf.drawString(MARGIN + 52, y + 19, item["stage"])
        draw_wrapped(pdf, item["text"], MARGIN + 52, y - 2, PAGE_W - MARGIN * 2 - 72, font, 9.2, 15, palette["text"])


def draw_evidence(
    pdf: canvas.Canvas,
    page: dict[str, Any],
    y: float,
    fonts: tuple[str, str],
    palette: dict[str, str],
) -> None:
    font, bold = fonts
    y = draw_body(pdf, page, y, fonts, palette, 445)
    chip_w = 142
    chip_h = 64
    gap_x = 20
    gap_y = 16
    start_y = min(y - 16, 345)
    for i, item in enumerate(page["evidence"]):
        row, col = divmod(i, 3)
        x = MARGIN + col * (chip_w + gap_x)
        box_y = start_y - (row + 1) * chip_h - row * gap_y
        round_rect(pdf, x, box_y, chip_w, chip_h, palette["surface"], palette["line"], 14)
        set_fill(pdf, palette["cyan"] if i % 2 else palette["purple"], 0.28)
        pdf.circle(x + 22, box_y + 32, 10, stroke=0, fill=1)
        set_fill(pdf, palette["text"])
        pdf.setFont(bold, 9.6)
        pdf.drawString(x + 42, box_y + 28, item)


def draw_flywheel(
    pdf: canvas.Canvas,
    page: dict[str, Any],
    y: float,
    fonts: tuple[str, str],
    palette: dict[str, str],
) -> None:
    font, bold = fonts
    cx, cy = PAGE_W / 2, 305
    radius = 181
    set_stroke(pdf, palette["line"])
    pdf.setLineWidth(1.2)
    pdf.circle(cx, cy, radius, stroke=1, fill=0)
    set_fill(pdf, palette["purple"], 0.25)
    pdf.circle(cx, cy, 72, stroke=0, fill=1)
    set_fill(pdf, palette["text"])
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawCentredString(cx, cy + 7, "KIIKIS")
    pdf.setFont(font, 8.5)
    pdf.drawCentredString(cx, cy - 12, "IP ASSET FLYWHEEL")
    for i, label in enumerate(page["flywheel"]):
        angle = math.radians(90 - i * 60)
        x = cx + math.cos(angle) * radius
        node_y = cy + math.sin(angle) * radius
        set_fill(pdf, palette["purple"] if i % 2 == 0 else palette["cyan"])
        pdf.circle(x, node_y, 14, stroke=0, fill=1)
        text_w = 118
        text_x = x - text_w / 2
        text_y = node_y + (32 if node_y < cy else -36)
        lines = split_text(pdf, label, bold, 8.7, text_w)
        draw_lines(pdf, lines, text_x, text_y, bold, 8.7, 13, palette["text"])
        next_angle = math.radians(90 - ((i + 0.65) % 6) * 60)
        ax = cx + math.cos(next_angle) * radius
        ay = cy + math.sin(next_angle) * radius
        set_fill(pdf, palette["gold"])
        pdf.circle(ax, ay, 2.2, stroke=0, fill=1)


def draw_states(
    pdf: canvas.Canvas,
    page: dict[str, Any],
    y: float,
    fonts: tuple[str, str],
    palette: dict[str, str],
) -> None:
    font, bold = fonts
    width = 150
    gap = 18
    box_y = 170
    height = 390
    accents = (palette["cyan"], palette["purple"], palette["gold"])
    for i, state in enumerate(page["states"]):
        x = MARGIN + i * (width + gap)
        round_rect(pdf, x, box_y, width, height, palette["surface"], accents[i], 17, 1, 0.42)
        set_fill(pdf, accents[i])
        pdf.setFont(bold, 12)
        pdf.drawString(x + 16, box_y + height - 36, state["title"])
        cursor = box_y + height - 72
        for item in state["items"]:
            set_fill(pdf, accents[i], 0.9)
            pdf.circle(x + 19, cursor + 3, 2.6, stroke=0, fill=1)
            cursor = draw_wrapped(pdf, item, x + 30, cursor + 8, width - 46, font, 8.6, 14.2, palette["text"])
            cursor -= 18


def draw_stages(
    pdf: canvas.Canvas,
    stages: list[dict[str, str]],
    y_top: float,
    fonts: tuple[str, str],
    palette: dict[str, str],
) -> None:
    font, bold = fonts
    for i, stage in enumerate(stages):
        row, col = divmod(i, 2)
        width = 236
        height = 134
        x = MARGIN + col * (width + 18)
        box_y = y_top - (row + 1) * height - row * 18
        round_rect(pdf, x, box_y, width, height, palette["surface"], palette["line"], 16)
        set_fill(pdf, palette["purple"] if i % 2 == 0 else palette["cyan"])
        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawString(x + 18, box_y + 96, stage.get("index", f"{i + 1:02d}"))
        set_fill(pdf, palette["text"])
        pdf.setFont(bold, 12)
        pdf.drawString(x + 58, box_y + 96, stage["title"])
        draw_wrapped(pdf, stage["text"], x + 18, box_y + 66, width - 36, font, 8.8, 14.4, palette["muted"])


def draw_moats(
    pdf: canvas.Canvas,
    page: dict[str, Any],
    y: float,
    fonts: tuple[str, str],
    palette: dict[str, str],
) -> None:
    draw_cards(pdf, page["moats"], y, fonts, palette, columns=2)


def draw_roadmap(
    pdf: canvas.Canvas,
    page: dict[str, Any],
    y: float,
    fonts: tuple[str, str],
    palette: dict[str, str],
) -> None:
    font, bold = fonts
    line_y = 345
    set_stroke(pdf, palette["line"])
    pdf.setLineWidth(2)
    pdf.line(MARGIN + 60, line_y, PAGE_W - MARGIN - 60, line_y)
    width = 150
    gap = 18
    for i, item in enumerate(page["roadmap"]):
        x = MARGIN + i * (width + gap)
        center = x + width / 2
        accent = (palette["cyan"], palette["purple"], palette["gold"])[i]
        set_fill(pdf, accent)
        pdf.circle(center, line_y, 10, stroke=0, fill=1)
        set_fill(pdf, accent)
        pdf.setFont(bold, 9)
        pdf.drawCentredString(center, line_y + 32, item["stage"])
        round_rect(pdf, x, 170, width, 128, palette["surface"], accent, 15, 1, 0.4)
        set_fill(pdf, palette["text"])
        pdf.setFont(bold, 12)
        pdf.drawString(x + 15, 264, item["title"])
        draw_wrapped(pdf, item["text"], x + 15, 236, width - 30, font, 8.5, 14, palette["muted"])


def draw_closing(
    pdf: canvas.Canvas,
    page: dict[str, Any],
    fonts: tuple[str, str],
    palette: dict[str, str],
) -> None:
    font, bold = fonts
    cx, cy = PAGE_W / 2, PAGE_H * 0.63
    for radius, color, alpha in ((180, palette["purple"], 0.11), (120, palette["cyan"], 0.09), (64, palette["gold"], 0.08)):
        set_stroke(pdf, color, alpha)
        pdf.setLineWidth(0.8)
        pdf.circle(cx, cy, radius, stroke=1, fill=0)
    set_fill(pdf, palette["purple"], 0.28)
    pdf.circle(cx, cy, 44, stroke=0, fill=1)
    draw_image_contain(pdf, LOGO_MARK, cx - 27, cy - 27, 54, 54)

    y = 285
    set_fill(pdf, palette["text"])
    pdf.setFont(bold, 29)
    for line in title_lines(page):
        pdf.drawCentredString(PAGE_W / 2, y, line)
        y -= 40
    y -= 4
    set_fill(pdf, palette["cyan"])
    pdf.setFont(font, 12)
    lines = split_text(pdf, page["subtitle"], font, 12, 430)
    for line in lines:
        pdf.drawCentredString(PAGE_W / 2, y, line)
        y -= 20
    y -= 5
    set_fill(pdf, palette["muted"])
    pdf.setFont(font, 8.8)
    for line in split_text(pdf, page["body"][0], font, 8.8, 390):
        pdf.drawCentredString(PAGE_W / 2, y, line)
        y -= 14
    draw_tags(pdf, page["tags"], 102, 72, palette)


def assert_disclosure_copy(text: str) -> None:
    forbidden = (
        "投资人",
        "融资",
        "路演",
        "回报",
        "Investor Edition",
        "storyflow_",
        "/api/",
        "RLS",
        "Supabase",
        "DeepSeek",
        "Atlas Cloud",
        "SHA-256",
        "manifest.json",
    )
    lowered = text.lower()
    hits = [term for term in forbidden if term.lower() in lowered]
    if hits:
        raise ValueError(f"Forbidden whitepaper terms: {', '.join(hits)}")


def render_page(
    pdf: canvas.Canvas,
    page: dict[str, Any],
    page_number: int,
    total_pages: int,
    fonts: tuple[str, str],
    palette: dict[str, str],
) -> None:
    draw_background(pdf, palette, page_number)
    layout = page["layout"]
    if layout == "cover":
        draw_cover(pdf, page, fonts, palette)
        return
    if layout == "closing":
        draw_closing(pdf, page, fonts, palette)
        draw_footer(pdf, page_number, total_pages, fonts, palette)
        return

    draw_brand(pdf, fonts, palette)
    y = draw_header(pdf, page, fonts, palette)

    if layout in {"problem", "actor", "neutral", "customers"}:
        y = draw_body(pdf, page, y, fonts, palette, 445)
        columns = 2 if len(page["cards"]) == 4 else 3
        draw_cards(pdf, page["cards"], min(y - 12, 408), fonts, palette, columns=columns)
    elif layout == "statement":
        draw_statement(pdf, page, y, fonts, palette)
    elif layout == "layers":
        draw_layers(pdf, page, y, fonts, palette)
    elif layout == "universe":
        draw_universe(pdf, page, y, fonts, palette)
    elif layout == "pipeline":
        draw_pipeline(pdf, page, y, fonts, palette)
    elif layout == "loop":
        draw_steps(pdf, page, y, fonts, palette)
    elif layout == "identities":
        draw_identities(pdf, page, y, fonts, palette)
    elif layout == "network":
        y = draw_body(pdf, page, y, fonts, palette, 445)
        draw_timeline(pdf, page["timeline"], min(y - 18, 360), fonts, palette)
    elif layout == "evidence":
        draw_evidence(pdf, page, y, fonts, palette)
    elif layout == "flywheel":
        draw_flywheel(pdf, page, y, fonts, palette)
    elif layout == "states":
        draw_states(pdf, page, y, fonts, palette)
    elif layout == "business":
        draw_stages(pdf, page["stages"], y - 6, fonts, palette)
        round_rect(pdf, MARGIN, 132, PAGE_W - MARGIN * 2, 48, palette["surfaceAlt"], palette["line"], 12)
        draw_wrapped(pdf, page["note"], MARGIN + 18, 160, PAGE_W - MARGIN * 2 - 36, fonts[0], 8.8, 13, palette["text"])
    elif layout == "moat":
        draw_moats(pdf, page, y, fonts, palette)
    elif layout == "roadmap":
        draw_roadmap(pdf, page, y, fonts, palette)
    elif layout == "governance":
        draw_stages(pdf, page["principles"], y - 6, fonts, palette)
    else:
        raise ValueError(f"Unsupported layout: {layout}")

    draw_footer(pdf, page_number, total_pages, fonts, palette)


def main() -> None:
    for asset in (LOGO_LOCKUP, LOGO_MARK):
        if not asset.exists():
            raise FileNotFoundError(f"Missing brand asset: {asset}")
    manuscript = json.loads(MANUSCRIPT.read_text(encoding="utf-8"))
    raw_copy = json.dumps(manuscript, ensure_ascii=False)
    assert_disclosure_copy(raw_copy)
    pages = manuscript["pages"]
    if len(pages) != 22:
        raise ValueError(f"Expected 22 pages, got {len(pages)}")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    fonts = register_fonts()
    pdf = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
    pdf.setTitle(manuscript["metadata"]["title"])
    pdf.setAuthor("KIIKIS")
    pdf.setSubject(manuscript["metadata"]["subtitle"])
    pdf.setCreator("KIIKIS Whitepaper Generator")

    for index, page in enumerate(pages, start=1):
        render_page(pdf, page, index, len(pages), fonts, manuscript["palette"])
        pdf.showPage()
    pdf.save()
    print(f"{len(pages)} pages generated: {OUTPUT}")


if __name__ == "__main__":
    main()
