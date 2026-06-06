# LuminaGateAgent

Build (from repo `agents/lumina_pc_agent/windows`; lumina-gate 연동 PC 에이전트, Lumina AP `server_url` 에이전트 아님):

```powershell
.\build_setup.ps1
```

Primary output: `installer/LuminaGateAgent-Setup-v<VERSION_WITH_UNDERSCORES>.exe` (e.g. v1_0_1). The script also tries to copy to `installer/LuminaGateAgent-Setup.exe` when that file is not locked.

`LuminaGateAgent-Setup.exe` (or the versioned exe) is a self-installing Windows service package.

Double-clicking the installer requests UAC elevation. If UAC does not appear or
the install directory is not created, run it explicitly as Administrator:

```powershell
.\LuminaGateAgent-Setup.exe
```

Install actions:

- Copies the executable to `C:\Program Files\LuminaGateAgent\LuminaGateAgent.exe`
- Deploys PuTTY+BlossomSshLaunch helpers (bundled via `clients/desktop/resources/putty`) to **`C:\Program Files\LuminaGateAgent\putty\`**
- Deploys FileZilla helpers (bundled via `clients/desktop/resources/filezilla` or `LUMINA_FILEZILLA_DIR`) to **`C:\Program Files\LuminaGateAgent\filezilla\`** for SFTP endpoints.
  (same payloads as Blossom Chat; Lumina 빌드가 PC에서 해당 폴더를 사용할 수 있어야 함)
- Registers **`blossom-ssh://`** URL handler for **HKCU (로그온 사용자)** pointing at `...\putty\BlossomSshLaunch.exe`:
- Registers **`blossom-sftp://`** URL handler for **HKCU (로그온 사용자)** pointing at the same launcher; the launcher opens bundled FileZilla.
  installers run elevated so HKCU reflects the elevated account; 로그온 사용자에 맞추려면 **트레이**가 시작될 때도 동일 레지스트리를 다시 적습니다.
- Creates `C:\ProgramData\LuminaGateAgent\config.yaml`
- Creates `C:\ProgramData\LuminaGateAgent\logs\` and `queue\`
- Registers the `LuminaGateAgent` Windows service
- Sets service start mode to automatic
- Sets service failure actions to restart automatically
- Starts the service immediately

Successful install check:

```powershell
Test-Path "C:\Program Files\LuminaGateAgent\LuminaGateAgent.exe"
Test-Path "C:\Program Files\LuminaGateAgent\putty\putty.exe"
Test-Path "C:\Program Files\LuminaGateAgent\putty\BlossomSshLaunch.exe"
Test-Path "C:\ProgramData\LuminaGateAgent\config.yaml"
Get-Service LuminaGateAgent
```

If `C:\Program Files\LuminaGateAgent\` is missing after running the installer,
the agent was not installed. The most common reason is that the installer was
not elevated with Administrator permission or UAC was cancelled.

When **re-running** setup on top of an existing installation, **`WinError 32` /
“다른 프로세스가 파일을 사용 중”** occurs if the installer copied to Program Files
_before_ stopping `LuminaGateAgent.exe` locked by the service. Use **installer
build 1.0.1+** (fixes order: stop/remove service → copy → register). Until then,
from an elevated command prompt stop and delete the service, then run setup again:

```powershell
sc.exe stop LuminaGateAgent
sc.exe delete LuminaGateAgent
```

Uninstall:

```powershell
"C:\Program Files\LuminaGateAgent\LuminaGateAgent.exe" --uninstall
```

Purge ProgramData during uninstall:

```powershell
"C:\Program Files\LuminaGateAgent\LuminaGateAgent.exe" --uninstall --purge
```

The service installs, registers against **lumina-gate**, caches policy, sends
heartbeat, and queues `/api/pc-agent/log/web-access|block` events.

**Outbound web filtering** uses **WinDivert** (LGPL; wraps WFP divert). Copy
`WinDivert.dll` from the upstream WinDivert release into
`C:\Program Files\LuminaGateAgent\` beside `LuminaGateAgent.exe` (first open
loads the bundled driver). Without the DLL filtering is inactive (see logs).
Optional `windivert_dll_path` in `config.yaml` points to another DLL location.

### 접근제어 웹 **접속** 에서 SSH (Blossom Chat 없음)

웹 페이지의 SSH 동작은 `blossom-ssh://` 로컬 URL로 PuTTY를 띄우는 방식입니다. **LuminaGateAgent** 에 번들된 `putty.exe` 및 `blossom-ssh` 핸들러 등록만 있으면 Blossom Chat 없이 동일 플로우가 됩니다.

빌드 전 PuTTY 디렉터리 채우기(Blossom Chat과 같은 `clients/desktop/resources/putty` 원본):

```powershell
cd .\clients\desktop
npm run fetch-putty
node .\scripts\build-blossom-ssh-launch.js
cd ..\agents\lumina_pc_agent\windows
.\build_setup.ps1
```

프로토콜이 로그온 사용자에 안 잡히면 해당 사용자 세션에서 **트레이**를 한 번 실행합니다(설치 프로그램만 관리자로 돌린 경우 HKCU 대상이 다를 수 있음).
