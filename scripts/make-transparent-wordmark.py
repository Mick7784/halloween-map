#!/usr/bin/env python3
"""Create a transparent cutout of the untouched official Halloween Map wordmark.

The original artwork/branding/halloween-map-wordmark-official.webp remains
unchanged and is the source of truth. Only a derived RGBA PNG is generated.
"""
from pathlib import Path
from PIL import Image

SOURCE = Path("artwork/branding/halloween-map-wordmark-official.webp")
OUT = Path("artwork/branding/halloween-map-wordmark-transparent.png")
PUBLIC = Path("public/brand/halloween-map-wordmark-transparent.png")


def create_cutout() -> None:
    original = Image.open(SOURCE).convert("RGB")
    width, height = original.size
    if width < 100 or height < 40:
        raise ValueError(f"Unexpected official wordmark dimensions: {original.size}")

    # The original has a very dark, nearly uniform rectangular matte. Estimate
    # its color from four corners; do not alter the official lettering or shapes.
    px = original.load()
    corners = [px[x, y] for x, y in
               [(0, 0), (width-1, 0), (0, height-1), (width-1, height-1)]]
    bg = tuple(sorted(c[i] for c in corners)[2] for i in range(3))
    result = Image.new("RGBA", (width, height))
    outpx = result.load()
    for y in range(height):
        for x in range(width):
            rgb = px[x, y]
            # Suppress the original dark matte and compressed near-black noise.
            # Grayscale text antialiasing and colored pumpkin edges receive
            # continuous transparency, not hard-edged pixel deletion.
            separation = max(0, max(rgb[i] - bg[i] for i in range(3)))
            alpha = max(0, min(255, round((separation - 10) * 255 / 41)))
            if alpha == 0:
                outpx[x, y] = (0, 0, 0, 0)
            elif alpha == 255:
                outpx[x, y] = (*rgb, 255)
            else:
                f = alpha / 255
                cleaned = tuple(max(0, min(255, round((rgb[i] - bg[i] * (1-f))/f)))
                                for i in range(3))
                outpx[x, y] = (*cleaned, alpha)

    if result.getpixel((0, 0))[3] != 0:
        raise AssertionError("The corner must be fully transparent")
    if max(a for *_, a in result.getdata()) < 255:
        raise AssertionError("Foreground disappeared during extraction")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    result.save(OUT, format="PNG", optimize=True)
    PUBLIC.write_bytes(OUT.read_bytes())
    print(f"Created official RGBA wordmark {width}x{height} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    create_cutout()
