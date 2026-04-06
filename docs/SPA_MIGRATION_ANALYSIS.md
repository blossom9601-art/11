# SPA 전환 분석 및 설계 문서

> **작성일**: 2026-04-05  
> **핵심 원칙**: 디자인 100% 유지. CSS 0줄 변경. DOM 구조 보존.

---

## A. 디자인 영향도 분석

### 1. 현재 HTML 구조 (레이아웃, 주요 DOM 계층)

```
<html lang="ko">
├── <head>
│   ├── design-tokens.css, components.css, blossom.css, bls-modal.css, bls-stats-modal.css
│   └── 페이지별 CSS (detail-server.css 등) — SPA 네비게이션 시 동적 주입
├── <body data-menu-code="...">
│   ├── <header class="main-header">          ← 고정 (z-index 100, h=64px)
│   │   ├── .header-left (로고 + 타이틀)
│   │   └── .header-right (메뉴/알림/채팅/달력/계정 버튼)
│   ├── <nav class="sidebar" id="sidebar">    ← 고정 (w=260px, z-index 50)
│   │   └── .sidebar-menu > .menu-list > .menu-item (has-submenu)
│   ├── <main class="main-content">           ← **SPA 교체 대상 (여기만 교체)**
│   │   ├── .page-header / .content-header
│   │   ├── .system-tabs (.system-tab-btn)    ← 카테고리 탭
│   │   ├── .tab-content                       ← 탭 콘텐츠
│   │   ├── #system-table / .spec-table        ← 데이터 테이블
│   │   ├── .server-detail-tabs                ← 상세 페이지 탭 바
│   │   └── 페이지별 콘텐츠
│   └── body 레벨 모달 (.modal-overlay-full, .server-*-modal, .system-*-modal)
```

### 2. 주요 CSS 클래스 구조

| 영역 | 클래스 | 역할 | 변경 여부 |
|------|--------|------|-----------|
| 헤더 | `.main-header`, `.header-left/right`, `.header-btn` | 고정 상단 바 | **불변** |
| 사이드바 | `#sidebar`, `.sidebar-menu`, `.menu-list`, `.menu-item`, `.submenu` | 왼쪽 네비게이션 | **불변** |
| 메인 | `.main-content` | 페이지 콘텐츠 컨테이너 | **불변** |
| 탭 | `.system-tabs`, `.system-tab-btn`, `.server-detail-tabs`, `.server-detail-tab-btn` | 탭 네비게이션 | **불변** |
| 테이블 | `#system-table`, `.spec-table`, `#system-empty` | 데이터 표시 | **불변** |
| 모달 | `.modal-overlay-full`, `.server-add-modal`, `.server-edit-modal` | CRUD 폼 | **불변** |
| 스켈레톤 | `.spa-skeleton`, `.spa-skeleton-bar`, `.spa-fade-in` | SPA 로딩 효과 | 기존 유지 |

### 3. 스타일이 적용되는 핵심 요소 (깨지면 안 되는 영역)

1. **헤더/사이드바 레이아웃**: `position: fixed`, `z-index` 계층 구조
2. **사이드바 3단계 상태**: expanded(260px) → collapsed → hidden
3. **main-content 마진/패딩**: 사이드바 상태에 따라 동적 조정
4. **Glassmorphism 디자인**: backdrop-filter, border-radius, box-shadow
5. **모달 오버레이**: body.modal-open + z-index 99~10000
6. **탭 active 상태**: active 클래스 기반 하이라이트

### 4. JS가 붙어있는 UI 영역

| UI 영역 | JS 파일 | 동작 |
|---------|---------|------|
| 사이드바 토글 | blossom.js | 3단계 상태 전환 + localStorage 저장 |
| 서브메뉴 | blossom.js | open/close 애니메이션 + 상태 복원 |
| SPA 네비게이션 | blossom.js (L3420~3950) | fetch → main 교체 → 스크립트 로드 |
| 시스템 탭 | blossom.js | 탭 클릭 → .tab-content 교체 |
| 상세 탭 | blossom.js | 상세 탭 클릭 → main 전체 교체 |
| 테이블 CRUD | 각 페이지 JS | 추가/수정/삭제/검색/페이지네이션 |
| blsMakeTabCrud | project_detail.js | 프로젝트 탭 CRUD 팩토리 |
| 모달 | 각 페이지 JS | show/hide + 폼 처리 |

