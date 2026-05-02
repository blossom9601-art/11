# LuminaGateAgent

`LuminaGateAgent-Setup.exe` is a self-installing Windows service package.

Double-clicking the installer requests UAC elevation. If UAC does not appear or
the install directory is not created, run it explicitly as Administrator:

```powershell
.\LuminaGateAgent-Setup.exe
```

Install actions:

- Copies the executable to `C:\Program Files\LuminaGateAgent\LuminaGateAgent.exe`
- Creates `C:\ProgramData\LuminaGateAgent\config.yaml`
- Creates `C:\ProgramData\LuminaGateAgent\logs\` and `queue\`
- Registers the `LuminaGateAgent` Windows service
- Sets service start mode to automatic
- Sets service failure actions to restart automatically
- Starts the service immediately

Successful install check:

```powershell
Test-Path "C:\Program Files\LuminaGateAgent\LuminaGateAgent.exe"
Test-Path "C:\ProgramData\LuminaGateAgent\config.yaml"
Get-Service LuminaGateAgent
```

If `C:\Program Files\LuminaGateAgent\` is missing after running the installer,
the agent was not installed. The most common reason is that the installer was
not elevated with Administrator permission or UAC was cancelled.

Uninstall:

```powershell
"C:\Program Files\LuminaGateAgent\LuminaGateAgent.exe" --uninstall
```

Purge ProgramData during uninstall:

```powershell
"C:\Program Files\LuminaGateAgent\LuminaGateAgent.exe" --uninstall --purge
```

The current implementation provides service installation, registration,
authenticated API communication, local encrypted token storage, policy cache,
heartbeat, and durable log queue plumbing. WFP callout-driver enforcement should
be added as a native Windows driver module and loaded by this service.