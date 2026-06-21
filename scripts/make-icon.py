#!/usr/bin/env python3
"""Generate Kataku's app icon, splash logo, and Android adaptive assets.

The mark is a periodic-table-style element tile: the atomic number "4" (the
four languages) top-left, the symbol "Ka" (Kataku) centered, in a thick sans
on the app's warm cream. Colors mirror src/theme.ts (cream/ink/accent green).

    python3 scripts/make-icon.py    # writes the PNGs under assets/

One source image per asset is enough — `expo prebuild` (run by EAS) derives
every required size from these. Pillow only; no network, no extra deps beyond
what's already on the machine.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ASSETS = Path(__file__).resolve().parent.parent / "assets"

CREAM = (244, 240, 232, 255)   # #F4F0E8  theme light bg (warm cream paper)
INK = (42, 38, 32, 255)        # #2A2620  warm near-black ink
GREEN = (11, 124, 69, 255)     # #0B7C45  accent green, deepened for cream
FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_PATH, size)


def draw_mark(d: ImageDraw.ImageDraw, s: int, *, frame: bool) -> None:
    """Draw the '4' + 'Ka' element mark (and optional tile frame) onto d."""
    if frame:
        inset = round(s * 0.094)
        d.rounded_rectangle(
            [inset, inset, s - inset, s - inset],
            radius=round(s * 0.086),
            outline=GREEN,
            width=max(2, round(s * 0.010)),
        )
        num_x, num_y = round(s * 0.15), round(s * 0.135)
    else:
        num_x, num_y = round(s * 0.205), round(s * 0.20)

    # Atomic number "4" — small, top-left, accent green.
    d.text((num_x, num_y), "4", font=font(round(s * 0.16)), fill=GREEN, anchor="la")
    # Symbol "Ka" — large, centered, ink. anchor mm = centered on the point.
    d.text((s / 2, s * 0.575), "Ka", font=font(round(s * 0.42)), fill=INK, anchor="mm")


def app_icon(s: int = 1024) -> Image.Image:
    """Full-bleed cream tile (no alpha — iOS rejects icons with transparency)."""
    img = Image.new("RGB", (s, s), CREAM[:3])
    draw_mark(ImageDraw.Draw(img), s, frame=True)
    return img


def splash_logo(s: int = 1024) -> Image.Image:
    """The tile as a card lifted off the cream splash: soft shadow + frame."""
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    m = round(s * 0.12)
    rect = [m, m, s - m, s - m]
    radius = round(s * 0.11)

    shadow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ds = ImageDraw.Draw(shadow)
    ds.rounded_rectangle([m, m + round(s * 0.012), s - m, s - m + round(s * 0.012)],
                         radius=radius, fill=(42, 38, 32, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(round(s * 0.022)))
    img.alpha_composite(shadow)

    d = ImageDraw.Draw(img)
    d.rounded_rectangle(rect, radius=radius, fill=CREAM, outline=GREEN, width=max(2, round(s * 0.009)))
    # Mark, scaled to sit inside the card.
    inner = round(s * 0.155)
    d.text((m + inner, m + round(s * 0.085)), "4", font=font(round(s * 0.135)), fill=GREEN, anchor="la")
    d.text((s / 2, s * 0.585), "Ka", font=font(round(s * 0.355)), fill=INK, anchor="mm")
    return img


def android_foreground(s: int = 1024) -> Image.Image:
    """Adaptive foreground: the mark only (no frame — masks clip corners),
    kept inside the central safe zone, on transparent. Background is the cream
    set in app.json (android.adaptiveIcon.backgroundColor)."""
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Group "4" + "Ka" near center so the circular/squircle mask never clips.
    d.text((s * 0.355, s * 0.345), "4", font=font(round(s * 0.12)), fill=GREEN, anchor="mm")
    d.text((s / 2, s * 0.565), "Ka", font=font(round(s * 0.30)), fill=INK, anchor="mm")
    return img


def android_monochrome(s: int = 1024) -> Image.Image:
    """Themed-icon silhouette: one flat color the system recolors."""
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    black = (0, 0, 0, 255)
    d.text((s * 0.355, s * 0.345), "4", font=font(round(s * 0.12)), fill=black, anchor="mm")
    d.text((s / 2, s * 0.565), "Ka", font=font(round(s * 0.30)), fill=black, anchor="mm")
    return img


def main() -> None:
    app_icon().save(ASSETS / "icon.png")
    splash_logo().save(ASSETS / "splash-icon.png")
    android_foreground().save(ASSETS / "android-icon-foreground.png")
    android_monochrome().save(ASSETS / "android-icon-monochrome.png")
    app_icon().resize((196, 196), Image.LANCZOS).convert("RGB").save(ASSETS / "favicon.png")
    print("wrote: icon.png splash-icon.png android-icon-foreground.png "
          "android-icon-monochrome.png favicon.png")


if __name__ == "__main__":
    main()
