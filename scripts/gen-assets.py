#!/usr/bin/env python3
"""Generate icon.png and splash.png for Daily Research app."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
import random
import os

OUT = Path(__file__).parent.parent / "assets"
OUT.mkdir(parents=True, exist_ok=True)

# palette
PAPER = (243, 237, 225)
PAPER_DARK = (233, 224, 207)
INK = (28, 26, 23)
INK_SOFT = (90, 84, 74)
RUST = (177, 67, 42)
LINE = (214, 202, 178)

def find_font(size, bold=False):
    """Try Fraunces > Georgia Bold > Helvetica."""
    candidates = []
    if bold:
        candidates += [
            "/Library/Fonts/Fraunces-Black.ttf",
            "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
            "/System/Library/Fonts/Avenir Next.ttc",
        ]
    candidates += [
        "/System/Library/Fonts/Supplemental/Georgia.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()

def add_grain(img, intensity=8):
    """Add subtle paper-like grain."""
    pixels = img.load()
    w, h = img.size
    rng = random.Random(7)
    for y in range(h):
        for x in range(w):
            if rng.random() < 0.05:
                r, g, b = pixels[x, y][:3]
                d = rng.randint(-intensity, intensity)
                pixels[x, y] = (
                    max(0, min(255, r + d)),
                    max(0, min(255, g + d)),
                    max(0, min(255, b + d)),
                    255,
                )
    return img

def make_icon(size=1024):
    img = Image.new("RGBA", (size, size), PAPER + (255,))
    draw = ImageDraw.Draw(img)

    # subtle inner border
    margin = int(size * 0.08)
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=int(size * 0.04),
        outline=LINE + (255,),
        width=max(2, int(size * 0.005)),
    )

    # rust accent dot in top-left
    dot_r = int(size * 0.025)
    dot_cx = margin + int(size * 0.08)
    dot_cy = margin + int(size * 0.08)
    draw.ellipse(
        [dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r],
        fill=RUST + (255,),
    )

    # tiny "DAILY" kicker at top
    kicker_font = find_font(int(size * 0.06))
    kicker = "DAILY"
    try:
        bbox = draw.textbbox((0, 0), kicker, font=kicker_font)
        kw = bbox[2] - bbox[0]
    except Exception:
        kw = int(size * 0.18)
    draw.text(
        ((size - kw) / 2, margin + int(size * 0.05)),
        kicker,
        font=kicker_font,
        fill=INK_SOFT + (255,),
        spacing=int(size * 0.015),
    )

    # big serif "R" in the middle
    r_font = find_font(int(size * 0.62), bold=True)
    text = "R"
    try:
        bbox = draw.textbbox((0, 0), text, font=r_font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        # adjust for baseline
        draw.text(
            ((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1] + int(size * 0.02)),
            text,
            font=r_font,
            fill=INK + (255,),
        )
    except Exception:
        draw.text((size * 0.32, size * 0.22), text, font=r_font, fill=INK + (255,))

    # bottom label "research"
    label_font = find_font(int(size * 0.06))
    label = "research"
    try:
        bbox = draw.textbbox((0, 0), label, font=label_font)
        lw = bbox[2] - bbox[0]
    except Exception:
        lw = int(size * 0.3)
    draw.text(
        ((size - lw) / 2, size - margin - int(size * 0.13)),
        label,
        font=label_font,
        fill=INK_SOFT + (255,),
    )

    img = add_grain(img, intensity=6)
    return img

def make_splash(w=1242, h=2688):
    img = Image.new("RGBA", (w, h), PAPER + (255,))
    draw = ImageDraw.Draw(img)

    # top hairline
    top_y = int(h * 0.42)
    draw.line([(int(w * 0.18), top_y), (int(w * 0.82), top_y)], fill=INK + (255,), width=2)

    # kicker
    kicker_font = find_font(int(w * 0.04))
    kicker = "DAILY"
    bbox = draw.textbbox((0, 0), kicker, font=kicker_font)
    kw = bbox[2] - bbox[0]
    draw.text(
        ((w - kw) / 2, top_y + int(h * 0.025)),
        kicker,
        font=kicker_font,
        fill=INK_SOFT + (255,),
    )

    # big serif "Research"
    title_font = find_font(int(w * 0.16), bold=True)
    title = "Research"
    bbox = draw.textbbox((0, 0), title, font=title_font)
    tw = bbox[2] - bbox[0]
    draw.text(
        ((w - tw) / 2 - bbox[0], top_y + int(h * 0.07)),
        title,
        font=title_font,
        fill=INK + (255,),
    )

    # rust dot
    dot_r = int(w * 0.015)
    dy = top_y + int(h * 0.17)
    draw.ellipse(
        [w / 2 - dot_r, dy - dot_r, w / 2 + dot_r, dy + dot_r],
        fill=RUST + (255,),
    )

    # tagline
    tag_font = find_font(int(w * 0.034))
    tag = "One paper a day, read in full."
    bbox = draw.textbbox((0, 0), tag, font=tag_font)
    tw = bbox[2] - bbox[0]
    draw.text(
        ((w - tw) / 2, dy + int(h * 0.018)),
        tag,
        font=tag_font,
        fill=INK_SOFT + (255,),
    )

    img = add_grain(img, intensity=4)
    return img

print("Generating icon.png (1024x1024)…")
icon = make_icon(1024)
icon.save(OUT / "icon.png", "PNG")

print("Generating splash.png (1242x2688)…")
splash = make_splash()
splash.save(OUT / "splash.png", "PNG")

print(f"Done. Files in {OUT}")
