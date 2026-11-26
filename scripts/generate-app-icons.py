from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts" / "assets" / "apexgrid-app-icon-source.jpg"
PUBLIC_ICONS = ROOT / "public" / "icons"
GENERATED_ICONS = ROOT / "scripts" / "generated-icons"
BRAND_RED = (196, 46, 45)


def main() -> None:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"App icon artwork is missing: {SOURCE}")

    original = Image.open(SOURCE).convert("RGB")
    difference = ImageChops.difference(
        original,
        Image.new("RGB", original.size, (255, 255, 255)),
    ).convert("L")
    bounds = difference.point(lambda value: 255 if value > 25 else 0).getbbox()
    if bounds is None:
        raise ValueError("The supplied app icon artwork appears to be blank.")

    artwork = ImageOps.fit(
        original.crop(bounds),
        (1024, 1024),
        method=Image.Resampling.LANCZOS,
    )
    mask = Image.new("L", (1024, 1024), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, 1023, 1023),
        radius=194,
        fill=255,
    )
    master = Image.new("RGB", (1024, 1024), BRAND_RED)
    master.paste(artwork, (0, 0), mask)
    ImageDraw.Draw(master).rounded_rectangle(
        (0, 0, 1023, 1023),
        radius=194,
        outline=BRAND_RED,
        width=8,
    )

    PUBLIC_ICONS.mkdir(parents=True, exist_ok=True)
    GENERATED_ICONS.mkdir(parents=True, exist_ok=True)
    master.save(PUBLIC_ICONS / "icon-1024.png", optimize=True)
    for filename, size in (
        ("icon-512.png", 512),
        ("icon-192.png", 192),
        ("apple-touch-icon.png", 180),
        ("favicon-32.png", 32),
        ("favicon-16.png", 16),
    ):
        master.resize((size, size), Image.Resampling.LANCZOS).save(
            PUBLIC_ICONS / filename,
            optimize=True,
        )

    maskable = Image.new("RGB", (512, 512), BRAND_RED)
    safe_artwork = master.resize((438, 438), Image.Resampling.LANCZOS)
    maskable.paste(safe_artwork, (37, 37))
    maskable.save(PUBLIC_ICONS / "icon-512-maskable.png", optimize=True)

    master.save(
        PUBLIC_ICONS / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    android_launcher_sizes = {
        "mdpi": 48,
        "hdpi": 72,
        "xhdpi": 96,
        "xxhdpi": 144,
        "xxxhdpi": 192,
    }
    for density, size in android_launcher_sizes.items():
        master.resize((size, size), Image.Resampling.LANCZOS).save(
            GENERATED_ICONS / f"android-{density}.png",
            optimize=True,
        )
    for density, size in {
        "mdpi": 108,
        "hdpi": 162,
        "xhdpi": 216,
        "xxhdpi": 324,
        "xxxhdpi": 432,
    }.items():
        master.resize((size, size), Image.Resampling.LANCZOS).save(
            GENERATED_ICONS / f"android-foreground-{density}.png",
            optimize=True,
        )


if __name__ == "__main__":
    main()
