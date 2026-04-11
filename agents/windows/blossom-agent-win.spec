# -*- mode: python ; coding: utf-8 -*-
"""
Lumina Agent — PyInstaller spec 파일

빌드:
    pip install pyinstaller
    pyinstaller lumina-win.spec

결과물: dist\Lumina\Lumina.exe
"""

import os
from PyInstaller.utils.hooks import collect_data_files

block_cipher = None

# 에이전트 루트 = agents/
AGENT_ROOT = os.path.abspath(os.path.join(SPECPATH, '..'))
ICON_FILE = os.path.join(SPECPATH, 'lumina.ico')

# CustomTkinter 테마/에셋 파일 수집
ctk_datas = collect_data_files('customtkinter')

a = Analysis(
    [os.path.join(SPECPATH, 'agent.py')],
    pathex=[AGENT_ROOT],
    binaries=[],
    datas=[
        (ICON_FILE, '.'),
    ] + ctk_datas,
    hiddenimports=[
        # 에이전트 모듈
        'common',
        'common.config',
        'common.collector',
        'windows',
        'windows.collectors',
        'windows.collectors.interface',
        'windows.collectors.account',
        'windows.collectors.package',
        # cryptography (에이전트 등록: RSA 키/CSR 생성)
        'cryptography',
        'cryptography.hazmat.primitives.asymmetric.rsa',
        'cryptography.hazmat.primitives.serialization',
        'cryptography.hazmat.primitives.hashes',
        'cryptography.x509',
        'cryptography.x509.oid',
        'cryptography.hazmat.backends',
        'cryptography.hazmat.backends.openssl',
        # pywin32 (Windows 서비스)
        'servicemanager',
        'win32event',
        'win32service',
        'win32serviceutil',
        'win32timezone',
        'win32api',
        # 시스템 트레이
        'pystray',
        'pystray._win32',
        'PIL',
        'PIL.Image',
        # CustomTkinter GUI
        'customtkinter',
        'darkdetect',
        # stdlib
        'importlib.metadata',
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
    console=False,
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
