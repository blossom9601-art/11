# -*- mode: python ; coding: utf-8 -*-
"""
Lumina Agent — PyInstaller spec 파일

빌드:
    pip install pyinstaller
    pyinstaller lumina-win.spec

결과물: dist\Lumina\Lumina.exe
"""

import os

block_cipher = None

# 에이전트 루트 = agents/
AGENT_ROOT = os.path.abspath(os.path.join(SPECPATH, '..'))
ICON_FILE = os.path.join(SPECPATH, 'lumina.ico')

a = Analysis(
    [os.path.join(SPECPATH, 'agent.py')],
    pathex=[AGENT_ROOT],
    binaries=[],
    datas=[(ICON_FILE, '.')],
    hiddenimports=[
        'common',
        'common.config',
        'common.collector',
        'windows',
        'windows.collectors',
        'windows.collectors.interface',
        'windows.collectors.account',
        'windows.collectors.package',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Lumina',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    icon=ICON_FILE,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='Lumina',
)
