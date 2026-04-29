# Blossom Desktop (Electron)

Blossom 사내 메신저 데스크탑 클라이언트. REST/SSE를 통해 운영 백엔드와 통신.

## 빠른 시작

```powershell
cd clients\desktop
npm install
npm run start            # 일반 실행
npm run start:dev        # DevTools 분리 창
```

처음 실행 시 로그인 모달에서:
- 서버 주소: `https://192.168.56.108` (또는 운영 도메인)
- 사번 / 비밀번호 입력

## 기능
- 채널/DM 목록, 메시지 송수신
- SSE 기반 실시간 알림 (`chat.message.created`, `chat.event.card`, `chat.approval.card`, `chat.approval.update`)
- 시스템 트레이 + 네이티브 알림
- 미읽음 수 → 윈도우 작업표시줄 오버레이 / macOS dock 배지

## 빌드 (배포용 패키지)

```powershell
npm run dist:win         # Windows NSIS installer
npm run dist:mac         # macOS DMG (mac에서 실행)
npm run dist:linux       # Linux AppImage + RPM
```

빌드 결과물은 `clients/desktop/dist/`에 생성됩니다.

## 환경 변수
- `BLOSSOM_DEV=1` — DevTools를 자동으로 엽니다.

## 보안
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Renderer는 `window.blossom.*` (preload exposed) API만 사용. Node 직접 접근 차단.
- CSP는 `index.html`의 meta 태그로 강제.

## 자동 업데이트 (TODO)
electron-updater 통합 — GitHub Releases 또는 사내 파일서버 채널 사용 예정.
