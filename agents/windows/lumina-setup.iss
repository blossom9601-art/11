; Lumina Agent — Inno Setup 설치 스크립트
; 빌드: "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" lumina-setup.iss
;       또는 Inno Setup GUI에서 이 파일 열고 Compile (Ctrl+F9)

#define MyAppName "Lumina"
#define MyAppVersion "1.0.1"
#define MyAppPublisher "Blossom IT Asset Management"
#define MyAppExeName "Lumina.exe"
#define MyAppDescription "자산 자동 탐색 에이전트"

[Setup]
AppId={{B70553E1-9A2F-4D8C-B7E3-6F1A2D3C4E5F}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=no
OutputDir=installer
OutputBaseFilename=lumina-agent-{#MyAppVersion}.win
SetupIconFile=lumina.ico
UninstallDisplayIcon={app}\lumina.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
LicenseFile=
WizardImageFile=wizard_image.bmp
WizardSmallImageFile=wizard_small.bmp

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "바탕화면에 바로가기 만들기"; GroupDescription: "바로가기 옵션:"; Flags: checkedonce

[Files]
; PyInstaller dist\Lumina\ 폴더 전체
Source: "dist\Lumina\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; 아이콘 파일
Source: "lumina.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "lumina_ico.png"; DestDir: "{app}"; Flags: ignoreversion
; 기본 설정 파일 (없을 때만)
Source: "lumina.conf.default"; DestDir: "{commonappdata}\Lumina"; DestName: "lumina.conf"; Flags: onlyifdoesntexist

[Icons]
; 시작 메뉴
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\lumina.ico"; Comment: "{#MyAppDescription}"
Name: "{group}\{#MyAppName} 제거"; Filename: "{uninstallexe}"; IconFilename: "{app}\lumina.ico"
; 바탕화면 (선택)
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\lumina.ico"; Tasks: desktopicon; Comment: "{#MyAppDescription}"

[Dirs]
Name: "{commonappdata}\Lumina"; Permissions: everyone-full
Name: "{commonappdata}\Lumina\logs"; Permissions: everyone-full

[Run]
; 서비스 자동 등록 (설치 시)
Filename: "{app}\{#MyAppExeName}"; Parameters: "--install-service"; Flags: runhidden waituntilterminated; StatusMsg: "서비스 등록 중..."
; 설치 후 GUI 실행 (선택)
Filename: "{app}\{#MyAppExeName}"; Description: "Lumina 에이전트 실행"; Flags: nowait postinstall skipifsilent unchecked

[UninstallRun]
; 서비스 중지 및 제거
Filename: "sc.exe"; Parameters: "stop Lumina"; Flags: runhidden waituntilterminated
Filename: "sc.exe"; Parameters: "delete Lumina"; Flags: runhidden waituntilterminated

[UninstallDelete]
Type: filesandordirs; Name: "{commonappdata}\Lumina"
Type: filesandordirs; Name: "{app}"

[Registry]
; 언인스톨 시 자동 시작 레지스트리 정리
Root: HKCU; Subkey: "SOFTWARE\Microsoft\Windows\CurrentVersion\Run"; ValueName: "Lumina"; Flags: uninsdeletevalue

[Code]
// Lumina 프로세스 강제 종료
procedure KillLuminaProcess;
var
  ResultCode: Integer;
begin
  Exec('taskkill.exe', '/F /IM Lumina.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

// 설치 초기화 — 기존 프로세스/서비스 정리 후 설치
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Result := '';
  Exec('sc.exe', 'stop Lumina', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  KillLuminaProcess;
end;

// 설치 완료 시 안내 메시지
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // 서비스는 [Run] 섹션에서 --install-service 로 자동 등록
  end;
end;

// 언인스톨 전 프로세스/서비스 정리
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
begin
  if CurUninstallStep = usUninstall then
  begin
    Exec('sc.exe', 'stop Lumina', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    KillLuminaProcess;
    Exec('sc.exe', 'delete Lumina', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;
