$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AgentPy = Join-Path $ScriptDir "LuminaGateAgent.py"
$DistDir = Join-Path $ScriptDir "installer"
$BuildDir = Join-Path $ScriptDir "build"

if (-not (Test-Path $AgentPy)) { throw "Missing $AgentPy" }

$GateAssetsDir = Join-Path $ScriptDir "gate_assets"
$IcoPath = Join-Path $GateAssetsDir "lumina-gate-reference.ico"
if (-not (Test-Path $IcoPath)) { throw "Missing tray/icon asset: $IcoPath (copy from static/image/logo/gate/windows/)" }

# PuTTY+BlossomSshLaunch bundle (same source as Blossom Chat desktop client; gitignored staging under putty_bundle/)
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir "..\..\.."))
$PuttySrc = Join-Path $RepoRoot "clients\desktop\resources\putty"
if (-not (Test-Path $PuttySrc)) {
  throw "PuTTY bundle not found at $PuttySrc.`nProvide clients/desktop/resources/putty (e.g. npm run fetch-putty in clients/desktop)."
}
$PuttyDst = Join-Path $ScriptDir "putty_bundle"
if (Test-Path $PuttyDst) { Remove-Item $PuttyDst -Recurse -Force }
Copy-Item -LiteralPath $PuttySrc -Destination $PuttyDst -Recurse
foreach ($need in @("putty.exe", "BlossomSshLaunch.exe")) {
  if (-not (Test-Path (Join-Path $PuttyDst $need))) { throw "Missing $need after copying PuTTY bundle" }
}
$PuttyDstAbs = [System.IO.Path]::GetFullPath($PuttyDst)

# FileZilla bundle for SFTP endpoints (gitignored staging under filezilla_bundle/)
$FileZillaSrc = if ($env:LUMINA_FILEZILLA_DIR) { $env:LUMINA_FILEZILLA_DIR } else { Join-Path $RepoRoot "clients\desktop\resources\filezilla" }
if (-not (Test-Path $FileZillaSrc)) {
  throw "FileZilla bundle not found at $FileZillaSrc.`nProvide clients/desktop/resources/filezilla/FileZilla.exe or set LUMINA_FILEZILLA_DIR."
}
$FileZillaDst = Join-Path $ScriptDir "filezilla_bundle"
if (Test-Path $FileZillaDst) { Remove-Item $FileZillaDst -Recurse -Force }
Copy-Item -LiteralPath $FileZillaSrc -Destination $FileZillaDst -Recurse
if (-not (Test-Path (Join-Path $FileZillaDst "FileZilla.exe"))) { throw "Missing FileZilla.exe after copying FileZilla bundle" }
$FileZillaDstAbs = [System.IO.Path]::GetFullPath($FileZillaDst)

$verLine = Select-String -Path $AgentPy -Pattern '^\s*VERSION\s*=\s*"([^"]+)"' | Select-Object -First 1
if (-not $verLine) { throw "Could not parse VERSION from LuminaGateAgent.py" }
$rawVer = $verLine.Matches.Groups[1].Value
$safeVer = $rawVer -replace '\.', '_'
$ExeBaseName = "LuminaGateAgent-Setup-v$safeVer"

if (Test-Path $BuildDir) { Remove-Item $BuildDir -Recurse -Force }
if (-not (Test-Path $DistDir)) { New-Item -ItemType Directory -Path $DistDir | Out-Null }

pyinstaller `
  --onefile `
  --noconfirm `
  --clean `
  --noconsole `
  --icon $IcoPath `
  --name $ExeBaseName `
  --distpath $DistDir `
  --workpath $BuildDir `
  --add-data "$GateAssetsDir;gate_assets" `
  --add-data "$PuttyDstAbs;putty" `
  --add-data "$FileZillaDstAbs;filezilla" `
  --hidden-import lumina_windivert_guard `
  --hidden-import tkinter `
  --hidden-import tkinter.scrolledtext `
  --hidden-import servicemanager `
  --hidden-import pywintypes `
  --hidden-import win32event `
  --hidden-import win32service `
  --hidden-import win32serviceutil `
  --hidden-import win32timezone `
  --hidden-import win32crypt `
  $AgentPy

$versioned = Join-Path $DistDir "$ExeBaseName.exe"
if (-not (Test-Path $versioned)) { throw "Build did not produce $versioned" }

$legacy = Join-Path $DistDir "LuminaGateAgent-Setup.exe"
try {
  Copy-Item -LiteralPath $versioned -Destination $legacy -Force
  Write-Host "Built: $versioned"
  Write-Host "Legacy copy: $legacy"
} catch {
  Write-Warning "Could not overwrite $legacy (file may be in use). Use the versioned exe above."
  Write-Host "Built: $versioned"
}
