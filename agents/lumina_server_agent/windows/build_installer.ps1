# Lumina Server Agent — Windows 설치 패키지 전체 빌드
# 1) static/image/logo/lumina_server_agent → lumina.ico, wizard BMP, lumina_ico.png
# 2) PyInstaller → dist\Lumina\Lumina.exe
# 3) Inno Setup → installer\lumina-agent-<version>.win.exe
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = (Resolve-Path (Join-Path $ScriptDir "..\..\..\")).Path

Write-Host "=== [0/3] Python 의존성 (customtkinter, darkdetect) ===" -ForegroundColor Cyan
python -m pip install -q -U "customtkinter>=5.2" "darkdetect>=0.8" pyinstaller
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }

$IsccCandidates = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
)
$Iscc = $IsccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Iscc) {
    throw "Inno Setup 6 ISCC.exe not found. Install from https://jrsoftware.org/isdl.php"
}

Write-Host "=== [1/3] Rebuild icons & wizard images (lumina_server_agent) ===" -ForegroundColor Cyan
& python (Join-Path $RepoRoot "scripts\_rebuild_installer_icons.py")
if ($LASTEXITCODE -ne 0) { throw "rebuild_installer_icons.py failed" }

Write-Host "`n=== [2/3] PyInstaller EXE ===" -ForegroundColor Cyan
& (Join-Path $ScriptDir "build_exe.ps1")
if ($LASTEXITCODE -ne 0) { throw "build_exe.ps1 failed" }

Write-Host "`n=== [3/3] Inno Setup ===" -ForegroundColor Cyan
Push-Location $ScriptDir
try {
    & $Iscc (Join-Path $ScriptDir "lumina-setup.iss")
    if ($LASTEXITCODE -ne 0) { throw "ISCC exit $LASTEXITCODE" }
} finally {
    Pop-Location
}

$iss = Get-Content (Join-Path $ScriptDir "lumina-setup.iss") -Raw
if ($iss -match '#define\s+MyAppVersion\s+"([^"]+)"') {
    $ver = $Matches[1]
    $out = Join-Path $ScriptDir "installer\lumina-agent-$ver.win.exe"
    if (Test-Path $out) {
        Write-Host "`n설치 파일: $out" -ForegroundColor Green
        Write-Host ("크기: {0:N1} MB" -f ((Get-Item $out).Length / 1MB))
    }
}
