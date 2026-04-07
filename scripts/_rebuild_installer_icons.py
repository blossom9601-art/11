#!/usr/bin/env python3
"""Rebuild Lumina agent installer icons and wizard images."""
import os, shutil
from PIL import Image

os.chdir(os.path.join(os.path.dirname(__file__), '..'))
WIN = 'agents/windows'

# 1. lumina_ico.png -> lumina.ico (SetupIconFile, exe icon)
img = Image.open('static/image/logo/lumina_ico.png').convert('RGBA')
print(f'lumina_ico.png: {img.size} {img.mode}')
sizes = [(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)]
ico_path = os.path.join(WIN, 'lumina.ico')
img.save(ico_path, format='ICO', sizes=sizes)
print(f'  -> lumina.ico: {os.path.getsize(ico_path)} bytes')

# 2. lumina_white.png -> wizard BMP images (shown inside installer wizard)
wimg = Image.open('static/image/logo/lumina_white.png').convert('RGBA')
print(f'lumina_white.png: {wimg.size} {wimg.mode}')

# WizardImageFile: 164x314 (modern style)
wizard_w, wizard_h = 164, 314
bg = Image.new('RGBA', (wizard_w, wizard_h), (255, 255, 255, 255))
scaled = wimg.resize((wizard_w, wizard_w), Image.LANCZOS)
y_offset = (wizard_h - wizard_w) // 2
bg.paste(scaled, (0, y_offset), scaled)
wiz_path = os.path.join(WIN, 'wizard_image.bmp')
bg.convert('RGB').save(wiz_path, format='BMP')
print(f'  -> wizard_image.bmp: {os.path.getsize(wiz_path)} bytes')

# WizardSmallImageFile: 55x55
small = wimg.resize((55, 55), Image.LANCZOS)
ws_path = os.path.join(WIN, 'wizard_small.bmp')
small.convert('RGB').save(ws_path, format='BMP')
print(f'  -> wizard_small.bmp: {os.path.getsize(ws_path)} bytes')

# Also copy to dist for PyInstaller built exe
dist_ico = os.path.join(WIN, 'dist', 'Lumina', '_internal', 'lumina.ico')
if os.path.isdir(os.path.dirname(dist_ico)):
    shutil.copy2(ico_path, dist_ico)
    print(f'  -> dist copy updated')

print('Done.')