### 5. DOM 구조 변경 시 영향도 분석

| 변경 | 위험도 | 사유 |
|------|--------|------|
| `<main>` 내부 교체 | ✅ 안전 | 이미 SPA에서 수행 중 |
| `<header>` 수정 | ❌ 위험 | 고정 레이아웃, z-index 영향 |
| `#sidebar` 수정 | ❌ 위험 | 3단계 상태, 서브메뉴 JS 의존 |
| body 모달 교체 | ✅ 안전 | 이미 SPA에서 수행 중 |
| `<head>` CSS 추가 | ✅ 안전 | 이미 SPA에서 수행 중 |

### 6. 절대 건드리면 안 되는 영역

1. **`<header class="main-header">`** — 구조/클래스 완전 보존
2. **`<nav class="sidebar" id="sidebar">`** — JS 이벤트 바인딩 의존
3. **모든 CSS 파일** — 0줄 변경 금지
4. **모든 클래스명** — 100% 동일 유지
5. **페이지별 HTML 템플릿 내부 구조** — 마크업 보존

---

## B. DOM 유지 전략

### 핵심 원칙
> HTML은 그대로 유지하고, JS만 SPA 방식으로 교체.  
> 서버 렌더링된 HTML을 클라이언트에서 그대로 받아 main에 삽입.

### 현재 SPA 동작 (이미 구현됨)

blossom.js에 이미 완전한 SPA 네비게이션이 존재:
- `__spaFetchPage(href)` — `/p/*` URL에서 전체 HTML 가져오기 (5분 캐시)
- `__spaSwapMain(html, href)` — `<main>` 교체 + CSS 동기화 + 모달 교체
- `__spaLoadScripts(doc)` — 순차 스크립트 로드 + DOMContentLoaded 인터셉트
- `__spaNavigate(href)` — 전체 플로우 (skeleton → fetch → swap → script → event)

### 현재 SPA가 커버하는 범위

| 영역 | SPA 방식 | 비고 |
|------|----------|------|
| 사이드바 링크 | ✅ | `#sidebar a.menu-link/submenu-link` |
| 시스템 탭 | ✅ | `.system-tab-btn` (.tab-content만 교체) |
| 상세 페이지 탭 | ✅ | `.server-detail-tab-btn` (main 전체 교체) |
| 히스토리 back/forward | ✅ | popstate 핸들러 |
| 프리페치 | ✅ | hover 시 미리 로드 |

### 현재 SPA가 커버하지 못하는 범위 (전체 리로드 발생)

| 영역 | 원인 | 영향 |
|------|------|------|
| 테이블 행 클릭 → 상세 페이지 | `window.location.href = '/p/...'` | **높음** |
| "목록으로 돌아가기" 버튼 | `<a href="/p/...">` (HTML) | **높음** |
| 거버넌스 대시보드 카드 링크 | `<a href="/p/...">` (HTML) | 중간 |
| 비용/유지보수 행 클릭 | `window.location.href = '/p/...'` | 중간 |
| 푸터 링크 (도움말/버전/개인정보) | `<a href="/p/...">` (HTML) | 낮음 |
| 벤더/고객 목록 행 클릭 | `window.location.href = href` | 중간 |

---

## C. SPA 전환 설계

### 전략: "기존 SPA 인프라 확장" (신규 구축 아님)

blossom.js의 기존 SPA 인프라를 100% 재사용하되, 커버리지를 확장한다.
이 접근법이 선택된 이유:
- 이미 `__spaSwapMain`이 디자인 보존을 검증됨
- 동일한 HTML 템플릿을 그대로 사용 → CSS 변경 0
- 추가 프레임워크/빌드 도구 불필요

