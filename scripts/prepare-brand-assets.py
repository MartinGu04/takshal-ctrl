#!/usr/bin/env python3
"""
Derives the web-ready brand assets in src/assets/brand/ from the originals in brand/source/.

The logos are never redrawn or recoloured. Two lossless-in-appearance steps are applied:

1. Crop away empty canvas around the artwork (plus a small safety margin).
2. Colour-to-alpha against the artwork's flat background colour (GIMP's algorithm):
   each pixel becomes the most transparent colour that, composited over that background,
   reproduces the original pixel exactly. Over the original background the result is
   pixel-identical; over the portal's dark backdrops it sits without a visible box.

For המחלבה, the emblem's own circular night sky is kept fully opaque and untouched; only the
canvas outside the emblem is made transparent.

The 502 insignia already have transparency and are only cropped and downscaled.

Usage: python3 scripts/prepare-brand-assets.py   (requires Pillow + numpy)
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "brand" / "source"
OUT = ROOT / "src" / "assets" / "brand"


def content_box(rgb: np.ndarray, bg: tuple[int, int, int], threshold: int, pad: int):
    diff = np.abs(rgb.astype(int) - np.array(bg)).max(axis=2)
    ys, xs = np.nonzero(diff > threshold)
    h, w = diff.shape
    return max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + pad + 1, w), min(ys.max() + pad + 1, h)


def colour_to_alpha(rgb: np.ndarray, bg: tuple[int, int, int]) -> np.ndarray:
    p = rgb.astype(np.float64) / 255.0
    b = np.array(bg, dtype=np.float64) / 255.0
    # Per channel, the alpha needed to reach p from b.
    up = np.where(p > b, (p - b) / np.maximum(1.0 - b, 1e-6), 0.0)
    down = np.where(p < b, (b - p) / np.maximum(b, 1e-6), 0.0)
    alpha = np.clip(np.maximum(up, down).max(axis=2), 0.0, 1.0)
    safe = np.maximum(alpha, 1e-6)[..., None]
    colour = np.clip((p - b) / safe + b, 0.0, 1.0)
    colour[alpha == 0] = 0.0
    out = np.dstack([colour, alpha]) * 255.0
    return np.round(out).astype(np.uint8)


def logo(name: str, source: str, bg: tuple[int, int, int], pad: int = 16, keep_disc=None, max_width=None):
    """keep_disc=(cx, cy, r) in source pixels: an area kept fully opaque and untouched (an emblem's own backdrop)."""
    rgb = np.asarray(Image.open(SRC / source).convert("RGB"))
    x0, y0, x1, y1 = content_box(rgb, bg, threshold=10, pad=pad)
    crop = rgb[y0:y1, x0:x1]
    rgba = colour_to_alpha(crop, bg)
    # Near-invisible residue (compression noise in the flat background) → fully transparent.
    rgba[rgba[..., 3] < 10] = 0
    if keep_disc:
        cx, cy, r = keep_disc
        yy, xx = np.mgrid[y0:y1, x0:x1]
        inside = (xx - cx) ** 2 + (yy - cy) ** 2 <= r**2
        rgba[inside, :3] = crop[inside]
        rgba[inside, 3] = 255
    img = Image.fromarray(rgba, "RGBA")
    if max_width and img.size[0] > max_width:
        img = img.resize((max_width, round(img.size[1] * max_width / img.size[0])), Image.Resampling.LANCZOS)
    # Sources are themselves lossy; high-quality lossy keeps them visually identical at a fraction of the size.
    img.save(OUT / f"{name}.webp", quality=90, alpha_quality=90, method=6)

    # Proof of fidelity: the derived asset composited back over the original background, at source scale.
    back = Image.open(OUT / f"{name}.webp").convert("RGBA").resize((x1 - x0, y1 - y0), Image.Resampling.LANCZOS)
    back = Image.alpha_composite(Image.new("RGBA", back.size, (*bg, 255)), back)
    err = np.abs(np.asarray(back.convert("RGB")).astype(int) - crop.astype(int))
    print(f"{name}.webp  {img.size[0]}x{img.size[1]}  crop=({x0},{y0})-({x1},{y1})  "
          f"re-composite error: mean {err.mean():.2f}, p99 {np.percentile(err, 99):.0f} / 255")


def insignia(name: str, source: str, height: int):
    img = Image.open(SRC / source).convert("RGBA")
    alpha = np.asarray(img)[..., 3]
    ys, xs = np.nonzero(alpha > 24)
    img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    width = round(img.size[0] * height / img.size[1])
    img = img.resize((width, height), Image.Resampling.LANCZOS)
    img.save(OUT / f"{name}.webp", quality=92, method=6)
    print(f"{name}.webp  {img.size[0]}x{img.size[1]}")


def notification_icon(name: str, source: str, box: tuple[int, int, int, int], background: tuple[int, int, int], size: int = 192, circle: bool = False):
    """
    Square notification icon: a crop of the supplied artwork (never redrawn), centred on the
    artwork's own background colour. With circle=True only the inscribed disc is kept (so
    neighbouring artwork does not bleed in). Written to public/icons/ so it is served same-origin.
    """
    art = Image.open(SRC / source).convert("RGB").crop(box)
    if circle:
        from PIL import ImageDraw
        mask = Image.new("L", art.size, 0)
        ImageDraw.Draw(mask).ellipse((0, 0, art.size[0] - 1, art.size[1] - 1), fill=255)
        art = Image.composite(art, Image.new("RGB", art.size, background), mask)
    side = max(art.size)
    canvas = Image.new("RGB", (side, side), background)
    canvas.paste(art, ((side - art.size[0]) // 2, (side - art.size[1]) // 2))
    canvas = canvas.resize((size, size), Image.Resampling.LANCZOS)
    path = ROOT / "public" / "icons" / f"{name}.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path, optimize=True)
    print(f"icons/{name}.png  {size}x{size}")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    logo("avaria-logo", "avaria-logo.png", bg=(0, 0, 0))
    # The emblem's circular night sky is part of the logo: keep it opaque, exactly as supplied.
    logo("machlava-logo", "machlava-logo.webp", bg=(5, 12, 39), keep_disc=(623, 453, 411), max_width=960)
    insignia("502-strategic-communication", "502-strategic-communication.webp", height=160)
    insignia("502-satcom", "502-satcom.webp", height=160)
    # Notification icons: the Avaria mark (without the wordmark) and the המחלבה emblem disc.
    notification_icon("notify-avaria-192", "avaria-logo.png", box=(140, 270, 660, 670), background=(0, 0, 0))
    notification_icon("notify-machlava-192", "machlava-logo.webp", box=(208, 38, 1038, 868), background=(5, 12, 39), circle=True)
