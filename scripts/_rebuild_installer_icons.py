#!/usr/bin/env python3
"""Rebuild Lumina server agent (Windows) installer icons and wizard images.

Sources: static/image/logo/lumina_server_agent/ (see README in that folder).
"""
import os
import shutil

from PIL import Image

os.chdir(os.path.join(os.path.dirname(__file__), '..'))
WIN = 'agents/lumina_server_agent/windows'
LOGO = 'static/image/logo/lumina_server_agent'

def _path(*parts: str) -> str:
    return os.path.join(LOGO, *parts)


# 1) Taskbar / EXE / Inno: use packaged multi-size ICO
ico_src = _path('lumina_ico.ico')
if not os.path.isfile(ico_src):
    raise SystemExit(f'Missing {ico_src}')
ico_path = os.path.join(WIN, 'lumina.ico')
shutil.copy2(ico_src, ico_path)
print(f'{ico_src} -> lumina.ico ({os.path.getsize(ico_path)} bytes)')

# 2) PNG shipped next to EXE (Inno [Files] lumina_ico.png)
png_src = _path('lumina_ico_icon_master.png')
if not os.path.isfile(png_src):
    png_src = _path('lumina_ico_transparent.png')
png_out = os.path.join(WIN, 'lumina_ico.png')
shutil.copy2(png_src, png_out)
print(f'{png_src} -> lumina_ico.png ({os.path.getsize(png_out)} bytes)')

# 3) Wizard BMPs — 컬러 마스터 on 흰 배경 (투명 → RGB 직변환 시 검은 배경 방지)
def _fit_rgba_on_white(canvas_w: int, canvas_h: int, img: Image.Image, *, margin: int = 6) -> Image.Image:
    img = img.convert("RGBA")
    bg = Image.new("RGBA", (canvas_w, canvas_h), (255, 255, 255, 255))
    iw, ih = img.size
    mw, mh = canvas_w - 2 * margin, canvas_h - 2 * margin
    scale = min(mw / iw, mh / ih, 1.0)
    nw, nh = max(1, int(iw * scale)), max(1, int(ih * scale))
    scaled = img.resize((nw, nh), Image.LANCZOS)
    x, y = (canvas_w - nw) // 2, (canvas_h - nh) // 2
    bg.paste(scaled, (x, y), scaled)
    return bg


master = Image.open(_path("lumina_ico_icon_master.png")).convert("RGBA")
print(f'wizard source: lumina_ico_icon_master.png {master.size}')

wiz_rgb = _fit_rgba_on_white(164, 314, master, margin=14)
wiz_path = os.path.join(WIN, "wizard_image.bmp")
wiz_rgb.convert("RGB").save(wiz_path, format="BMP")
print(f"  -> wizard_image.bmp: {os.path.getsize(wiz_path)} bytes")

small_rgb = _fit_rgba_on_white(55, 55, master, margin=4)
ws_path = os.path.join(WIN, "wizard_small.bmp")
small_rgb.convert("RGB").save(ws_path, format="BMP")
print(f"  -> wizard_small.bmp: {os.path.getsize(ws_path)} bytes")

# 4) PyInstaller dist bundle (if present)
dist_ico = os.path.join(WIN, 'dist', 'Lumina', '_internal', 'lumina.ico')
if os.path.isdir(os.path.dirname(dist_ico)):
    shutil.copy2(ico_path, dist_ico)
    print('  -> dist _internal lumina.ico updated')

print('Done.')
