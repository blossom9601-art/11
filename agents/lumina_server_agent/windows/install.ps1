# Lumina 자산 자동 탐색 에이전트 — Windows 설치 스크립트
# 관리자 권한 PowerShell에서 실행: .\install.ps1

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$InstallDir = "$env:ProgramData\Lumina"
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$AgentRoot  = Split-Path -Parent $ScriptDir

Write-Host "=== Lumina 자산 자동 탐색 에이전트 설치 ===" -ForegroundColor Cyan

# 1) 디렉터리 생성
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
New-Item -ItemType Directory -Path "$InstallDir\logs" -Force | Out-Null

# 2) 에이전트 파일 복사
Copy-Item -Recurse -Force "$AgentRoot\common"  "$InstallDir\"
Copy-Item -Recurse -Force "$AgentRoot\windows" "$InstallDir\"

# 3) 기본 설정 파일 생성
$ConfFile = "$InstallDir\lumina.conf"
if (-not (Test-Path $ConfFile)) {
    @"
[agent]
# Blossom 서버 URL (필수 — 서버 IP를 입력하세요)
# 예: http://192.168.1.10:8080/api/agent/upload
server_url =

# 수집 주기 (초). 기본값: 3600 (1시간)
interval = 3600

# JSON 출력 디렉터리 (서버 전송 실패 시 fallback 저장 경로)
output_dir = $InstallDir

# 수집 항목 (comma-separated): interface, account, authority, firewalld, storage, package
collectors = interface,account,authority,firewalld,storage,package
"@ | Out-File -Encoding utf8 -FilePath $ConfFile
    Write-Host "  설정 파일 생성: $ConfFile"
} else {
    Write-Host "  설정 파일 유지: $ConfFile (기존 파일 보존)"
}

# 4) pywin32 설치 확인
Write-Host "`n  pywin32 설치 확인..."
& python -m pip show pywin32 *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  pywin32 설치 중..."
    & python -m pip install pywin32
}

# 5) Windows 서비스 등록
Write-Host "`n  Windows 서비스 등록..."
$agentPy = "$InstallDir\windows\agent.py"
& python $agentPy install

Write-Host "`n=== 설치 완료 ===" -ForegroundColor Green
Write-Host ""
Write-Host "  ★ 먼저 설정 파일에서 서버 주소를 입력하세요:" -ForegroundColor Yellow
Write-Host "    notepad $ConfFile"
Write-Host "    server_url = http://<서버IP>:8080/api/agent/upload"
Write-Host ""
Write-Host "  시작:   Start-Service Lumina"
Write-Host "  중지:   Stop-Service Lumina"
Write-Host "  상태:   Get-Service Lumina"
Write-Host "  제거:   python $agentPy remove"
Write-Host "  JSON:   Get-ChildItem $InstallDir\*.json"
Write-Host ""
