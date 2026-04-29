# Blossom Mobile (React Native + Expo)

Blossom 사내 메신저 모바일 클라이언트. iOS / Android 푸시 알림 (FCM/APNs) 지원.

## 빠른 시작

```powershell
cd clients\mobile
npm install
npx expo start
```

Expo Go 앱(개발용) 또는 Dev Client 빌드(푸시 알림 실제 토큰 발급 필요 시)로 실행합니다.

## 폴더 구조
```
clients/mobile/
├─ App.js                       # 진입점 + 네비게이션
├─ app.json                     # Expo 설정 (bundle id, 권한, 알림 채널)
├─ package.json
└─ src/
   ├─ api/client.js             # REST 클라이언트 + Cookie 세션
   ├─ auth/AuthContext.js       # 로그인 상태 관리 + SecureStore
   ├─ push/pushService.js       # 푸시 토큰 등록 (/api/push/devices)
   └─ screens/
      ├─ LoginScreen.js
      ├─ ConversationListScreen.js
      ├─ ChatScreen.js
      └─ SettingsScreen.js
```

## 푸시 알림 설정

### iOS (APNs)
1. Apple Developer 계정에서 APNs Auth Key (.p8) 발급
2. `eas credentials` 또는 EAS 빌드 시 자동 구성
3. 백엔드 환경변수 `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_AUTH_KEY_PATH`, `APNS_BUNDLE_ID=kr.blossom.mobile`

### Android (FCM)
1. Firebase 콘솔에서 프로젝트 생성 → Android 앱 추가 (package: `kr.blossom.mobile`)
2. `google-services.json` 다운로드 → `clients/mobile/google-services.json` 위치 (또는 EAS Secret)
3. 서비스 계정 JSON 다운로드 → 백엔드 `FCM_SERVICE_ACCOUNT_JSON`, `FCM_PROJECT_ID` 설정

## 빌드 (스토어 배포)

```powershell
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile production
eas build --platform ios --profile production
```

## TODO
- 실시간 SSE는 현재 5초 폴링으로 임시 구현. `react-native-sse` 통합 예정.
- 첨부파일/이미지 송수신
- 멘션/반응 UI

## 보안
- Cookie 세션을 `expo-secure-store`(iOS Keychain / Android Keystore)에 저장
- 서버 URL HTTPS 강제 권장 (개발 시에만 HTTP 허용)
- 푸시 토큰은 디바이스별 1회 등록 후 백엔드의 `PushDevice` 테이블에서 관리
