#!/usr/bin/env python3
"""Create the transparent derivative of the approved Halloween Map wordmark.

The official WebP is intentionally retained byte-for-byte as the canonical
source. We remove only its nearly black matte; glyphs, gradients, typography,
layout and 'by DomotiK Studio' remain the source pixels.
"""
from __future__ import annotations

from pathlib import Path
from statistics import median

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "artwork/branding/halloween-map-wordmark-official.webp"
DESTINATIONS = (
    ROOT / "artwork/branding/halloween-map-wordmark-transparent.png",
    ROOT / "public/brand/halloween-map-wordmark-transparent.png",
)


def render() -> Image.Image:
    original = Image.open(SOURCE).convert("RGB")
    width, height = original.size
    samples = []
    for left, top in ((0, 0), (width - 8, 0), (0, height - 8), (width - 8, height - 8)):
        for y in range(top, top + 8):
            for x in range(left, left + 8):
                samples.append(original.getpixel((x, y)))
    background = tuple(int(median(c[channel] for c in samples)) for channel in range(3))
    result = Image.new("RGBA", (width, height))
    pix_in = original.load()
    pix_out = result.load()

    # WebP's lossy black/navy matte includes subtle codec noise. Only chromatic
    # or bright pixels above that noise are part of the official wordmark.
    for y in range(height):
        for x in range(width):
            color = pix_in[x, y]
            # The right-hand lower half belongs to the original matte, not
            # the two-line logo or the small Studio signature. This region
            # contains a purple codec/glow remnant in the source WebP.
            if y >= int(height * 0.50) and x >= int(width * 0.68):
                pix_out[x, y] = (0, 0, 0, 0)
                continue
            signal = max(color[i] - background[i] for i in range(3))
            if signal <= 11:
                pix_out[x, y] = (0, 0, 0, 0)
                continue
            alpha = min(255, max(0, round((signal - 11) * 255 / 39)))
            if alpha < 6:
                pix_out[x, y] = (0, 0, 0, 0)
                continue
            # Preserve the *original* pixel colours exactly, including warm
            # orange and violet gradients. Only transparency is changed.
            pix_out[x, y] = (*color, alpha)
    return result


def main() -> None:
    result = render()
    if result.getpixel((0, 0))[3] != 0:
        raise SystemExit("Logo matte removal failed: top-left pixel not transparent")
    opaque = sum(result.getchannel("A").histogram()[240:])
    if opaque < 100:
        raise SystemExit("Logo matte removal failed: no visible foreground")
    for path in DESTINATIONS:
        path.parent.mkdir(parents=True, exist_ok=True)
        result.save(path, format="PNG", optimize=True)
        print(f"Generated {path.relative_to(ROOT)} ({result.width}x{result.height}, RGBA)")


if __name__ == "__main__":
    main()
