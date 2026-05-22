#!/usr/bin/env python3
"""Generate complete brand asset set for Daily Research.

Outputs:
  assets/icon.png            (1024×1024)  — app icon
  assets/icon-dark.png       (1024×1024)  — dark variant
  assets/splash.png          (1242×2688)  — launch splash
  assets/wordmark.png        (1600×400)   — horizontal wordmark
  assets/wordmark-light.png  (1600×400)   — dark-bg wordmark
  assets/social-preview.png  (1280×640)   — GitHub/OG card
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
import random
import os

ROOT = Path(__file__).parent.parent
OUT = ROOT / "assets"
OUT.mkdir(parents=True, exist_ok=True)

# ─── Brand palette ───────────────────────────────────────────
PAPER       = (243, 237, 225)
PAPER_DARK  = (233, 224, 207)
INK         = (28, 26, 23)
INK_SOFT    = (90, 84, 74)
INK_FAINT   = (130, 124, 114)
RUST        = (177, 67, 42)
LINE        = (214, 202, 178)

# ─── Font discovery ──────────────────────────────────────────
def find_font(size, weight="regular"):
    candidates = {
        "black":   ["/System/Library/Fonts/Supplemental/Georgia Bold.ttf"],
        "bold":    ["/System/Library/Fonts/Supplemental/Georgia Bold.ttf"],
        "regular": ["/System/Library/Fonts/Supplemental/Georgia.ttf"],
        "italic":  ["/System/Library/Fonts/Supplemental/Georgia Italic.ttf"],
        "mono":    ["/System/Library/Fonts/Menlo.ttc",
                    "/System/Library/Fonts/Monaco.dfont"],
    }.get(weight, [])
    candidates.append("/System/Library/Fonts/Helvetica.ttc")
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()


def grain(img, intensity=6, density=0.05, seed=7):
    """Apply subtle paper-like noise."""
    pixels = img.load()
    w, h = img.size
    rng = random.Random(seed)
    for y in range(h):
        for x in range(w):
            if rng.random() < density:
                r, g, b = pixels[x, y][:3]
                d = rng.randint(-intensity, intensity)
                pixels[x, y] = (
                    max(0, min(255, r + d)),
                    max(0, min(255, g + d)),
                    max(0, min(255, b + d)),
                    255,
                )
    return img


def measure(draw, text, font):
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1], bbox[0], bbox[1]


# ─── Core mark: serif "R" with a period ──────────────────────
def draw_rmark(draw, size, cx, cy, ink_color, dot_color, scale=0.62):
    """Draws the 'R.' wordmark centered at (cx, cy)."""
    r_font = find_font(int(size * scale), "black")
    r_w, r_h, r_dx, r_dy = measure(draw, "R", r_font)
    text_x = cx - r_w / 2 - r_dx
    text_y = cy - r_h / 2 - r_dy
    draw.text((text_x, text_y), "R", font=r_font, fill=ink_color + (255,))

    # Period — small filled circle baseline-aligned
    dot_r = int(size * 0.04)
    dot_cx = text_x + r_dx + r_w + dot_r * 1.5
    dot_cy = text_y + r_dy + r_h - dot_r
    draw.ellipse(
        [dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r],
        fill=dot_color + (255,),
    )


# ─── App icon (light) ────────────────────────────────────────
def make_icon(size=1024, dark=False):
    bg = INK if dark else PAPER
    fg = PAPER if dark else INK
    sub = INK_FAINT if dark else INK_SOFT
    edge = INK_SOFT if dark else LINE

    img = Image.new("RGBA", (size, size), bg + (255,))
    draw = ImageDraw.Draw(img)

    # Inner frame
    margin = int(size * 0.09)
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=int(size * 0.05),
        outline=edge + (255,),
        width=max(2, int(size * 0.004)),
    )

    # Top kicker
    kicker_font = find_font(int(size * 0.05), "regular")
    kicker = "DAILY  ·  RESEARCH"
    k_w, _, k_dx, _ = measure(draw, kicker, kicker_font)
    draw.text(
        ((size - k_w) / 2 - k_dx, margin + int(size * 0.06)),
        kicker,
        font=kicker_font,
        fill=sub + (255,),
    )

    # Hairline under kicker
    hl_y = margin + int(size * 0.16)
    draw.line(
        [(int(size * 0.32), hl_y), (int(size * 0.68), hl_y)],
        fill=edge + (255,),
        width=2,
    )

    # Big "R." mark
    draw_rmark(
        draw,
        size=size,
        cx=size / 2,
        cy=size / 2 + int(size * 0.04),
        ink_color=fg,
        dot_color=RUST,
        scale=0.58,
    )

    # Bottom signature line
    sig_y = size - margin - int(size * 0.07)
    sig_font = find_font(int(size * 0.038), "italic")
    sig = "one paper a day"
    s_w, _, s_dx, _ = measure(draw, sig, sig_font)
    draw.text(
        ((size - s_w) / 2 - s_dx, sig_y - int(size * 0.04)),
        sig,
        font=sig_font,
        fill=sub + (255,),
    )

    img = grain(img, intensity=5, density=0.04, seed=11 if dark else 7)
    return img


# ─── Splash ──────────────────────────────────────────────────
def make_splash(w=1242, h=2688):
    img = Image.new("RGBA", (w, h), PAPER + (255,))
    draw = ImageDraw.Draw(img)

    # Centered composition
    top_y = int(h * 0.38)

    # Kicker
    kicker_font = find_font(int(w * 0.034), "regular")
    kicker = "DAILY  ·  RESEARCH"
    k_w, _, k_dx, _ = measure(draw, kicker, kicker_font)
    draw.text(
        ((w - k_w) / 2 - k_dx, top_y),
        kicker,
        font=kicker_font,
        fill=INK_SOFT + (255,),
    )

    # Hairline
    hl_y = top_y + int(h * 0.05)
    draw.line(
        [(int(w * 0.30), hl_y), (int(w * 0.70), hl_y)],
        fill=LINE + (255,),
        width=3,
    )

    # Big "R."
    draw_rmark(
        draw,
        size=w,
        cx=w / 2,
        cy=hl_y + int(h * 0.13),
        ink_color=INK,
        dot_color=RUST,
        scale=0.32,
    )

    # Tagline
    tag_font = find_font(int(w * 0.034), "italic")
    tag = "one paper a day, read in full"
    t_w, _, t_dx, _ = measure(draw, tag, tag_font)
    draw.text(
        ((w - t_w) / 2 - t_dx, hl_y + int(h * 0.20)),
        tag,
        font=tag_font,
        fill=INK_SOFT + (255,),
    )

    img = grain(img, intensity=3, density=0.02, seed=13)
    return img


# ─── Wordmark (horizontal) ───────────────────────────────────
def make_wordmark(w=1600, h=400, dark=False):
    bg = INK if dark else PAPER
    fg = PAPER if dark else INK
    sub = INK_FAINT if dark else INK_SOFT
    edge = INK_SOFT if dark else LINE

    img = Image.new("RGBA", (w, h), bg + (255,))
    draw = ImageDraw.Draw(img)

    # Left R-mark sized to canvas height
    pad_l = int(w * 0.05)
    r_size = int(h * 0.55)
    r_font = find_font(r_size, "black")
    r_w, r_h, r_dx, r_dy = measure(draw, "R", r_font)
    r_x = pad_l - r_dx
    r_y = (h - r_h) / 2 - r_dy
    draw.text((r_x, r_y), "R", font=r_font, fill=fg + (255,))

    # Rust period
    dot_r = int(h * 0.045)
    dot_cx = r_x + r_dx + r_w + dot_r * 1.2
    dot_cy = r_y + r_dy + r_h - dot_r
    draw.ellipse(
        [dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r],
        fill=RUST + (255,),
    )

    # Divider
    div_x = int(dot_cx + dot_r * 4)
    draw.line(
        [(div_x, int(h * 0.28)), (div_x, int(h * 0.72))],
        fill=edge + (255,),
        width=2,
    )

    # Wordmark title
    title_font = find_font(int(h * 0.28), "bold")
    title = "Daily Research"
    t_w, t_h, t_dx, t_dy = measure(draw, title, title_font)
    title_x = div_x + int(h * 0.10) - t_dx
    title_y = int(h * 0.20)
    draw.text((title_x, title_y), title, font=title_font, fill=fg + (255,))

    # Tagline beneath
    sub_font = find_font(int(h * 0.11), "italic")
    sub_text = "one paper a day"
    draw.text(
        (title_x + t_dx, title_y + t_h + int(h * 0.08)),
        sub_text,
        font=sub_font,
        fill=sub + (255,),
    )

    img = grain(img, intensity=4, density=0.03, seed=17 if dark else 19)
    return img


# ─── Social preview (1280×640 — GitHub OG card) ──────────────
def make_social(w=1280, h=640):
    img = Image.new("RGBA", (w, h), PAPER + (255,))
    draw = ImageDraw.Draw(img)

    # Frame
    margin = 60
    draw.rounded_rectangle(
        [margin, margin, w - margin, h - margin],
        radius=18,
        outline=LINE + (255,),
        width=3,
    )

    # Top kicker bar
    kicker_font = find_font(28, "regular")
    kicker = "DAILY  ·  RESEARCH"
    k_w, _, k_dx, _ = measure(draw, kicker, kicker_font)
    draw.text(
        ((w - k_w) / 2 - k_dx, margin + 38),
        kicker,
        font=kicker_font,
        fill=INK_SOFT + (255,),
    )

    # Hairline
    draw.line(
        [(int(w * 0.34), margin + 92), (int(w * 0.66), margin + 92)],
        fill=LINE + (255,),
        width=2,
    )

    # Big title
    title_font = find_font(120, "bold")
    title = "Daily Research"
    t_w, _, t_dx, _ = measure(draw, title, title_font)
    draw.text(
        ((w - t_w) / 2 - t_dx, margin + 130),
        title,
        font=title_font,
        fill=INK + (255,),
    )

    # Rust period after title
    dot_r = 10
    period_x = (w + t_w) / 2 + 4
    period_y = margin + 130 + 110
    draw.ellipse(
        [period_x - dot_r, period_y - dot_r, period_x + dot_r, period_y + dot_r],
        fill=RUST + (255,),
    )

    # Tagline
    tag_font = find_font(36, "italic")
    tag = "one paper a day, read in full"
    tw, _, tdx, _ = measure(draw, tag, tag_font)
    draw.text(
        ((w - tw) / 2 - tdx, margin + 290),
        tag,
        font=tag_font,
        fill=INK_SOFT + (255,),
    )

    # Feature row at bottom
    feat_font = find_font(22, "mono")
    feats = "iOS  ·  React Native  ·  Claude  ·  Gemini  ·  ELI5 chatbot"
    fw, _, fdx, _ = measure(draw, feats, feat_font)
    draw.text(
        ((w - fw) / 2 - fdx, h - margin - 48),
        feats,
        font=feat_font,
        fill=INK_FAINT + (255,),
    )

    img = grain(img, intensity=3, density=0.02, seed=23)
    return img


# ─── Generate everything ─────────────────────────────────────
if __name__ == "__main__":
    print("Generating icon.png (1024×1024)…")
    make_icon(1024).save(OUT / "icon.png", "PNG")

    print("Generating icon-dark.png (1024×1024)…")
    make_icon(1024, dark=True).save(OUT / "icon-dark.png", "PNG")

    print("Generating splash.png (1242×2688)…")
    make_splash().save(OUT / "splash.png", "PNG")

    print("Generating wordmark.png (1600×400)…")
    make_wordmark().save(OUT / "wordmark.png", "PNG")

    print("Generating wordmark-light.png (1600×400)…")
    make_wordmark(dark=True).save(OUT / "wordmark-light.png", "PNG")

    print("Generating social-preview.png (1280×640)…")
    make_social().save(OUT / "social-preview.png", "PNG")

    print(f"\n✓ All brand assets written to {OUT}")
