# Blossom - 자산관리 시스템

Flask + SQLite + HTTP 서버로 구현된 현대적인 자산관리 시스템입니다.

## 🚀 주요 기능

- **회사 관리**: 회사 정보 등록 및 관리
- **서버 관리**: 서버 자산 정보 관리
- **직원 관리**: 직원 정보 및 권한 관리
- **프로젝트 관리**: 프로젝트 및 작업 현황 관리
- **네트워크 관리**: 네트워크 구성 및 IP 관리
- **유지보수 관리**: 계약 및 정기점검 관리
- **실시간 대시보드**: 통계 및 현황 실시간 표시

## 🛠 기술 스택

- **Backend**: Flask (Python)
- **Database**: SQLite (개발) / MySQL (프로덕션)
- **ORM**: SQLAlchemy
- **Frontend**: HTML5, CSS3, JavaScript
- **UI/UX**: Modern Glassmorphism Design

## 📦 설치 및 실행

### 1. 환경 설정

```powershell
# (Windows PowerShell) 가상환경 생성 및 활성화
python -m venv .venv
.\.venv\Scripts\activate

# 의존성 설치
pip install -r requirements.txt
```

```bash
# (macOS/Linux) 가상환경 생성 및 활성화
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. 데이터베이스 & 마이그레이션 초기화

이 프로젝트는 Flask-Migrate(Alembic)를 사용합니다. 테이블은 마이그레이션으로 생성/갱신합니다.

```powershell
$env:FLASK_APP="run.py"

# 초기 마이그레이션 적용 (개발: SQLite dev_blossom.db)
flask db upgrade

# 기본 역할 및 샘플 데이터
flask init-auth
flask seed-db

# 관리자 계정 생성 (비대화형)
flask create-admin --emp-no=ADM001 --password="Admin1234!" --email=admin@example.com
```

모델 변경 후 마이그레이션:

```powershell
flask db migrate -m "schema update"
flask db upgrade
```

마이그레이션 상태 확인/롤백:

```powershell
flask db history
flask db current
flask db downgrade
```

### 2-1. 온프레미스 서버 자산 SQLite 초기화

온프레미스 하드웨어 자산(TAB 2-1-1) 관리를 위해 별도 SQLite DB(`instance/hardware_asset.db`)를 사용합니다. 스키마 생성과 기본 코드/샘플 데이터는 아래 스크립트가 담당합니다.

```powershell
python scripts/init_hardware_asset_db.py
```

- `scripts/sql/hardware_asset_schema.sql` : 금융권 감사 요건에 맞춘 테이블/FK 정의
- `scripts/init_hardware_asset_db.py` : 스키마 적용 + 참조 코드 + 예제 자산 1건 시드 (재실행 안전)

### 3. 서버 실행

```powershell
# 개발 모드 실행 (SQLite)
python run.py

# 환경변수로 호스트/포트 지정
$env:FLASK_ENV="development"
$env:PORT="8080"
$env:HOST="0.0.0.0"
python run.py
```

```bash
# macOS/Linux
export FLASK_ENV=development
export PORT=8080
export HOST=0.0.0.0
python run.py
```

### 4. 웹 브라우저에서 접속

```
http://localhost:8080
```

### 5. 테스트 실행 (PowerShell 출력 문제 우회)

Windows PowerShell 통합 터미널(PSReadLine)에서 pytest처럼 출력이 길고 빠르게 나오는 명령을 실행할 때,
간헐적으로 출력이 깨지거나 렌더링 예외가 발생할 수 있습니다.

이 경우 아래 “stable” 방식으로 실행하면 **출력 전체는 파일에 안전하게 저장**되고,
터미널에는 마지막 요약 부분만 출력되어 안정적으로 확인할 수 있습니다.

- VS Code Task: `Run tests (venv, capture summary, stable)`
	- 전체 출력 파일: `pytest_full_latest.txt`

- 스크립트 직접 실행: `scripts/run_pytest_capture.ps1`
	- 전체 테스트
		- `powershell -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/run_pytest_capture.ps1`
	- 특정 테스트 파일만
		- `powershell -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/run_pytest_capture.ps1 -TestPath tests/test_dc_access_system_api.py`
	- 키워드(-k)로 필터
		- `powershell -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/run_pytest_capture.ps1 -Keyword leased_lines`

## 📁 프로젝트 구조

```
blossom/
├── app/
│   ├── __init__.py          # Flask 앱 초기화
│   ├── models.py            # 데이터베이스 모델
│   ├── cli.py              # CLI 명령어
│   ├── routes/
│   │   ├── main.py         # 메인 라우트
│   │   └── api.py          # API 엔드포인트
│   ├── static/
│   │   ├── css/            # 스타일시트
│   │   ├── js/             # JavaScript
│   │   └── image/          # 이미지 리소스
│   └── templates/          # HTML 템플릿
├── config.py               # 설정 파일
├── run.py                  # 서버 실행 파일
└── requirements.txt        # 의존성 목록
```

## 🧩 템플릿 헤더/사이드바 공통화

모든 페이지에서 동일한 헤더/사이드바를 유지하기 위해 Jinja include를 사용합니다.

- 헤더 포함: `{% include 'layouts/_header.html' %}`
- 사이드바 포함: `{% include 'layouts/_sidebar.html' %}`

기존 페이지에 중복된 `<header class="main-header">…</header>` 또는 `<nav class="sidebar" id="sidebar">…</nav>` 블록이 있다면 위의 include로 교체해 주세요. 클래스/아이디는 유지되므로 기존 JS(`static/js/blossom.js`)와 스타일이 그대로 동작합니다.

보안 상 모든 사이드바 링크는 Flask 화이트리스트 라우트(`pages.show`, `/p/<key>`)를 사용하도록 되어 있습니다. 신규 페이지를 추가할 때는 라우트 키를 등록하고 사이드바에서 `url_for('pages.show', key='...')`를 사용하세요.

## 🔧 CLI 명령어

```bash
# (Deprecated) 직접 테이블 생성 - 마이그레이션 사용 권장
flask init-db

