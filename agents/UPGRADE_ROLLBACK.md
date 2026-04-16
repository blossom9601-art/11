# Lumina Agent 일괄 업그레이드/롤백 가이드

## 1. 사전 준비

- Linux 대상: sudo 권한, systemd 사용 가능
- Windows 대상: 관리자 PowerShell
- 업그레이드 소스 폴더에 다음 구조가 있어야 함
  - common/
  - linux/ 또는 windows/

## 2. Linux 단일 호스트

업그레이드:

```bash
sudo bash agents/linux/upgrade_lumina_agent.sh --source /tmp/lumina-agent
```

롤백:

```bash
sudo bash agents/linux/upgrade_lumina_agent.sh --rollback /var/backups/lumina-agent/20260412_123000
```

## 3. Windows 단일 호스트

업그레이드:

```powershell
powershell -ExecutionPolicy Bypass -File .\agents\windows\upgrade_lumina_agent.ps1 -SourceDir C:\Temp\lumina-agent
```

롤백:

```powershell
powershell -ExecutionPolicy Bypass -File .\agents\windows\upgrade_lumina_agent.ps1 -Rollback -BackupDir C:\ProgramData\Lumina\backups\20260412_123000
```

## 4. Linux 병렬 배포 예시

```bash
for host in host1 host2 host3; do
  scp -r agents/common agents/linux "$host:/tmp/lumina-agent/"
  ssh "$host" "sudo bash /tmp/lumina-agent/linux/upgrade_lumina_agent.sh --source /tmp/lumina-agent"
done
```

## 5. 점검 체크리스트

- 서비스 상태: `systemctl is-active lumina` 또는 `Get-Service Lumina`
- 설정 확인: `collectors`에 `authority,firewalld,storage` 포함 여부
- 최근 수집 확인: 서버에서 `lumina agent show <id> authority|firewalld|storage`
