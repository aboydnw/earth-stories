"""Draw the Earth Stories product mark and pack it into macOS icon formats.

The mark is generated rather than hand-drawn so it can be regenerated at any
size, and so a reviewer can read the shapes as code instead of diffing a
binary. It is a placeholder: cleared artwork is still required before a public
release.
"""

from __future__ import annotations

import struct
import sys
from pathlib import Path

from PIL import Image, ImageDraw

PAPER = (245, 243, 240, 255)
INK = (68, 63, 63, 255)
ACCENT = (207, 63, 2, 255)

MASTER = 1024
SUPERSAMPLE = 4

# OSType, pixel size. PNG data is valid for every one of these.
ICNS_ENTRIES = [
    (b"icp4", 16),
    (b"icp5", 32),
    (b"icp6", 64),
    (b"ic07", 128),
    (b"ic08", 256),
    (b"ic09", 512),
    (b"ic10", 1024),
    (b"ic11", 32),
    (b"ic12", 64),
    (b"ic13", 256),
    (b"ic14", 512),
]


def draw_mark(size: int) -> Image.Image:
    """Render the mark: a warm tile, the earth's horizon, and a low sun."""
    scale = size * SUPERSAMPLE
    image = Image.new("RGBA", (scale, scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    unit = scale / 1024

    # macOS rounds and masks the tile itself, but a rounded ground keeps the
    # mark legible anywhere else it is shown.
    draw.rounded_rectangle(
        (0, 0, scale - 1, scale - 1), radius=int(184 * unit), fill=PAPER
    )

    # The horizon is the top of a circle far wider than the tile, so the
    # curve reads as a gentle planetary edge rather than a bowl, and the dark
    # mass stays in the lower third where it cannot swallow the sky.
    horizon_radius = 1400 * unit
    horizon_top = 640 * unit
    horizon_centre_y = horizon_top + horizon_radius
    draw.ellipse(
        (
            scale / 2 - horizon_radius,
            horizon_centre_y - horizon_radius,
            scale / 2 + horizon_radius,
            horizon_centre_y + horizon_radius,
        ),
        fill=INK,
    )

    # The sun sits well clear of the horizon: at 16 pixels the gap between the
    # two shapes is what stops them reading as a single blob.
    sun_radius = 115 * unit
    sun_x = 660 * unit
    sun_y = 360 * unit
    draw.ellipse(
        (
            sun_x - sun_radius,
            sun_y - sun_radius,
            sun_x + sun_radius,
            sun_y + sun_radius,
        ),
        fill=ACCENT,
    )

    return image.resize((size, size), Image.LANCZOS)


def build_icns(master: Image.Image, destination: Path) -> None:
    """Pack PNG renditions into an .icns container."""
    chunks: list[bytes] = []
    for ostype, size in ICNS_ENTRIES:
        rendition = master if size == MASTER else draw_mark(size)
        png_path = destination.parent / f".icon-{size}-{ostype.decode()}.png"
        rendition.save(png_path, format="PNG")
        payload = png_path.read_bytes()
        png_path.unlink()
        chunks.append(ostype + struct.pack(">I", len(payload) + 8) + payload)

    body = b"".join(chunks)
    destination.write_bytes(b"icns" + struct.pack(">I", len(body) + 8) + body)


def main() -> None:
    build_directory = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    build_directory.mkdir(parents=True, exist_ok=True)
    master = draw_mark(MASTER)
    master.save(build_directory / "icon.png", format="PNG")
    build_icns(master, build_directory / "icon.icns")
    print(f"wrote {build_directory / 'icon.png'} and {build_directory / 'icon.icns'}")


if __name__ == "__main__":
    main()
