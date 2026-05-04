# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['C:\\Users\\ME\\Desktop\\blossom\\agents\\lumina_pc_agent\\windows\\LuminaGateAgent.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=['servicemanager', 'pywintypes', 'win32event', 'win32service', 'win32serviceutil', 'win32timezone', 'win32crypt'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='LuminaGateAgent-Setup-v1_0_1',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