### 단계별 구현

#### 1단계: 글로벌 `<a>` 링크 인터셉트 (blossom.js)
모든 `/p/*` `<a>` 태그 클릭을 SPA로 전환:
```javascript
document.addEventListener('click', function(e) {
    var link = e.target.closest('a[href]');
    if (!link) return;
    var href = link.getAttribute('href');
    if (!__spaCanIntercept(href)) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    // 이미 처리된 사이드바/탭 링크 제외
    if (link.closest('#sidebar')) return;
    if (link.classList.contains('system-tab-btn')) return;
    if (link.classList.contains('server-detail-tab-btn')) return;
    e.preventDefault();
    __spaNavigate(href);
}, { capture: false });
```

#### 2단계: 퍼블릭 SPA API 노출
JS 파일에서 `window.location.href = url` 대신 사용:
```javascript
window.blsSpaNavigate = function(href) {
    if (__spaCanIntercept(href)) {
        __spaNavigate(href);
    } else {
        window.location.href = href;
    }
};
```

#### 3단계: 핵심 JS 파일 수정
`window.location.href = '/p/...'` → `blsSpaNavigate('/p/...')` 교체:
- 테이블 행 클릭 핸들러 (Task, CAPEX, OPEX, Rack, Vendor, Customer 등)
- 스토리지 탭의 목록 복귀 로직

#### 4단계: 서버 템플릿 유지 (제거하지 않음)
> 서버 렌더링을 유지하는 것이 디자인 보존의 핵심이다.
> fetch로 가져온 HTML은 Flask가 렌더링한 완전한 페이지이므로 CSS/클래스가 100% 동일하다.

---

## D. 변경 전/후 비교

### DOM 구조 비교

| 요소 | 변경 전 (MPA 리로드) | 변경 후 (SPA) | 차이 |
|------|---------------------|---------------|------|
| `<header>` | 매 번 새로 로드 | **유지됨** | ⬆️ 성능 |
| `<nav#sidebar>` | 매 번 새로 로드 | **유지됨** | ⬆️ 성능 |
| `<main>` | 매 번 새로 로드 | fetch → 교체 | 동일 결과 |
| CSS | 매 번 전체 파싱 | 증분 동기화 | 동일 결과 |
| 모달 | 매 번 새로 로드 | body에 교체 | 동일 결과 |
| 스크립트 | 매 번 전체 로드 | 순차 동적 로드 | 동일 결과 |

### CSS 변경: 없음 (0줄)

### 클래스명 변경: 없음 (100% 동일)

### 신규 HTML 추가: 없음

---

## E. 검증 기준

- [x] 기존 화면과 완전히 동일한 UI
- [x] CSS 단 1줄도 변경 없음
- [x] 클래스명 100% 동일
- [x] DOM 구조 변경 없음
- [x] 사용자 입장에서 "디자인 변경 없음" 체감
- [x] 전체 리로드 → SPA 전환 → 동일 결과 → 성능만 향상

---

## F. 수정 대상 파일 목록 (완료)

### blossom.js (SPA 엔진 확장) ✅
- L3953: 글로벌 `<a>` 인터셉트 핸들러 추가
- L3980: 글로벌 호버 프리페치 추가
- L3993: `window.blsSpaNavigate()` API 노출

### 목록/상세 페이지 JS 파일 (45+ 파일 수정 완료) ✅
Python 스크립트 (`scripts/_spa_patch_location_href.py`)로 일괄 변환:
- 하드웨어: 서버(4), 스토리지(6), SAN(4), 네트워크(5), 보안장비(7)
- 데이터센터: 랙 상세(1)
- 비용: OPEX(2), CAPEX(1)
- 프로젝트: 태스크(3), 워크플로우 디자이너(3)
- 카테고리: 하드웨어/소프트웨어 대시보드(2), 벤더(2), 고객(2), 업무그룹(1)
- 인증: 역할 관리(1)
- 상세 탭: 스토리지 기본/할당(2)
