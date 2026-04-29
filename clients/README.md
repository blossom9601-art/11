# Blossom Clients

Blossom의 멀티플랫폼 클라이언트 모음.

| 폴더 | 플랫폼 | 스택 |
|------|--------|------|
| [`desktop/`](./desktop) | Windows / macOS / Linux | Electron 30 + 바닐라 JS |
| [`mobile/`](./mobile) | iOS / Android | React Native (Expo SDK 51) |

두 클라이언트 모두 동일한 백엔드(Flask)와 통신:
- REST: `/api/auth/*`, `/api/chat/v2/*`, `/api/push/devices`
- 실시간: SSE (`/api/chat/v2/stream`) — 모바일은 임시 폴링
- 푸시: 백엔드 `push_dispatch_service`가 FCM(Android) / APNs(iOS) / WebPush로 송출
