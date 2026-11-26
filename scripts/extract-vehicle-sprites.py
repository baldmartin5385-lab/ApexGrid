#!/usr/bin/env python3
"""Extract the supplied 16-car sheet into transparent, individually named PNGs."""

import argparse
from pathlib import Path
from statistics import median

from PIL import Image


SPRITES = [
    ("kart", "kart_01", (44, 138, 177, 352)),
    ("formula", "formula_red_01", (199, 74, 337, 365)),
    ("formula", "formula_blue_01", (357, 74, 493, 365)),
    ("formula", "formula_orange_01", (508, 52, 655, 378)),
    ("formula", "formula_lightblue_01", (672, 45, 823, 379)),
    ("formula", "formula_yellow_01", (855, 50, 1031, 374)),
    ("road", "road_white_01", (1062, 48, 1218, 380)),
    ("road", "road_charcoal_01", (1223, 54, 1385, 379)),
    ("road", "road_green_01", (39, 412, 181, 748)),
    ("prototype", "prototype_purple_01", (191, 408, 339, 750)),
    ("prototype", "prototype_magenta_01", (342, 405, 501, 753)),
    ("prototype", "prototype_blue_01", (505, 408, 663, 751)),
    ("prototype", "prototype_cyan_01", (670, 409, 825, 754)),
    ("road", "road_red_01", (852, 415, 1030, 748)),
    ("road", "road_blue_01", (1058, 412, 1223, 750)),
    ("formula", "formula_black_01", (1220, 402, 1387, 756)),
]


def background_color(image: Image.Image, box: tuple[int, int, int, int]) -> tuple[float, float, float]:
    left, top, right, bottom = box
    pixels = image.load()
    samples: list[tuple[int, int, int]] = []
    for y in range(top, bottom):
        for x in range(left, right):
            if x not in range(left + 3, right - 3) or y not in range(top + 3, bottom - 3):
                samples.append(pixels[x, y])
    return tuple(float(median(channel)) for channel in zip(*samples))


def extract(image: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    crop = image.crop(box).convert("RGBA")
    background = background_color(image, box)
    background_luma = sum(background) / 3
    px = crop.load()

    for y in range(crop.height):
        for x in range(crop.width):
            red, green, blue, _ = px[x, y]
            distance = sum((channel - base) ** 2 for channel, base in zip((red, green, blue), background)) ** 0.5
            chroma = max(red, green, blue) - min(red, green, blue)
            luma = (red + green + blue) / 3

            # The sheet uses soft grey drop-shadows; remove those while keeping
            # dark wheels/bodywork and the near-white road car.
            if chroma < 24 and background_luma - 82 < luma < background_luma - 7:
                alpha = 0
            else:
                alpha = round(max(0, min(255, (distance - 5) * 10.2)))
            px[x, y] = (red, green, blue, alpha)

    alpha = crop.getchannel("A")
    bounds = alpha.point(lambda value: 255 if value > 20 else 0).getbbox()
    if bounds is None:
        raise ValueError(f"No vehicle silhouette found in crop {box}.")
    left, top, right, bottom = bounds
    padding = 3
    bounds = (
        max(0, left - padding),
        max(0, top - padding),
        min(crop.width, right + padding),
        min(crop.height, bottom + padding),
    )
    return crop.crop(bounds)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Path to the supplied sprite-sheet PNG")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "public" / "assets" / "vehicles",
        help="Output vehicle asset directory",
    )
    args = parser.parse_args()

    source = Image.open(args.source).convert("RGB")
    if source.size != (1408, 768):
        raise ValueError(f"Expected the supplied 1408x768 sheet; got {source.width}x{source.height}.")

    for category, name, box in SPRITES:
        output = args.output / category / f"{name}.png"
        output.parent.mkdir(parents=True, exist_ok=True)
        sprite = extract(source, box)
        sprite.save(output, optimize=True)
        print(f"{name}: {sprite.width}x{sprite.height} -> {output}")


if __name__ == "__main__":
    main()
