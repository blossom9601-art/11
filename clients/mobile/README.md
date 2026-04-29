# Blossom Chat — Android (Capacitor)

`clients/desktop/renderer/`(Electron 화면)을 그대로 재사용하여 안드로이드 앱으로 패키징합니다.

> 이전 React Native + Expo 시도는 [README.expo-old.md](README.expo-old.md) 로 보존됩니다.

## 1. 사전 설치 (필수)

검사 결과 현재 PC 에 **JDK 와 Android SDK 가 설치되어 있지 않습니다.** 다음 중 하나를 설치하세요.

### (권장) Android Studio
- 다운로드: https://developer.android.com/studio
- 설치 시 **Android SDK + 번들 JBR(JDK 21)** 이 함께 설치됩니다.
- 처음 실행하면 SDK Manager 가 떠 자동으로 SDK Platform 34 등을 받습니다.

### (최소) 명령행 빌드만 원할 때
- JDK 17 이상: https://adoptium.net/  (또는 Microsoft Build of OpenJDK)
- Android command-line tools: https://developer.android.com/studio#command-tools
  - `sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"`
- 환경변수
  - `JAVA_HOME` = JDK 경로
  - `ANDROID_HOME` = SDK 경로
  - `Path` 에 `%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;` 추가

설치 확인:
```
java -version          # 17 이상
adb version
```

## 2. 빌드

```powershell
cd C:\Users\ME\Desktop\blossom\clients\mobile
# (선택) 데스크톱 renderer 변경분 동기화
Copy-Item -Recurse -Force ..\desktop\renderer\* www\
# APK 빌드 (JAVA_HOME / ANDROID_HOME 자동 탐지)
powershell -ExecutionPolicy Bypass -File .\build.ps1
```
산출물: `android\app\build\outputs\apk\debug\app-debug.apk`

## 3. 실기기 설치

USB 디버깅 켠 안드로이드 기기를 연결한 뒤:
```
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```
또는 APK 파일을 카카오톡/구글드라이브로 폰에 보낸 뒤 직접 설치 (출처 불명 앱 허용 필요).

## 4. 서버 주소 / 자체서명 인증서

- 첫 실행 시 앱 내 설정에서 서버 URL 입력 (예: `https://192.168.56.108`).
- 자체서명 인증서/HTTP 사내망은 [`network_security_config.xml`](android/app/src/main/res/xml/network_security_config.xml) 의 `domain` 항목에 추가합니다. 현재 `192.168.56.108` 등이 등록되어 있고 **사용자 설치 CA** 도 신뢰합니다.
- 운영 환경에서는 cleartext 옵션을 끄고 정식 인증서를 권장합니다.

## 5. 코드 구조

```
clients/mobile/
├─ capacitor.config.json           # 앱ID com.blossom.chat / webDir www
├─ package.json                    # @capacitor/* 의존성 (RN 의존성도 남아있으나 미사용)
├─ build.ps1                       # JDK/SDK 자동 탐지 빌드 스크립트
├─ www/                            # ← clients/desktop/renderer/ 사본
│  ├─ index.html                   # CSP/뷰포트 모바일용 수정
│  ├─ styles/mobile.css            # titlebar 숨김, 안전영역 패딩
│  ├─ js/blossom-mobile-shim.js    # window.blossom 폴리필 (Preferences/App)
│  └─ ...                          # api.js, sse.js, app.js 그대로
└─ android/                        # `npx cap add android` 산출물
```

## 6. 데스크톱과 코드 동기화

데스크톱 renderer 변경 후 모바일 반영:
```powershell
cd C:\Users\ME\Desktop\blossom\clients\mobile
Copy-Item -Recurse -Force ..\desktop\renderer\* www\
npx cap sync android
```
> 모바일 전용 추가 라인(viewport, mobile.css link, shim script)이 `index.html` 에 들어 있으므로, 복사 후 변경분이 사라지면 다시 `index.html` 의 head/스크립트 블록을 보정해야 합니다.

## 7. 알려진 한계

- **자격증명 저장**: 현재 Capacitor Preferences (평문). 추후 Android Keystore 연동 필요.
- **푸시 알림**: 미구현. SSE 만 사용하므로 백그라운드/Doze 상태면 즉시 알림 어려움 → FCM 추가 권장.
- **파일 첨부 다운로드**: 데스크톱 다이얼로그가 모바일에서는 브라우저 기본 동작으로 대체됨.
- **레이아웃**: 1차 버전은 데스크톱 그리드를 그대로 사용. 좁은 폰은 가로 스크롤이 발생할 수 있어 추후 모바일 전용 레이아웃 분기가 필요합니다.
