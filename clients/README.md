# Blossom Clients

Blossom의 멀티플랫폼 클라이언트 모음.

| 폴더 | 플랫폼 | 스택 |
|------|--------|------|
| [`desktop/`](./desktop) | Windows / macOS / Linux | Electron 30 + 바닐라 JS |

데스크톱 클라이언트는 동일한 백엔드(Flask)와 통신:
- REST: `/api/auth/*`, `/api/chat/v2/*`
- 실시간: SSE (`/api/chat/v2/stream`)
