# 사이드바 메뉴 화면 모듈화 리팩터링

## 목표

사이드바 메뉴별 리스트 화면에서 반복되는 CRUD, 검색, 테이블, 페이지네이션, 통계, 등록/수정 모달 구현을 공통 컴포넌트와 메뉴별 config/schema/api 조합으로 분리한다.

현재 Blossom은 Flask 템플릿과 정적 JavaScript를 직접 서빙하므로, 빌드 도구가 필요한 React/TypeScript 구조를 즉시 도입하지 않고 기존 방식과 호환되는 IIFE 기반 모듈 구조로 점진 전환한다.

## 적용 원칙

- 기존 화면은 한 번에 교체하지 않는다.
- 신규 공통 코드는 기존 페이지에 자동 연결하지 않는다.
- 메뉴별 예외 로직은 공통 컴포넌트에 넣지 않고 config, schema, hook, render 함수로 주입한다.
- CSS는 반드시 페이지 스코프 클래스를 사용한다.
- 공통 API 호출은 `BlossomAPI`와 호환되게 만든다.

## 추천 디렉터리 구조

```text
static/
  js/
    shared/
      api/
        crud-api.js
      components/
        data-table.js
        form-builder.js
        management-page.js
      hooks/
        use-table-data.js
        use-modal.js
        use-permission.js
      utils/
        csv.js
      types/
        management.typedef.js
    modules/
      facility-security/
        api/
        config/
        hooks/
        pages/
        schemas/
        types/
        validation/
  css/
    shared/
      management-page.css
      form-builder.css
    modules/
      facility-security.css
```

## 1차 추가 파일

공통 기반:

- `static/js/shared/api/crud-api.js`
- `static/js/shared/components/data-table.js`
- `static/js/shared/components/form-builder.js`
- `static/js/shared/components/management-page.js`
- `static/js/shared/hooks/use-table-data.js`
- `static/js/shared/hooks/use-modal.js`
- `static/js/shared/hooks/use-permission.js`
- `static/js/shared/utils/csv.js`
- `static/js/shared/types/management.typedef.js`
- `static/css/shared/management-page.css`
- `static/css/shared/form-builder.css`

시설·보안 파일럿:

- `static/js/modules/facility-security/config/facility-security.config.js`
- `static/js/modules/facility-security/api/facility-security.api.js`
- `static/js/modules/facility-security/schemas/facility-security.schema.js`
- `static/js/modules/facility-security/validation/facility-security.validation.js`
- `static/js/modules/facility-security/hooks/use-facility-security.js`
- `static/js/modules/facility-security/pages/facility-security.page.js`
- `static/js/modules/facility-security/types/facility-security.typedef.js`
- `static/css/modules/facility-security.css`

## 공통 컴포넌트 책임

### ManagementPage

화면 조립자 역할을 한다.

- 헤더 렌더링
- 검색 입력 렌더링
- 액션 버튼 렌더링
- DataTable 연결
- FormBuilder 연결
- 등록/수정 저장 처리
- 삭제처리 처리
- CSV 다운로드 처리
- 통계 hook 호출

### DataTable

테이블만 담당한다.

- 컬럼 기반 헤더/셀 렌더링
- 체크박스 선택 상태 관리
- 수정 버튼 이벤트 전달
- `column.render(row, helpers)` 커스텀 셀 지원

### FormBuilder

폼 마크업과 값 수집만 담당한다.

- schema 기반 폼 렌더링
- select 옵션 source 주입
- required 검증
- field별 validate 함수 실행

### CRUD API

Flask API 응답 형식과 화면 코드를 분리한다.

- `GET list`
- `POST create`
- `PUT update`
- `POST bulk-delete`
- `{ items | rows, total }` 응답 normalize

## 시설·보안 파일럿 연결 예시

기존 템플릿을 즉시 교체하지 않고, 별도 root를 둔 새 템플릿에서 먼저 검증한다.

```html
<link rel="stylesheet" href="/static/css/shared/management-page.css?v=20260516_modular1">
<link rel="stylesheet" href="/static/css/shared/form-builder.css?v=20260516_modular1">
<link rel="stylesheet" href="/static/css/modules/facility-security.css?v=20260516_modular1">

<div id="facility-security-management-root"></div>

<script src="/static/js/common/api-client.js?v=1.0.0"></script>
<script src="/static/js/common/modal-utils.js?v=1.0.0"></script>
<script src="/static/js/shared/api/crud-api.js?v=20260516_modular1"></script>
<script src="/static/js/shared/components/data-table.js?v=20260516_modular1"></script>
<script src="/static/js/shared/components/form-builder.js?v=20260516_modular1"></script>
<script src="/static/js/shared/components/management-page.js?v=20260516_modular1"></script>
<script src="/static/js/modules/facility-security/validation/facility-security.validation.js?v=20260516_modular1"></script>
<script src="/static/js/modules/facility-security/config/facility-security.config.js?v=20260516_modular1"></script>
<script src="/static/js/modules/facility-security/schemas/facility-security.schema.js?v=20260516_modular1"></script>
<script src="/static/js/modules/facility-security/api/facility-security.api.js?v=20260516_modular1"></script>
<script src="/static/js/modules/facility-security/hooks/use-facility-security.js?v=20260516_modular1"></script>
<script src="/static/js/modules/facility-security/pages/facility-security.page.js?v=20260516_modular1"></script>
```

