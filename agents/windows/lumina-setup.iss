; Lumina Agent — Inno Setup 설치 스크립트
; 빌드: "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" lumina-setup.iss
;       또는 Inno Setup GUI에서 이 파일 열고 Compile (Ctrl+F9)

#define MyAppName "Lumina"
#define MyAppVersion "1.0.0"
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
OutputBaseFilename=Lumina-Setup-{#MyAppVersion}
SetupIconFile=lumina.ico
UninstallDisplayIcon={app}\lumina.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
LicenseFile=
WizardImageFile=
WizardSmallImageFile=

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "바탕화면에 바로가기 만들기"; GroupDescription: "바로가기 옵션:"; Flags: checkedonce
Name: "startupicon"; Description: "Windows 시작 시 자동 실행"; GroupDescription: "자동 실행:"; Flags: unchecked

[Files]
; PyInstaller dist\Lumina\ 폴더 전체
Source: "dist\Lumina\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; 아이콘 파일
Source: "lumina.ico"; DestDir: "{app}"; Flags: ignoreversion
; 기본 설정 파일 (없을 때만)
Source: "lumina.conf.default"; DestDir: "{commonappdata}\Lumina"; DestName: "lumina.conf"; Flags: onlyifdoesntexist uninsneveruninstall

[Icons]
; 시작 메뉴
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\lumina.ico"; Comment: "{#MyAppDescription}"
Name: "{group}\{#MyAppName} 제거"; Filename: "{uninstallexe}"; IconFilename: "{app}\lumina.ico"
; 바탕화면 (선택)
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\lumina.ico"; Tasks: desktopicon; Comment: "{#MyAppDescription}"

[Registry]
; 자동 시작 등록 (선택)
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Lumina"; ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue; Tasks: startupicon

[Dirs]
Name: "{commonappdata}\Lumina"; Permissions: everyone-full
Name: "{commonappdata}\Lumina\logs"; Permissions: everyone-full

[Run]
; 설치 후 실행 (선택)
Filename: "{app}\{#MyAppExeName}"; Description: "Lumina 에이전트 실행"; Flags: nowait postinstall skipifsilent unchecked

[UninstallDelete]
Type: filesandordirs; Name: "{commonappdata}\Lumina\logs"

[Code]
// 설치 완료 시 안내 메시지
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // 필요 시 추가 동작
  end;
end;
