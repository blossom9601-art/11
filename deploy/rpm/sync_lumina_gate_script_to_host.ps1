# Sync agents/lumina_gate/linux/lumina-gate to a remote lumina-gate host (scp + chmod + restart).
# No RPM rebuild. Use after git pull when you only changed the lumina-gate Python entry.
#
# Example (PowerShell, OpenSSH 클라이언트 필요):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\rpm\sync_lumina_gate_script_to_host.ps1 -TargetHost 192.168.56.110 -User root
#
# 비밀번호 대신 키를 쓰려면 SSH agent에 로드한 뒤 실행하거나, 환경변수에 지정하세요.

param(
    [string]$TargetHost = "192.168.56.110",
    [string]$User = "root",
    [string]$RemotePath = "/opt/lumina-gate/lumina-gate"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$local = Join-Path $root "agents\lumina_gate\linux\lumina-gate"
if (-not (Test-Path $local)) { throw "Missing $local" }

$target = "${User}@${TargetHost}:${RemotePath}"
Write-Host "SCP -> $target"
scp -p $local $target

$remoteCmd = "chmod 755 $RemotePath && systemctl daemon-reexec 2>/dev/null || true; systemctl restart lumina-gate 2>/dev/null || systemctl try-restart lumina-gate 2>/dev/null || true; $RemotePath -V"
ssh "${User}@${TargetHost}" $remoteCmd
Write-Host "Done. On server: lumina-gate -V 와 lumina-gate list 로 표 출력 확인."
