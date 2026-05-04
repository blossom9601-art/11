# agents 디렉터리 (제품별로 경로가 나뉩니다)

| 경로 | 연동 대상 | 설명 |
|------|-----------|------|
| **`lumina_server_agent/`** | **Lumina AP** (Blossom API, `server_url`) | 자산 수집 에이전트 — `common/`, `linux/`, `windows/` |
| **`lumina_pc_agent/windows/`** | **lumina-gate** (`gate_server_url`) | PC 쪽 LuminaGateAgent (설치 빌드 `build_setup.ps1`) |
| **`lumina_gate/linux/`** | (게이트 호스트에서 수신) | **lumina-gate 데몬** RPM 소스 — 에이전트가 아님 |
| `web/`, `rpmbuild/` | (별도) | 보조·스냅샷 |

---

# Lumina Server 에이전트 (Lumina AP 연동)

호스트에서 인터페이스, 계정, 권한, 방화벽, 스토리지, 패키지 정보를 자동 수집하여 **Blossom / Lumina AP**로 전송합니다 (`lumina.conf`의 `server_url`).

## 수집 항목

| 탭 | 항목 | 설명 |
|----|------|------|
| tab04 | 인터페이스 | NIC, IP, MAC, 슬롯 등 |
| tab05 | 계정 | Linux/Windows 사용자 계정 |
| tab06 | 권한 | sudo/admin 그룹 및 권한 구성 |
| tab08 | 방화벽 | firewalld/iptables/Windows 방화벽 규칙 |
| tab10 | 스토리지 | 마운트/디스크/볼륨 사용량 |
| tab13 | 패키지 | 설치된 패키지/프로그램 |

## 구조 (`lumina_server_agent/`)

```
agents/lumina_server_agent/
├── common/           # 공통 모듈 (config, collector 등)
├── linux/            # Linux 데몬, install.sh, collectors/
└── windows/          # Windows 서비스, install.ps1, collectors/
```

## 사용법

### Linux

```bash
# 설치
sudo bash agents/lumina_server_agent/linux/install.sh

# 설정 (★ 서버 IP 입력 필수)
sudo vi /etc/lumina/lumina.conf
# server_url = http://<서버IP>:8080/api/agent/upload

# 서비스 시작
sudo systemctl start lumina
sudo systemctl enable lumina

# 수동 실행 (1회)
python3 agents/lumina_server_agent/linux/agent.py --once
```

### Windows (관리자 권한 PowerShell)

```powershell
# 설치
.\agents\lumina_server_agent\windows\install.ps1

# 설정 (★ 서버 IP 입력 필수)
notepad C:\ProgramData\Lumina\lumina.conf
# server_url = http://<서버IP>:8080/api/agent/upload

# 서비스 시작
Start-Service Lumina

# 수동 실행 (1회)
python agents\lumina_server_agent\windows\agent.py --once
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
collectors = interface,account,authority,firewalld,storage,package
```

### 설정 파일 위치

| OS | 경로 |
|----|------|
| Linux | `/etc/lumina/lumina.conf` |
| Windows | `C:\ProgramData\Lumina\lumina.conf` |

## Lumina PC 에이전트 (lumina-gate)

**Lumina AP(`server_url`)와 별개입니다.** Windows PC에서 **lumina-gate**(`gate_server_url`)로 붙는 `LuminaGateAgent` 소스·설치 빌드:

- `agents/lumina_pc_agent/windows/` (`build_setup.ps1`, `LuminaGateAgent.py`)

## lumina-gate 데몬 (Linux, RPM 소스)

PC 에이전트가 접속하는 **게이트 서버** 바이너리·유닛(에이전트 아님):

- `agents/lumina_gate/linux/`
