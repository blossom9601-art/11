# Lumina 에이전트 업그레이드/롤백 스크립트 (Windows)
# 사용법:
#   powershell -ExecutionPolicy Bypass -File .\upgrade_lumina_agent.ps1 -SourceDir C:\Temp\lumina-agent
#   powershell -ExecutionPolicy Bypass -File .\upgrade_lumina_agent.ps1 -Rollback -BackupDir C:\ProgramData\Lumina\backups\20260412_123000

param(
    [string]$SourceDir = "",
    [switch]$Rollback,
    [string]$BackupDir = ""
)

$ErrorActionPreference = "Stop"

$InstallDir = "$env:ProgramData\Lumina"
$ServiceName = "Lumina"
$BackupRoot = Join-Path $InstallDir "backups"

function New-Backup {
    New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
    $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $dest = Join-Path $BackupRoot $stamp
    New-Item -ItemType Directory -Path $dest -Force | Out-Null

    if (Test-Path $InstallDir) {
        Copy-Item -Recurse -Force $InstallDir (Join-Path $dest "Lumina")
    }
    return $dest
}

function Stop-AgentService {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($null -ne $svc -and $svc.Status -ne 'Stopped') {
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    }
}

function Start-AgentService {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($null -ne $svc) {
        Start-Service -Name $ServiceName
        (Get-Service -Name $ServiceName).Status | Out-Host
    }
}

if ($Rollback) {
    if ([string]::IsNullOrWhiteSpace($BackupDir) -or -not (Test-Path $BackupDir)) {
        throw "유효한 -BackupDir 경로가 필요합니다."
    }

    Stop-AgentService

    $sourceBackup = Join-Path $BackupDir "Lumina"
    if (-not (Test-Path $sourceBackup)) {
        throw "백업 폴더에 Lumina 디렉터리가 없습니다: $sourceBackup"
    }

    Copy-Item -Recurse -Force (Join-Path $sourceBackup "*") $InstallDir
    Start-AgentService
    Write-Host "Rollback done: $BackupDir"
    exit 0
}

if ([string]::IsNullOrWhiteSpace($SourceDir) -or -not (Test-Path $SourceDir)) {
    throw "유효한 -SourceDir 경로가 필요합니다."
}

$backupPath = New-Backup
Write-Host "Backup saved: $backupPath"

Stop-AgentService

Copy-Item -Recurse -Force (Join-Path $SourceDir "common")  $InstallDir
Copy-Item -Recurse -Force (Join-Path $SourceDir "windows") $InstallDir

$agentPy = Join-Path $InstallDir "windows\agent.py"
if (Test-Path $agentPy) {
    & python $agentPy --install-service | Out-Null
}

Start-AgentService

Write-Host "Upgrade done from: $SourceDir"
Write-Host "Rollback backup: $backupPath"