<#
.SYNOPSIS
    Lumina Agent — Windows EXE 빌드 스크립트

.DESCRIPTION
    PyInstaller를 사용하여 Lumina.exe를 빌드합니다.
    결과물: agents\windows\dist\Lumina\Lumina.exe

.EXAMPLE
    .\build_exe.ps1
#>

$ErrorActionPreference = "Stop"

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$AgentRoot  = Split-Path -Parent $ScriptDir       # agents/
$SpecFile   = Join-Path $ScriptDir "blossom-agent-win.spec"

Write-Host "===== Lumina Agent Windows EXE 빌드 =====" -ForegroundColor Cyan

# ── PyInstaller 확인 / 설치 ───────────────────────────────
$pyinstaller = Get-Command pyinstaller -ErrorAction SilentlyContinue
if (-not $pyinstaller) {
    Write-Host "PyInstaller 설치 중..." -ForegroundColor Yellow
    pip install pyinstaller
}

# ── 이전 빌드 정리 ──────────────────────────────────────
$distDir  = Join-Path $ScriptDir "dist"
$buildDir = Join-Path $ScriptDir "build"
if (Test-Path $distDir)  { Remove-Item $distDir  -Recurse -Force }
if (Test-Path $buildDir) { Remove-Item $buildDir -Recurse -Force }

# ── PyInstaller 실행 ────────────────────────────────────
Push-Location $ScriptDir
try {
    pyinstaller `
        --distpath "$distDir" `
        --workpath "$buildDir" `
        --noconfirm `
        $SpecFile

    Write-Host ""
    Write-Host "===== 빌드 완료 =====" -ForegroundColor Green

    $exePath = Join-Path $distDir "Lumina\Lumina.exe"
    if (Test-Path $exePath) {
        $size = [math]::Round((Get-Item $exePath).Length / 1MB, 1)
        Write-Host "결과물: $exePath  (${size} MB)" -ForegroundColor Green
    } else {
        Write-Host "경고: EXE 파일이 생성되지 않았습니다." -ForegroundColor Red
    }
} finally {
    Pop-Location
}
