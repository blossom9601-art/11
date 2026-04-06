# Lumina 자산 자동 탐색 에이전트

호스트에서 인터페이스, 계정, 패키지 정보를 자동 수집하여 Blossom 서버로 전송하는 에이전트입니다.

## 수집 항목

| 탭 | 항목 | 설명 |
|----|------|------|
| tab04 | 인터페이스 | NIC, IP, MAC, 슬롯 등 |
| tab05 | 계정 | Linux/Windows 사용자 계정 |
| tab13 | 패키지 | 설치된 패키지/프로그램 |

## 구조

```
agents/
├── common/           # 공통 모듈
│   ├── config.py     # 설정 관리
│   └── collector.py  # 수집기 베이스 클래스
├── linux/
│   ├── agent.py                # Linux 데몬 메인
│   ├── blossom-agent.service   # systemd 유닛 파일
│   ├── install.sh              # 설치 스크립트
│   └── collectors/
│       ├── interface.py        # NIC 수집
│       ├── account.py          # 계정 수집
│       └── package.py          # 패키지 수집
└── windows/
    ├── agent.py                # Windows 서비스 메인
    ├── install.ps1             # 설치 스크립트
    └── collectors/
        ├── interface.py        # NIC 수집
        ├── account.py          # 계정 수집
        └── package.py          # 패키지 수집
```

## 사용법

### Linux

```bash
# 설치
sudo bash agents/linux/install.sh

# 설정 (★ 서버 IP 입력 필수)
sudo vi /etc/lumina/lumina.conf
# server_url = http://<서버IP>:8080/api/agent/upload

# 서비스 시작
sudo systemctl start lumina
sudo systemctl enable lumina

# 수동 실행 (1회)
python3 agents/linux/agent.py --once
```

### Windows (관리자 권한 PowerShell)

```powershell
# 설치
.\agents\windows\install.ps1

# 설정 (★ 서버 IP 입력 필수)
notepad C:\ProgramData\Lumina\lumina.conf
# server_url = http://<서버IP>:8080/api/agent/upload

# 서비스 시작
Start-Service Lumina

# 수동 실행 (1회)
python agents\windows\agent.py --once
```

### 동작 방식

1. `lumina.conf`에 `server_url`이 설정된 경우 → 수집 후 자동으로 서버에 전송
2. 전송 실패 시 → 로컬 JSON 파일로 저장 (fallback)
3. `server_url`이 비어 있으면 → JSON 파일만 로컬 저장 (수동 업로드 방식)

## 설정 (lumina.conf)

```ini
[agent]
# Blossom 서버 URL (필수 — 서버 IP를 입력하세요)
server_url = http://172.30.1.45:8080/api/agent/upload

# 수집 주기 (초)
interval = 3600

# JSON 출력 디렉터리 (서버 전송 실패 시 fallback)
output_dir = /var/lib/lumina

# 수집할 항목 (comma-separated)
collectors = interface,account,package
```

### 설정 파일 위치

| OS | 경로 |
|----|------|
| Linux | `/etc/lumina/lumina.conf` |
| Windows | `C:\ProgramData\Lumina\lumina.conf` |