## 점진 적용 단계

1. 공통 기반 파일을 추가하고 문법 검사를 통과시킨다.
2. 기존 시설·보안 페이지와 별도 테스트 템플릿에서 `facility-security-management-root` 기반으로 새 화면을 검증한다.
3. 기존 시설·보안 리스트 기능과 결과가 동일한지 비교한다.
4. 시설·보안 템플릿을 공통 ManagementPage 기반으로 교체한다.
5. 회사 화면을 두 번째 파일럿으로 이전한다.
6. customer, vendor, hardware, software 순서로 반복 CRUD 화면부터 이전한다.
7. 예외가 많은 상세 탭, 업로드, 다이어그램 화면은 공통화하지 않고 slot/render hook만 연결한다.

## 진행률 기준

- 15%: 변경 범위 확인
- 30%: 공통 API/DataTable/FormBuilder/ManagementPage 추가
- 45%: 공통 hook/util/CSS 추가
- 70%: 시설·보안 파일럿 모듈 추가
- 85%: 문법/인코딩 검증
- 100%: 파일럿 템플릿 연결 및 배포 검증

## 2026-05-17 진행 상태

시설·보안 리스트 화면을 공통 `ManagementPage` 기반으로 연결했다.

- 기존 시설·보안 그룹 탭은 템플릿에 유지한다.
- 반복 CRUD 영역은 `facility-security-management-root`에서 공통 컴포넌트가 렌더링한다.
- 기존 전용 add/edit/delete 모달 마크업은 제거하고 `FormBuilder`, `DataTable`, `BlossomModal.confirm()` 흐름으로 전환했다.
- 등록, 수정, 삭제처리, 일괄변경, 검색, 페이지 크기, CSV, 통계 버튼은 config 기반 액션으로 관리한다.
- `showHeader: false` 옵션으로 기존 Jinja 페이지 헤더와 공통 ManagementPage 헤더가 중복되지 않게 했다.

회사(company) 화면도 두 번째 파일럿으로 공통 `ManagementPage` 기반에 연결했다.

- 기존 조직 관리 탭은 템플릿에 유지한다.
- 반복 CRUD 영역은 `company-management-root`에서 공통 컴포넌트가 렌더링한다.
- 회사 전용 설정은 `static/js/modules/company/` 아래의 config, api, schema, validation, hook, page 파일로 분리했다.
- 회사 전용 CSS는 `static/css/modules/company.css`에 스코프 기반으로 분리했다.

고객(customer) 화면도 세 번째 적용 대상으로 공통 `ManagementPage` 기반에 연결했다.

- 기존 동적 고객 탭은 템플릿에 유지하고 `page_tab_renderer.js`를 계속 사용한다.
- 반복 CRUD 영역은 `customer-management-root`에서 공통 컴포넌트가 렌더링한다.
- 고객 전용 설정은 `static/js/modules/customer/` 아래의 config, api, schema, validation, hook, page 파일로 분리했다.
- 기존 `/api/customer-associates` 응답의 `associate_*`, `customer_*`, `member_*` 별칭을 module normalize/payload 단계에서 흡수한다.
- 고객명 상세 링크는 `column.render`와 page hook에서 처리해 기존 상세 컨텍스트 저장 흐름을 유지한다.

다음 단계는 vendor 화면의 로고 업로드와 상세 링크를 공통 FormBuilder/API의 file field slot으로 먼저 보강한 뒤 이전하고, 이후 hardware, software 반복 CRUD 화면으로 확장하는 것이다.

벤더(vendor) 화면은 제조사와 유지보수사를 같은 vendor module로 이전했다.

- `FormBuilder`에 file field와 이미지 미리보기 수집을 추가해 로고 업로드 UI를 공통 schema에서 표현한다.
- `ManagementPage`에는 `beforeSave`, `afterRender` hook을 추가해 메뉴별 저장 전 처리와 렌더 후 보정 작업을 config에 둘 수 있게 했다.
- 제조사와 유지보수사 공통 설정은 `static/js/modules/vendor/` 아래의 config, api, schema, validation, hook, page 파일로 분리했다.
- 로고 파일은 기존 `/api/vendor-logo/upload`에 먼저 업로드하고, 반환된 `logo_url`을 `/api/vendor-manufacturers` 또는 `/api/vendor-maintenance` JSON payload로 저장한다.
- 제조사 목록의 HW/SW/컴포넌트 수량은 기존 화면처럼 렌더 후 asset API에서 보정한다.