# 샘플 데이터 추가 (idempotent)
flask seed-db

# 데이터베이스 초기화 (모든 데이터 삭제 후 재생성)
flask reset-db

# 역할 초기화
flask init-auth

# 관리자 생성 (비대화형)
flask create-admin --emp-no=ADM001 --password="Admin1234!" --email=admin@example.com

# 역할 샘플 데이터 제거 (ADMIN, USER 등)
python scripts/purge_roles.py              # 기본: ADMIN, USER 삭제
python scripts/purge_roles.py --all        # 모든 역할 삭제
python scripts/purge_roles.py --roles=DEV,OPS --normalize-users  # 지정 역할 삭제 후 해당 사용자 role=USER 통일
python scripts/purge_roles.py --all --dry-run  # 실제 삭제 없이 대상만 출력

# 마이그레이션
flask db migrate -m "msg" && flask db upgrade
flask db history && flask db current
```

## 🌐 API 엔드포인트

### 회사 관리
- `GET /api/companies` - 회사 목록 조회
- `POST /api/companies` - 새 회사 생성

### 서버 관리
- `GET /api/servers` - 서버 목록 조회
- `POST /api/servers` - 새 서버 생성

### 직원 관리
- `GET /api/employees` - 직원 목록 조회
- `POST /api/employees` - 새 직원 생성

### 프로젝트 관리
- `GET /api/projects` - 프로젝트 목록 조회
- `POST /api/projects` - 새 프로젝트 생성

### 작업 관리
- `GET /api/tasks` - 작업 목록 조회
- `POST /api/tasks` - 새 작업 생성

### 대시보드 통계
- `GET /api/dashboard/stats` - 대시보드 통계 정보

### 온프레미스 서버 자산
- `GET /api/hardware/onpremise/assets` - 목록/페이지네이션 + 검색 (`q`, `page`, `page_size`, 업무 코드 필터)
- `GET /api/hardware/onpremise/assets/<id>` - 단일 자산 조회
- `POST /api/hardware/onpremise/assets` - 자산 등록 (JSON 페이로드, `asset_code`/`asset_name` 필수)
- `PUT /api/hardware/onpremise/assets/<id>` - 자산 수정 (부분 업데이트 가능)
- `POST /api/hardware/onpremise/assets/bulk-delete` - `ids` 배열을 받아 `is_deleted=1` 논리삭제

## 🎨 UI/UX 특징

- **Glassmorphism Design**: 현대적인 유리 효과 디자인
- **반응형 레이아웃**: 모바일/태블릿/데스크톱 지원
- **실시간 데이터**: 30초마다 자동 새로고침
- **직관적인 네비게이션**: 카테고리별 메뉴 구성
- **부드러운 애니메이션**: CSS3 트랜지션 효과

## 🔒 보안 기능

- **세션 관리**: Flask 세션 기반 인증
- **입력 검증**: SQL Injection 방지
- **XSS 방지**: 템플릿 이스케이핑
- **CSRF 보호**: 토큰 기반 보호

## 🚀 배포

### 개발 환경
```bash
export FLASK_ENV=development
python run.py
```

### 프로덕션 환경 (MySQL)
아래 환경변수를 설정하면 `ProductionConfig`가 MySQL에 연결합니다.

```powershell
$env:FLASK_ENV="production"
$env:MYSQL_HOST="localhost"
$env:MYSQL_PORT="3306"
$env:MYSQL_USER="root"
$env:MYSQL_PASSWORD="your_password"
$env:MYSQL_DB="blossom_db"
python run.py
```

프로덕션 DB에 마이그레이션 적용:

```powershell
$env:FLASK_APP="run.py"; flask db upgrade
```

### Docker 배포
```bash
docker build -t blossom .
docker run --rm \
	-e FLASK_ENV=production \
	-e MYSQL_HOST=host.docker.internal \
	-e MYSQL_PORT=3306 \
	-e MYSQL_USER=root \
	-e MYSQL_PASSWORD=your_password \
	-e MYSQL_DB=blossom_db \
	-p 8080:8080 blossom
```

## 📊 데이터베이스 스키마

### 주요 테이블
- `companies` - 회사 정보
- `employees` - 직원 정보
- `servers` - 서버 정보
- `storages` - 스토리지 정보
- `networks` - 네트워크 정보
- `software` - 소프트웨어 정보
- `maintenance` - 유지보수 정보
- `projects` - 프로젝트 정보
- `tasks` - 작업 정보
- `auth_users` - 인증 사용자
- `auth_roles` - 역할/권한
- `auth_login_history` - 로그인 기록
- `auth_password_history` - 비밀번호 변경 이력

## 🤝 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.

## 📞 지원

문제가 발생하거나 질문이 있으시면 이슈를 생성해 주세요.

---

**Blossom** - 현대적인 자산관리 시스템 🌸
