# UI 입력박스 스타일 통일 런북

## 목표
- `input/select/textarea` 및 검색형 드롭다운(`fk-searchable`)이 **어떤 페이지/탭/테이블이든 동일한 박스 룩**(높이/패딩/테두리/라운드/hover/focus/disabled)으로 보이게 한다.

## 이번 이슈의 실제 원인(재발 방지 핵심)
- AD tab52/tab54의 인라인 편집 행에서 `select`(유형/상태)와 다른 입력칸(담당자/만료일 등)의 **컨트롤 규격(높이/패딩/보더)이 달라** 같은 행에서 박스 스타일이 깨져 보였다.
- 또 `fk-searchable-display`는 기본적으로 커스텀 UI라서, 테이블/페이지별로 `select.form-input`과 동일 규격으로 맞춰주지 않으면 **화살표/패딩/보더가 어긋나기 쉽다**.

## 해결 원칙(앞으로 무조건 이 순서로)
1) **전역(공통) 스타일을 먼저 통일**
   - `detail.css`의 `.form-input` / `select.form-input`을 기준으로
   - `.fk-searchable-control .fk-searchable-display`를 동일 규격으로 맞춘다.

2) **테이블은 테이블 규격으로 통일(중요)**
   - `.hw-table` 계열은 보통 더 컴팩트한 컨트롤(예: `height:36px; font-size:13px; padding:8px 10px; border:1px; radius:6px`)이 사용된다.
   - 따라서 테이블 내부에서는 `#...-table td ...` 스코프로 **테이블용 규격을 강제**해야 “행 안에서” 완전 통일된다.

   - 예) 비용관리 상세의 “계약정보(tab61)”은 인라인 편집 input이 많아서, 전역 `.form-input`을 그대로 쓰면 박스가 과하게 커진다.
     - 해결: JS에서 입력칸에 전용 클래스(`.tab61-input`)를 부여하고, `detail.css`에서 `#hw-spec-table input.form-input.tab61-input`로 컴팩트 규격을 오버라이드한다.

3) **페이지 스코프(body 클래스)로 focus 룩까지 맞추기**
   - 특정 페이지에서만 focus/검색 패널 룩을 다르게 주는 경우가 있으니,
   - 필요하면 `<body class="page-...">`를 부여하고 `detail.css`의 페이지 스코프 선택자에 포함시킨다.

4) **캐시버스터는 항상 확인**
   - HTML이 실제로 어떤 `/static/css/detail.css?v=...`를 로드하는지부터 본다.
   - 로직/스타일 바꿨는데 “안 바뀐다”는 대부분 캐시/버전 문제다.

## 빠른 체크리스트(5분 컷)
- [ ] 해당 페이지 HTML에 `detail.css?v=`가 기대값인지
- [ ] 인라인 생성 `select`가 `search-select` + `data-searchable-scope="page"`를 갖는지(동적 렌더링 이슈)
- [ ] 테이블 내부에서 `select/input/textarea` 규격이 동일한지(높이/패딩/보더)
- [ ] `fk-searchable-display`가 테이블 규격과 동일한지(패딩/우측 여백/clear 버튼 위치)

## 관련 코드 위치
- 공통 입력 스타일: `static/css/detail.css`의 `.form-input`, `select.form-input`
- searchable dropdown UI: `static/js/ui/searchable_select.js` + `static/css/detail.css`의 `.fk-searchable-control`
- AD tab52/tab54: 템플릿은 `app/templates/4.governance/4-3.network_policy/4-3-3.ad/`
- 비용관리 tab61(계약정보) 인라인 편집: `static/js/7.cost/tab71-opex.js` + `static/css/detail.css`

## 사례: 출입등록 모달 "비고" 라벨-textarea 간격 과다 (2026-04)

### 증상
- 출입 등록 모달(`/p/dc_access_control`)에서 "비고" 라벨과 textarea 사이에 다른 필드(물품장비, 물품수량 등)보다 과도한 세로 공백 발생

### 근본 원인
`_header.html`에서 로드되는 `components.css`가 `center.css` **이후**에 적용되면서 다음 규칙이 override됨:

```css
/* components.css — center.css보다 뒤에 로드 → 우선 적용 */
.form-row { gap: var(--spacing-md, 16px); margin-bottom: var(--spacing-md, 16px); }
.form-row > * { flex: 1; }
```

- `gap: 16px` → label과 textarea 사이 간격을 16px로 벌림 (center.css의 `gap: 8px`을 override)
- `margin-bottom: 16px` → form-row 아래 여백 추가 (grid gap과 이중 적용)
- `form-row > * { flex: 1 }` → 수평 폼용 규칙이 세로 레이아웃에 잘못 적용

### 해결
`center.css`의 `.form-grid .form-row` 규칙에 높은 specificity로 명시적 리셋 추가:

```css
/* center.css — components.css의 .form-row 오버라이드를 리셋 */
.server-add-modal .form-grid .form-row,
.server-edit-modal .form-grid .form-row {
    gap: 8px;
    margin-bottom: 0;
}
.server-add-modal .form-grid .form-row > *,
.server-edit-modal .form-grid .form-row > * {
    flex: none;
}
```

### 교훈 (재발 방지)
1. **CSS 로드 순서를 반드시 확인**: 페이지 전용 CSS(`center.css`)가 `_header.html`의 공통 CSS(`components.css`, `bls-modal.css`)보다 먼저 로드되므로, 공통 CSS의 낮은 specificity 규칙이 페이지 CSS를 override할 수 있음
2. **`components.css`의 `.form-row` 규칙은 범용 폼 컴포넌트용** — 모달 내부 `.form-grid` 레이아웃과 충돌 가능. 모달 폼에서는 `.server-add-modal`/`.server-edit-modal` 스코프로 리셋 필요
3. **CSS-only 수정이 안 먹힐 때**: inline style이 아닌 **CSS 로드 순서 + specificity 경쟁**을 먼저 의심할 것
4. **진단 방법**: `_diag_css_cascade.py` 스크립트로 실제 로드되는 CSS 파일 순서와 `.form-row` 적용 규칙을 추출하여 cascade 확인

### 관련 파일
- `static/css/center.css` — 모달 폼 스타일 (line ~717, ~938)
- `static/css/components.css` — 공통 컴포넌트 (`.form-row` 규칙)
- `app/templates/layouts/_header.html` — CSS 로드 순서 결정
- `app/templates/6.datacenter/6-1.access/6-1-1.access_control/1.access_control_list.html` — 출입등록 페이지

## 자동 진단
- 아래 스크립트로 페이지/스타일 통일 여부를 빠르게 점검 가능:
  - `scripts/diag_ui_input_style_unification.py`
