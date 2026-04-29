"""
모바일 안드로이드 런처 아이콘 일괄 생성 스크립트.
- 소스: clients/desktop/build/icon.png (웹/데스크톱과 동일)
- 대상: clients/mobile/android/app/src/main/res/mipmap-*/{ic_launcher,ic_launcher_round,ic_launcher_foreground}.png
- 추가: clients/mobile/www/assets/app-icon.png 도 동일 이미지로 동기화

mipmap 크기 (Android 표준):
  mdpi    48
  hdpi    72
  xhdpi   96
  xxhdpi  144
  xxxhdpi 192

Adaptive icon foreground는 안전영역(중앙 66%) 안에 넣기 위해 원본을 축소 후 투명 캔버스에 합성.
foreground 추천 크기:
  mdpi    108
  hdpi    162
  xhdpi   216
  xxhdpi  324
  xxxhdpi 432
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).parent
SRC = ROOT / "clients" / "desktop" / "build" / "icon.png"
RES = ROOT / "clients" / "mobile" / "android" / "app" / "src" / "main" / "res"
WWW_ICON = ROOT / "clients" / "mobile" / "www" / "assets" / "app-icon.png"

LAUNCHER_SIZES = {
    "mipmap-mdpi":    48,
    "mipmap-hdpi":    72,
    "mipmap-xhdpi":   96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi":192,
}
FOREGROUND_SIZES = {
    "mipmap-mdpi":    108,
    "mipmap-hdpi":    162,
    "mipmap-xhdpi":   216,
    "mipmap-xxhdpi":  324,
    "mipmap-xxxhdpi": 432,
}
# adaptive icon: 안전영역 약 66/108
SAFE_RATIO = 66 / 108

def make_round(img: Image.Image, size: int) -> Image.Image:
    """원형 마스크 적용."""
    img = img.resize((size, size), Image.LANCZOS).convert("RGBA")
    mask = Image.new("L", (size, size), 0)
    from PIL import ImageDraw
    d = ImageDraw.Draw(mask)
    d.ellipse((0, 0, size, size), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out

def make_foreground(src: Image.Image, size: int) -> Image.Image:
    """투명 배경에 안전영역 안 중앙 배치."""
    inner = int(size * SAFE_RATIO)
    fg = src.resize((inner, inner), Image.LANCZOS).convert("RGBA")
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    off = (size - inner) // 2
    canvas.paste(fg, (off, off), fg)
    return canvas

def main():
    assert SRC.exists(), f"source missing: {SRC}"
    src = Image.open(SRC).convert("RGBA")
    print(f"src: {SRC}  {src.size}")

    for folder, size in LAUNCHER_SIZES.items():
        d = RES / folder
        d.mkdir(parents=True, exist_ok=True)
        sq = src.resize((size, size), Image.LANCZOS)
        sq.save(d / "ic_launcher.png", "PNG", optimize=True)
        rd = make_round(src, size)
        rd.save(d / "ic_launcher_round.png", "PNG", optimize=True)
        fg_size = FOREGROUND_SIZES[folder]
        fg = make_foreground(src, fg_size)
        fg.save(d / "ic_launcher_foreground.png", "PNG", optimize=True)
        print(f"  {folder}: launcher={size}  foreground={fg_size}")

    # www 어셋 동기화 (web/desktop과 동일 보장)
    WWW_ICON.parent.mkdir(parents=True, exist_ok=True)
    src.resize((256, 256), Image.LANCZOS).save(WWW_ICON, "PNG", optimize=True)
    print(f"www icon: {WWW_ICON}")

    print("done.")

if __name__ == "__main__":
    main()