다음 단계는 hardware와 software 중 반복 CRUD 성격이 강한 목록부터 같은 패턴으로 이전하고, 업로드/컬럼 선택처럼 아직 공통화하지 않은 기능은 slot 또는 action hook으로 분리하는 것이다.

소프트웨어(software) 화면은 운영체제(OS) 유형 목록을 첫 적용 대상으로 이전했고, 이후 데이터베이스, 미들웨어, 가상화, 보안S/W, 고가용성 목록까지 같은 모듈로 확장했다.

- `ManagementPage`에 선택형 `analytics` 액션과 `window.__analyticsGetData` 노출 hook을 추가해 기존 `list-analytics.js` 기반 통계 분석 모달을 계속 사용할 수 있게 했다.
- 6개 소프트웨어 유형 목록은 모두 `software-management-root`에서 공통 컴포넌트가 렌더링한다.
- 공통 목록 HTML은 `app/templates/9.category/9-3.software/_software_type_list.html` partial로 분리하고, 각 메뉴 템플릿은 `apiBase`, `detailKey`, `idField`, `nameKey`, `typeKey`, `countKey`, `typeOptions`만 선언한다.
- 소프트웨어 전용 설정은 `static/js/modules/software/` 아래의 config, api, schema, validation, hook, page 파일로 분리했다.
- 제조사 select 옵션은 기존 `/api/vendor-manufacturers` 목록을 source로 주입한다.
- 모델명 상세 링크는 `software.page.js`에서 메뉴별 storage key와 typed ID(`os_id`, `db_id`, `middleware_id`, `virtual_id`, `security_id`, `ha_id`)를 `/api/category/detail-context`에 함께 갱신해 기존 상세 페이지 라우팅 흐름을 유지한다.
- `software.validation.js`와 `software.config.js`는 메뉴별 canonical field mapping을 사용해 OS, DB, 미들웨어, 가상화, 보안S/W, 고가용성 API payload와 list row alias를 흡수한다.

로컬 검증은 `node --check`, U+FFFD 인코딩 검사, Flask `test_client` 렌더링으로 수행했다. `/b/cat_sw_os`, `/b/cat_sw_database`, `/b/cat_sw_middleware`, `/b/cat_sw_virtualization`, `/b/cat_sw_security`, `/b/cat_sw_high_availability` 모두 200 응답과 `20260517_sw_modular2` marker를 확인했다.

하드웨어(hardware)는 SAN 유형 목록 파일럿 후 서버, 스토리지, 네트워크, 보안장비 목록까지 공통 모듈에 연결했다.

- `ManagementPage`에 `toolbarActions`, `onAction`, `onRowAction` hook을 추가하고 `DataTable`이 edit 외 row action을 상위로 전달할 수 있게 했다.
- `FormBuilder` select에 `preserveUnknown` 옵션을 추가해 기존 행의 제조사가 현재 옵션 목록에 없더라도 수정 폼에서 선택값을 보존할 수 있게 했다.
- 5개 하드웨어 유형 목록은 `hardware-management-root`에서 공통 컴포넌트가 렌더링하고, 공통 HTML은 `app/templates/9.category/9-2.hardware/_hardware_type_list.html` partial로 분리했다.
- 하드웨어 전용 설정은 `static/js/modules/hardware/` 아래의 config, api, schema, validation, hook, page, actions 파일로 분리했다.
- `hardware.actions.js`에서 엑셀 업로드, 불용처리 작업 목록 저장, 다중 행 부분 일괄변경을 공통 액션으로 제공한다.
- 다중 행 일괄변경은 선택 행마다 `PUT`을 호출하되 입력한 필드만 payload에 포함해 기존 값을 의도치 않게 지우지 않도록 했다.
- 엑셀 업로드는 템플릿 다운로드, 헤더 순서 검증, 수량 숫자 검증 후 행별 `POST` 생성으로 처리한다.
- 불용처리는 하드웨어 유형 목록의 기존 흐름과 맞춰 선택 행을 `dispose_selected_rows`에 저장하는 비파괴 작업 목록 방식으로 처리한다.
- `hardware.page.js`는 `san_selected_row`, legacy `unix:selectedRow`, `/api/category/detail-context`를 함께 갱신해 기존 상세 페이지 라우팅과 상세 JS를 유지한다.
- 로컬 검증은 `node --check`, U+FFFD 인코딩 검사, Flask `test_client` 렌더링으로 수행했다. `/b/cat_hw_server`, `/b/cat_hw_storage`, `/b/cat_hw_san`, `/b/cat_hw_network`, `/b/cat_hw_security` 모두 200 응답, `20260517_hw_actions1` marker, `hardware.actions.js` 로드, 기존 `1.*_list.js` 참조 제거를 확인했다.

이번 배치에서는 하드웨어 유형 목록의 반복 CRUD와 고급 목록 액션까지 공통 모듈로 이식했다. 실제 자산 목록의 subtype별 상세 액션 공통화는 별도 화면군 작업으로 남긴다.
