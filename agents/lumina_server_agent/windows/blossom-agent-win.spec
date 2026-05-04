# -*- mode: python ; coding: utf-8 -*-
"""
Lumina Server Agent — PyInstaller spec

빌드 전: pip install pyinstaller customtkinter darkdetect

결과물: dist/Lumina/Lumina.exe
"""

import os

from PyInstaller.utils.hooks import collect_all

block_cipher = None

AGENT_ROOT = os.path.abspath(os.path.join(SPECPATH, '..'))
ICON_FILE = os.path.join(SPECPATH, 'lumina.ico')

# CustomTkinter + darkdetect: 테마 에셋·서브모듈 전부 포함 (collect_data_files 만으로는 누락됨)
_ctk_datas, _ctk_binaries, _ctk_hidden = collect_all('customtkinter')
_dd_datas, _dd_binaries, _dd_hidden = collect_all('darkdetect')

_merge_datas = list(_ctk_datas) + list(_dd_datas)
_merge_binaries = list(_ctk_binaries) + list(_dd_binaries)
_hidden_ctk = list(dict.fromkeys(list(_ctk_hidden) + list(_dd_hidden)))

a = Analysis(
    [os.path.join(SPECPATH, 'agent.py')],
    pathex=[AGENT_ROOT],
    binaries=_merge_binaries,
    datas=[
        (ICON_FILE, '.'),
    ] + _merge_datas,
    hiddenimports=[
        'common',
        'common.config',
        'common.collector',
        'windows',
        'windows.collectors',
        'windows.collectors.interface',
        'windows.collectors.account',
        'windows.collectors.authority',
        'windows.collectors.firewalld',
        'windows.collectors.storage',
        'windows.collectors.package',
        'cryptography',
        'cryptography.hazmat.primitives.asymmetric.rsa',
        'cryptography.hazmat.primitives.serialization',
        'cryptography.hazmat.primitives.hashes',
        'cryptography.x509',
        'cryptography.x509.oid',
        'cryptography.hazmat.backends',
        'cryptography.hazmat.backends.openssl',
        'servicemanager',
        'win32event',
        'win32service',
        'win32serviceutil',
        'win32timezone',
        'win32api',
        'pystray',
        'pystray._win32',
        'PIL',
        'PIL.Image',
        'importlib.metadata',
    ] + _hidden_ctk,
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
