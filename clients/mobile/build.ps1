# clients/mobile/build.ps1
# Blossom Chat (Android) Debug APK 빌드
# - JAVA_HOME / ANDROID_HOME 자동 탐지 (Android Studio 기본 위치)
# - 실패 시 설치 안내 출력

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Find-JavaHome {
    if ($env:JAVA_HOME -and (Test-Path "$env:JAVA_HOME\bin\java.exe")) { return $env:JAVA_HOME }
    $cands = @(
        "C:\Program Files\Android\Android Studio\jbr",
        "C:\Program Files\Android\Android Studio\jre",
        "$env:LOCALAPPDATA\Programs\Android Studio\jbr",
        "$env:LOCALAPPDATA\Programs\Android Studio\jre"
    )
    Get-ChildItem "C:\Program Files\Eclipse Adoptium" -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^jdk-(17|21)' } | ForEach-Object { $cands += $_.FullName }
    Get-ChildItem "C:\Program Files\Java" -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^jdk-(17|21)' } | ForEach-Object { $cands += $_.FullName }
    Get-ChildItem "C:\Program Files\Microsoft" -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^jdk-(17|21)' } | ForEach-Object { $cands += $_.FullName }
    foreach ($c in $cands) { if (Test-Path "$c\bin\java.exe") { return $c } }
    return $null
}

function Find-AndroidHome {
    if ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) { return $env:ANDROID_HOME }
    if ($env:ANDROID_SDK_ROOT -and (Test-Path $env:ANDROID_SDK_ROOT)) { return $env:ANDROID_SDK_ROOT }
    $cands = @(
        "$env:LOCALAPPDATA\Android\Sdk",
        "C:\Android\Sdk",
        "$env:USERPROFILE\AppData\Local\Android\Sdk"
    )
    foreach ($c in $cands) { if (Test-Path "$c\platform-tools") { return $c } }
    return $null
}

$java = Find-JavaHome
$sdk  = Find-AndroidHome
if (-not $java -or -not $sdk) {
    Write-Host "[ERR] 빌드 환경이 부족합니다." -ForegroundColor Red
    if (-not $java) { Write-Host "  - JDK 17 이상이 필요합니다 (Android Studio 설치 시 jbr 자동 포함)." }
    if (-not $sdk)  { Write-Host "  - Android SDK 가 필요합니다 (Android Studio > SDK Manager)." }
    Write-Host "  설치 후 다시 실행하거나, JAVA_HOME / ANDROID_HOME 환경변수를 직접 지정하세요."
    exit 1
}
$env:JAVA_HOME    = $java
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:Path = "$java\bin;$sdk\platform-tools;" + $env:Path
Write-Host "[i] JAVA_HOME    = $java"
Write-Host "[i] ANDROID_HOME = $sdk"

# www 동기화
Write-Host "[1/3] cap sync android"
npx cap sync android | Out-Null

# 빌드
Set-Location "$root\android"
Write-Host "[2/3] gradlew assembleDebug"
.\gradlew.bat assembleDebug
if ($LASTEXITCODE -ne 0) { Write-Host "[ERR] Gradle build failed" -ForegroundColor Red; exit $LASTEXITCODE }

$apk = "$root\android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apk) {
    Write-Host "[3/3] APK ready: $apk" -ForegroundColor Green
} else {
    Write-Host "[ERR] APK 산출물을 찾을 수 없습니다." -ForegroundColor Red
    exit 1
}
