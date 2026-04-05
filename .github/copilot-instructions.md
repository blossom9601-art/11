# Blossom 프로젝트 가이드라인

## 프로젝트 개요
Flask 기반 IT 자산관리 시스템. 백엔드 Python 3 + Flask 2.3, 프론트엔드 바닐라 JS (ES5), DB는 개발 SQLite / 운영 MySQL. 빌드 도구 없이 정적 파일 직접 서빙.

## 아키텍처

### 백엔드
- **앱 팩토리**: [app/__init__.py](app/__init__.py) — `create_app()` 호출, 60+ `init_*_table()` 실행 후 15개 Blueprint 등록
- **라우트**: [app/routes/api.py](app/routes/api.py) (27K줄) 단일 파일에 모든 REST API. [app/routes/pages.py](app/routes/pages.py) `TEMPLATE_MAP` 딕셔너리로 페이지 라우팅
- **ORM**: [app/models.py](app/models.py) — 50+ SQLAlchemy 모델 (접두사: `Prj*`, `Net*`, `Wrk*`, `Svc*` 등)
- **서비스**: [app/services/](app/services/) — 도메인별 raw `sqlite3` CRUD 헬퍼 (보조 DB는 `instance/` 하위 별도 `.db` 파일)
- **API 응답 형식**: `{ "success": bool, "item": {}, "rows": [], "total": N, "error": "" }`
- **CRUD 패턴**: `GET`(목록), `POST`(생성), `PUT /<id>`(수정), `POST /bulk-delete`(소프트 삭제)

### 프론트엔드
- **JS**: [static/js/](static/js/) 번호 기반 폴더 구조 (`2.hardware/`, `8.project/` 등). 순수 바닐라 JS, 모듈/번들러 없음
- **CSS**: [static/css/](static/css/) 커스텀 CSS 48개 파일 (프레임워크 없음, Glassmorphism 디자인). 캐시 무효화 `?v=X` 쿼리스트링 사용
- **핵심 JS**: [blossom.js](static/js/blossom.js) (인증/네비게이션), [2.project_detail.js](static/js/8.project/8-1.project/8-1-3.project_list/2.project_detail.js) (프로젝트 상세 + `blsMakeTabCrud`)
- **`blsMakeTabCrud`**: 프로젝트 탭 CRUD 테이블 팩토리 (line ~6351). `columns[]` 배열에 `{key, label, type, compute, locked, inputFilter}` 정의. `window.__blsTabInits.tabNN`에 등록

### 파일 명명 규칙
- 템플릿/JS/CSS: **번호 접두사** — `2.hardware/2-1.server/2-1-1.onpremise/`
- 탭 파일: `tab{NN}-{name}.html`, `tab{NN}-{name}.js`
- 서비스: `{domain}_{entity}_service.py`
- 모델: PascalCase + 도메인 접두사 (`PrjProject`, `NetVpnLine`)

## 빌드 & 테스트

```powershell
# 가상환경 & 의존성
python -m venv .venv; .\.venv\Scripts\activate; pip install -r requirements.txt

# 서버 실행 (포트 8080)
python run.py

# DB 초기화
$env:FLASK_APP="run.py"; flask db upgrade; flask init-auth; flask seed-db

# 테스트
pytest                           # 전체 (58개 파일)
pytest -x -vv                    # 첫 실패 시 중단, 상세 출력
pytest tests/test_특정파일.py     # 단일 파일
```

## 프로젝트 컨벤션

### API 테스트 패턴
- [tests/conftest.py](tests/conftest.py): `authed_client` 픽스처로 인증 세션 주입, `tmp_path`로 DB 격리
- 보조 SQLite 테이블은 테스트 내에서 `scripts/sql/*.sql` 스키마 직접 실행하여 생성
- 파일명: `test_{domain}_{entity}_api.py`

### JS/CSS 수정 시
- **빌드 없음** — 파일 수정 후 HTML에서 `?v=` 쿼리스트링 버전만 올리면 됨
- CSS 버전: 해당 `.html` 파일 내 `<link>` 태그의 `?v=X.XX` 업데이트
- JS 버전: 해당 `.html` 파일 내 `<script>` 태그의 `?v=날짜코드` 업데이트
- `blsMakeTabCrud` 프레임워크 수정 시 모든 탭(71~80)에 영향 — 기존 탭 동작 확인 필수

### 한국어 사용
- UI 라벨, 주석, DB 시드 데이터 모두 한국어. 새로운 UI 문구도 한국어로 작성

## 주요 파일 참조

| 파일 | 줄 수 | 역할 |
|------|------:|------|
| `app/routes/api.py` | 27,471 | 전체 REST API 엔드포인트 |
| `static/js/.../2.project_detail.js` | ~9,000 | 프로젝트 상세 + blsMakeTabCrud |
| `static/js/blossom.js` | 5,872 | 코어 클라이언트 JS |
| `app/models.py` | 2,811 | SQLAlchemy 모델 전체 |
| `app/routes/pages.py` | 2,501 | 페이지 라우팅 (TEMPLATE_MAP) |
| `app/__init__.py` | 2,220 | 앱 팩토리 + Blueprint 등록 |
| `config.py` | 68 | Dev/Prod/Test 설정 |
