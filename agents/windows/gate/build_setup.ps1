$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AgentPy = Join-Path $ScriptDir "LuminaGateAgent.py"
$DistDir = Join-Path $ScriptDir "installer"
$BuildDir = Join-Path $ScriptDir "build"

if (Test-Path $DistDir) { Remove-Item $DistDir -Recurse -Force }
if (Test-Path $BuildDir) { Remove-Item $BuildDir -Recurse -Force }

pyinstaller `
  --onefile `
  --noconfirm `
  --clean `
  --name LuminaGateAgent-Setup `
  --distpath $DistDir `
  --workpath $BuildDir `
  --hidden-import servicemanager `
  --hidden-import pywintypes `
  --hidden-import win32event `
  --hidden-import win32service `
  --hidden-import win32serviceutil `
  --hidden-import win32timezone `
  --hidden-import win32crypt `
  $AgentPy

Write-Host "Built: $DistDir\LuminaGateAgent-Setup.exe"