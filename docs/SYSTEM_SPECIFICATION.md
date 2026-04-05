# Blossom IT 자산관리 시스템 — 전체 구조 및 명세서

| 항목 | 내용 |
|------|------|
| **문서 제목** | Blossom IT 자산관리 시스템 전체 구조 및 명세서 |
| **문서 버전** | v1.0.0 |
| **작성일** | 2026-03-28 |
| **작성자** | 시스템 아키텍트 |
| **보안등급** | 대외비 |
| **상태** | 초판 발행 |

---

## 목차 (Table of Contents)

1. [문서 개요](#1-문서-개요)
2. [시스템 개요](#2-시스템-개요)
3. [전체 시스템 구조](#3-전체-시스템-구조)
4. [메뉴 구조](#4-메뉴-구조)
5. [화면 명세](#5-화면-명세)
6. [기능 명세](#6-기능-명세)
7. [사용자 및 권한 체계](#7-사용자-및-권한-체계)
8. [데이터 흐름](#8-데이터-흐름)
9. [API 명세](#9-api-명세)
10. [공통 규칙](#10-공통-규칙)
11. [DB 설계 개요](#11-db-설계-개요)
12. [DB 테이블 목록](#12-db-테이블-목록)
13. [테이블 상세 정의](#13-테이블-상세-정의)
14. [테이블 관계도 설명](#14-테이블-관계도-설명)
15. [공통 컬럼 표준](#15-공통-컬럼-표준)
16. [운영 및 관리 관점](#16-운영-및-관리-관점)
17. [향후 확장 고려사항](#17-향후-확장-고려사항)

---

## 1. 문서 개요

### 1.1 문서 목적

본 문서는 **Blossom IT 자산관리 시스템**의 전체 아키텍처, 기능 명세, 데이터 모델, API 설계, 권한 체계를 체계적으로 기술한다. 개발, 운영, 인수인계, 감사 시 참조 기준 문서로 활용한다.

### 1.2 시스템 개요

Blossom은 기업의 IT 인프라 자산(서버, 스토리지, 네트워크, 보안장비 등)을 통합 관리하며, 거버넌스 정책, 프로젝트 관리, 작업 보고, 데이터센터 운영, 비용 관리, 협업 기능까지 포괄하는 엔터프라이즈급 ITSM(IT Service Management) 플랫폼이다.

### 1.3 대상 독자

| 대상 | 활용 목적 |
|------|-----------|
| 개발자 | 코드 구조 파악, 신규 기능 개발 |
| 운영자 | 시스템 운영·장애 대응 |
| PM/PL | 프로젝트 관리, 범위 확인 |
| 인수인계 담당자 | 시스템 이해 및 유지보수 |
| 감사 담당자 | 보안·컴플라이언스 검토 |

### 1.4 작성 범위

- 시스템 전체 아키텍처 (백엔드 + 프론트엔드 + DB)
- 메뉴 구조 및 화면 명세
- 기능 명세 및 업무 흐름
- REST API 전체 명세
- 권한 체계 및 인증/인가
- DB 스키마 및 테이블 관계
- 운영/보안 고려사항

### 1.5 용어 정의

| 용어 | 정의 |
|------|------|
| **자산(Asset)** | 서버, 스토리지, SAN, 네트워크, 보안장비 등 IT 인프라 구성요소 |
| **자산코드(asset_code)** | 자산을 유일하게 식별하는 코드 (예: `SVR-001`) |
| **소프트 삭제(Soft Delete)** | `is_deleted=1`로 표시하여 논리적으로 삭제, 물리적 데이터 유지 |
| **CIA** | 기밀성(Confidentiality)·무결성(Integrity)·가용성(Availability) 보안 등급 |
| **EOSL** | End of Service Life — 제품 지원 종료 |
| **DR** | Disaster Recovery — 재해복구 |
| **HA** | High Availability — 고가용성 |
| **OPEX** | Operating Expenditure — 운영비 |
| **CAPEX** | Capital Expenditure — 자본적 지출 |
| **MFA** | Multi-Factor Authentication — 다중 인증 |
| **emp_no** | 사번 — 사용자 고유 식별 번호 |
| **CRUD** | Create / Read / Update / Delete 기본 데이터 조작 |
| **blsMakeTabCrud** | 프로젝트 상세 페이지 탭 CRUD 팩토리 함수 |
| **Blueprint** | Flask의 모듈식 라우팅 단위 |

---

## 2. 시스템 개요

### 2.1 시스템 한줄 설명

> IT 인프라 자산의 수명주기를 통합 관리하고 거버넌스 정책을 실행하는 엔터프라이즈 ITSM 플랫폼

### 2.2 주요 목적

- IT 자산(하드웨어/소프트웨어)의 등록·변경·폐기 전 과정을 추적
- 거버넌스 정책(백업, 취약점, 패키지, IP/DNS/VPN/전용회선) 중앙 관리
- 데이터센터 물리적 환경(출입, 랙, 온습도, CCTV) 관리
- 프로젝트·작업·워크플로우를 통한 IT 운영 업무 관리
- 비용(OPEX/CAPEX) 추적 및 분석
- 변경 이력 추적 및 감사 로그 기록

### 2.3 핵심 사용자

| 사용자 유형 | 역할 |
|-------------|------|
| IT 인프라 관리자 | 서버·네트워크·보안장비 자산 등록 및 관리 |
| 시스템 운영자 | 일상 운영, 작업 보고, 장애 대응 |
| 보안 담당자 | 취약점 분석, 보안 정책 관리, 감사 추적 |
| 프로젝트 매니저 | 프로젝트 계획·실행·완료 관리 |
| 경영진/팀장 | 대시보드 분석, 비용 현황 조회, 승인 |
| 외부 협력사 | 유지보수 이력 조회 (제한된 접근) |

### 2.4 주요 기능 요약

| 영역 | 주요 기능 |
|------|-----------|
| **시스템(하드웨어)** | 서버(온프레미스/클라우드/프레임/워크스테이션), 스토리지, SAN, 네트워크, 보안장비 CRUD, 탭 기반 상세 정보 |
| **거버넌스** | DR 훈련, 백업 정책, 패키지 관리, 취약점 분석, IP/DNS/AD/VPN/전용회선 정책 |
| **데이터센터** | 출입 관리, 데이터 삭제 관리, 랙 레이아웃, 온습도 모니터링, CCTV |
| **비용관리** | OPEX/CAPEX 대시보드, 계약 관리, 비용 상세 추적 |
| **프로젝트** | PMBOK 기반 10대 관리영역(통합·범위·일정·비용·품질·자원·의사소통·위험·조달·이해관계자) |
| **작업관리** | 작업 보고서(생성→검토→승인→실행→완료), 서비스 티켓, 워크플로우 설계 |
| **인사이트** | 기술자료, 블로그, 대시보드 분석 |
| **카테고리** | 비즈니스 분류, 하드웨어·소프트웨어·컴포넌트 유형, 벤더·고객 관리 |
| **협업** | 실시간 채팅, 일정관리, 알림 |
| **설정/관리** | 사용자·역할·권한·보안정책·MFA·세션·메일·브랜드 관리 |

### 2.5 기대 효과

- IT 자산 가시성 확보 및 관리 표준화
- 보안 취약점의 선제적 식별 및 대응
- 운영 비용 최적화 및 투자 의사결정 지원
- 감사 추적 및 컴플라이언스 준수
- 부서 간 협업 효율화
- 프로젝트 이행률 향상 및 리스크 감소

---

## 3. 전체 시스템 구조

### 3.1 상위 아키텍처

```text
┌──────────────────────────────────────────────────────────┐
│                     사용자 (브라우저)                       │
│              Chrome / Edge / Firefox                      │
└───────────────────────┬──────────────────────────────────┘
                        │ HTTPS
                        ▼
┌──────────────────────────────────────────────────────────┐
│                     WEB UI Layer                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ HTML Templates (278개)  │ Vanilla JS (ES5)          │ │
│  │ Jinja2 서버사이드 렌더링  │ blossom.js (코어 5,872줄) │ │
│  │ 번호 기반 폴더 구조       │ Tab CRUD 프레임워크       │ │
│  │ Glassmorphism CSS (74개) │ SSE 실시간 이벤트          │ │
│  └─────────────────────────────────────────────────────┘ │
└───────────────────────┬──────────────────────────────────┘
                        │ REST API (JSON)
                        ▼
┌──────────────────────────────────────────────────────────┐
│               Application Server (Flask 2.3)              │
│  ┌──────────────┬──────────────┬───────────────────────┐ │
│  │  17 Blueprint │  89 Service  │  85 ORM Model         │ │
│  │  (라우팅)      │  (비즈니스)   │  (SQLAlchemy)         │ │
│  ├──────────────┼──────────────┼───────────────────────┤ │
│  │ 인증/MFA      │ 자산관리      │ 거버넌스 정책          │ │
│  │ 권한관리      │ 프로젝트      │ 작업보고/티켓          │ │
│  │ 세션관리      │ 비용관리      │ 채팅/일정/알림         │ │
│  │ 보안정책      │ 데이터센터    │ 변경이력 추적          │ │
│  └──────────────┴──────────────┴───────────────────────┘ │
│  Python 3 │ Flask 2.3 │ SQLAlchemy ORM │ Jinja2          │
└───────────────────────┬──────────────────────────────────┘
                        │
           ┌────────────┼────────────┐
           ▼            ▼            ▼
┌──────────────┐ ┌───────────┐ ┌──────────┐
│  Main DB     │ │ Asset DB  │ │ File     │
│  (SQLite /   │ │ (SQLite)  │ │ Storage  │
│   MySQL)     │ │ instance/ │ │ uploads/ │
│              │ │           │ │          │
│ ·사용자/권한  │ │ ·hardware │ │ ·첨부파일 │
│ ·프로젝트    │ │  _asset   │ │ ·프로필   │
│ ·작업보고    │ │ ·software │ │ ·다이어그램│
│ ·채팅/일정   │ │  _asset   │ │          │
│ ·거버넌스    │ │           │ │          │
│ ·변경이력    │ │           │ │          │
└──────────────┘ └───────────┘ └──────────┘
  개발: SQLite       SQLite3       로컬 파일
  운영: MySQL       (Raw SQL)     시스템
```

### 3.2 기술 스택

| 계층 | 기술 | 상세 |
|------|------|------|
| **프론트엔드** | HTML5 / CSS3 / Vanilla JS (ES5) | 빌드 도구 없음, 정적 파일 직접 서빙 |
| **템플릿 엔진** | Jinja2 | 서버사이드 렌더링, 레이아웃 상속 |
| **백엔드 프레임워크** | Flask 2.3 (Python 3) | Blueprint 기반 모듈 구조 |
| **ORM** | SQLAlchemy | 주요 모델 85개 |
| **개발 DB** | SQLite | 메인 DB + 보조 DB (instance/ 하위) |
| **운영 DB** | MySQL 8.0 | pymysql 드라이버, utf8mb4, Connection Pool |
| **인증** | 세션 기반 (Flask Session) | MFA 지원 (TOTP/SMS/이메일/회사OTP) |
| **실시간** | Server-Sent Events (SSE) | 캐시 무효화 브로드캐스트 |
| **파일 저장** | 로컬 파일시스템 (uploads/) | 최대 16MB |

### 3.3 계층 구조

```text
blossom/
├── app/                          # 애플리케이션 패키지
│   ├── __init__.py               # 앱 팩토리 (create_app)
│   ├── models.py                 # SQLAlchemy 모델 (85개 클래스, 2,811줄)
│   ├── routes/                   # Blueprint 라우팅 (17개)
│   │   ├── api.py                # REST API 전체 (27,471줄)
│   │   ├── auth.py               # 인증/관리 (3,500줄)
│   │   ├── pages.py              # 페이지 라우팅 TEMPLATE_MAP (2,501줄)
│   │   ├── main.py               # 메인/대시보드
│   │   ├── sse_api.py            # SSE 실시간
│   │   └── *_api.py              # 도메인별 특화 API (12개)
│   └── services/                 # 비즈니스 로직 (89개 서비스)
│       ├── hardware_asset_service.py   # 하드웨어 자산 (SQLite)
│       ├── software_asset_service.py   # 소프트웨어 자산 (SQLite)
│       ├── permission_service.py       # 권한 관리
│       └── ...                         # 도메인별 서비스
├── static/                       # 정적 파일 (빌드 없이 직접 서빙)
│   ├── js/                       # JavaScript (번호 기반 폴더)
│   │   ├── blossom.js            # 코어 JS (5,872줄)
│   │   ├── 1.dashboard/
│   │   ├── 2.hardware/
│   │   ├── 4.governance/
│   │   ├── 5.insight/
│   │   ├── 6.datacenter/
│   │   ├── 7.cost/
│   │   ├── 8.project/
│   │   ├── 9.category/
│   │   └── authentication/
│   └── css/                      # CSS (74개 파일, Glassmorphism)
├── instance/                     # 보조 SQLite DB 저장소
│   ├── hardware_asset.db
│   ├── software_asset.db
│   └── *.db                      # 기타 도메인별 DB
├── uploads/                      # 업로드 파일 저장
├── scripts/sql/                  # SQL 스키마 파일
├── tests/                        # 테스트 (58개 파일)
├── config.py                     # 환경별 설정
├── run.py                        # 애플리케이션 실행 진입점
└── requirements.txt              # Python 의존성
```

### 3.4 모듈 구조 — Blueprint 목록

| # | Blueprint | 파일 | 역할 |
|---|-----------|------|------|
| 1 | `main_bp` | main.py | 메인 페이지, 대시보드 |
| 2 | `pages_bp` | pages.py | TEMPLATE_MAP 기반 페이지 라우팅 (250+ 라우트) |
| 3 | `api_bp` | api.py | REST API 전체 (300+ 엔드포인트) |
| 4 | `auth_bp` | auth.py | 인증, 로그인, MFA, 세션, 관리자 기능 |
| 5 | `rack_detail_api_bp` | rack_detail_api.py | 랙 상세 API |
| 6 | `hw_interface_api_bp` | hw_interface_api.py | 인터페이스(NIC/포트) 관리 |
| 7 | `hw_maintenance_contract_api_bp` | hw_maintenance_contract_api.py | 유지보수 계약 |
| 8 | `hw_activate_api_bp` | hw_activate_api.py | 서버 활성화/부팅 절차 |
| 9 | `hw_firewalld_api_bp` | hw_firewalld_api.py | 방화벽 규칙 |
| 10 | `hw_frame_frontbay_api_bp` | hw_frame_frontbay_api.py | 프레임 전면 베이 |
| 11 | `hw_frame_rearbay_api_bp` | hw_frame_rearbay_api.py | 프레임 후면 베이 |
| 12 | `change_log_api_bp` | tab14_change_log_api.py | 변경 로그 |
| 13 | `change_event_api_bp` | change_event_api.py | 변경 이벤트 추적 |
| 14 | `sw_system_allocation_api_bp` | sw_system_allocation_api.py | 소프트웨어 시스템 할당 |
| 15 | `tab32_assign_group_api_bp` | tab32_assign_group_api.py | 스토리지 할당 그룹 |
| 16 | `notification_api_bp` | notification_api.py | 알림 시스템 |
| 17 | `sse_bp` | sse_api.py | SSE 실시간 이벤트 |

---

## 4. 메뉴 구조

### 4.1 메인 메뉴 계층

| 1Depth | 2Depth | 3Depth | 경로 | 설명 | 접근 권한 |
|--------|--------|--------|------|------|-----------|
| **대시보드** | — | — | `/dashboard` | 통합 현황 대시보드 | `dashboard_read` |
| **시스템** | 서버 | 온프레미스 | `/hw/server/onpremise` | 물리 서버 관리 | `hardware_read` |
| | | 클라우드 | `/hw/server/cloud` | 클라우드 서버 관리 | `hardware_read` |
| | | 프레임 | `/hw/server/frame` | 프레임(블레이드) 서버 관리 | `hardware_read` |
| | | 워크스테이션 | `/hw/server/workstation` | 워크스테이션 관리 | `hardware_read` |
| | 스토리지 | SAN 스토리지 | `/hw/storage/san` | SAN 스토리지 관리 | `hardware_read` |
| | | 백업 스토리지 | `/hw/storage/backup` | 백업 스토리지 관리 | `hardware_read` |
| | SAN | SAN 디렉터 | `/hw/san/director` | SAN 디렉터 스위치 관리 | `hardware_read` |
| | | SAN 스위치 | `/hw/san/switch` | SAN 스위치 관리 | `hardware_read` |
| | 네트워크 | L2 스위치 | `/hw/network/l2` | L2 스위치 관리 | `hardware_read` |
| | | L4 스위치 | `/hw/network/l4` | L4(로드밸런서) 관리 | `hardware_read` |
| | | L7 스위치 | `/hw/network/l7` | L7(ADC) 관리 | `hardware_read` |
| | | AP | `/hw/network/ap` | 무선 AP 관리 | `hardware_read` |
| | | 전용회선 | `/hw/network/dedicateline` | 전용회선 장비 | `hardware_read` |
| | 보안장비 | 방화벽 | `/hw/security/firewall` | 방화벽 관리 | `hardware_read` |
| | | VPN | `/hw/security/vpn` | VPN 장비 관리 | `hardware_read` |
| | | IDS | `/hw/security/ids` | 침입탐지시스템 관리 | `hardware_read` |
| | | IPS | `/hw/security/ips` | 침입방지시스템 관리 | `hardware_read` |
| | | HSM | `/hw/security/hsm` | 하드웨어 보안 모듈 | `hardware_read` |
| | | KMS | `/hw/security/kms` | 키 관리 시스템 | `hardware_read` |
| | | WIPS | `/hw/security/wips` | 무선침입방지시스템 | `hardware_read` |
| | | 기타 | `/hw/security/etc` | 기타 보안장비 | `hardware_read` |
| **거버넌스** | DR 정책 | DR 훈련 | `/gov/dr/training` | 재해복구 훈련 관리 | `governance_read` |
| | 백업 정책 | 대시보드 | `/gov/backup/dashboard` | 백업 현황 대시보드 | `governance_read` |
| | | 백업 정책 | `/gov/backup/policy` | 백업 대상/정책 관리 | `governance_read` |
| | | 테이프 관리 | `/gov/backup/tape` | 백업 테이프 관리 | `governance_read` |
| | 패키지 관리 | 대시보드 | `/gov/package/dashboard` | 패키지 현황 | `governance_read` |
| | | 패키지 목록 | `/gov/package/list` | 패키지 목록 | `governance_read` |
| | | 취약점 | `/gov/package/vulnerability` | CVE 취약점 관리 | `governance_read` |
| | 취약점 분석 | 대시보드 | `/gov/vulnerability/dashboard` | 취약점 현황 | `governance_read` |
| | | 취약점 분석 | `/gov/vulnerability/analysis` | 취약점 상세 분석 | `governance_read` |
| | | 취약점 가이드 | `/gov/vulnerability/guide` | 점검 가이드 | `governance_read` |
| | IP 정책 | 정책 목록 | `/gov/ip/policy` | IP 정책 관리 | `governance_read` |
| | DNS 정책 | 정책 목록 | `/gov/dns/policy` | DNS 정책 관리 | `governance_read` |
| | AD 정책 | 정책 목록 | `/gov/ad/policy` | AD 정책 관리 | `governance_read` |
| | VPN 정책 | VPN1~VPN5 | `/gov/vpn/policy/1~5` | VPN 회선별 정책 | `governance_read` |
| | 전용회선 정책 | 회원사/고객/VAN/제휴/사내 | `/gov/dedicatedline/*` | 전용회선 분류별 관리 | `governance_read` |
| | 불용자산 | 하드웨어/소프트웨어 | `/gov/unused/*` | 불용자산 현황 | `governance_read` |
| **데이터센터** | 출입 관리 | 출입 통제 | `/dc/access/control` | 출입 기록 관리 | `datacenter_read` |
| | | 출입 이력 | `/dc/access/records` | 출입 이력 조회 | `datacenter_read` |
| | | 출입 권한 | `/dc/authority/control` | 출입 권한 설정 | `datacenter_read` |
| | | 출입 시스템 | `/dc/access/system` | 출입 시스템 현황 | `datacenter_read` |
| | 데이터 삭제 | 삭제 관리 | `/dc/data/deletion` | 데이터 삭제 등록부 | `datacenter_read` |
| | | 삭제 시스템 | `/dc/data/deletion/system` | 삭제 대상 시스템 | `datacenter_read` |
| | RACK 관리 | Lab1~Lab4 | `/dc/rack/lab1~4` | 전산실별 랙 레이아웃 | `datacenter_read` |
| | 온/습도 관리 | Lab1~Lab4 | `/dc/thermo/lab1~4` | 온습도 모니터링 | `datacenter_read` |
| | CCTV 관리 | Lab1~Lab4 | `/dc/cctv/lab1~4` | CCTV 모니터링 | `datacenter_read` |
| **비용관리** | OPEX | 대시보드 | `/cost/opex/dashboard` | 운영비 현황 | `cost_read` |
| | | 하드웨어/소프트웨어/기타 | `/cost/opex/hardware` 등 | 운영비 상세 | `cost_read` |
| | CAPEX | 대시보드 | `/cost/capex/dashboard` | 투자비 현황 | `cost_read` |
| | | 하드웨어/소프트웨어/기타 | `/cost/capex/hardware` 등 | 투자비 상세 | `cost_read` |
| **프로젝트** | 프로젝트 현황 | 나의 프로젝트 | `/proj/status` | 내가 관리하는 프로젝트 | `project_read` |
| | | 참여 프로젝트 | `/proj/participating` | 참여 중인 프로젝트 | `project_read` |
| | | 완료 프로젝트 | `/proj/completed` | 완료된 프로젝트 | `project_read` |
| | 작업 현황 | 나의 작업 | `/task/status` | 내가 관리하는 작업 | `project_read` |
| | | 참여 작업 | `/task/participating` | 참여 중인 작업 | `project_read` |
| | 티켓 현황 | 워크플로우 진행 | `/workflow/progress` | 진행 중 티켓 | `project_read` |
| | | 워크플로우 완료 | `/workflow/completed` | 완료 티켓 | `project_read` |
| | 워크플로우 제작 | 탐색 | `/wf/designer/explore` | WF 설계 탐색 | `project_read` |
| | | 관리 | `/wf/designer/manage` | WF 관리 | `project_write` |
| | | 편집기 | `/wf/designer/editor` | WF 편집기 | `project_write` |
| **인사이트** | 트렌드 | — | `/insight/trend` | 기술 트렌드 | `insight_read` |
| | 보안 | — | `/insight/security` | 보안 동향 | `insight_read` |
| | 보고서 | — | `/insight/report` | 분석 보고서 | `insight_read` |
| | 기술자료 | — | `/insight/technical` | 기술 자료 | `insight_read` |
| | 블로그 | IT 블로그 | `/insight/blog/it` | IT 블로그 게시판 | `insight_read` |
| **카테고리** | 비즈니스 | 업무분류/구분/상태/운영/그룹 | `/cat/business/*` | 업무 분류 체계 관리 | `category_read` |
| | 하드웨어 | 서버/스토리지/SAN/네트워크/보안 유형 | `/cat/hw/*` | HW 유형 관리 | `category_read` |
| | 소프트웨어 | OS/DB/미들웨어/가상화/보안/HA 유형 | `/cat/sw/*` | SW 유형 관리 | `category_read` |
| | 컴포넌트 | CPU/GPU/메모리/디스크/NIC/HBA/기타 | `/cat/component/*` | 부품 유형 관리 | `category_read` |
| | 회사 | 센터/부서 | `/cat/company/*` | 조직 체계 관리 | `category_read` |
| | 고객 | 회원사/고객사 | `/cat/customer/*` | 고객 관리 | `category_read` |
| | 벤더 | 제조사/유지보수사 | `/cat/vendor/*` | 벤더 관리 | `category_read` |
| **설정** | 관리자 | 사용자 관리 | `/admin/auth/settings` | 사용자 목록/등록/수정 | ADMIN |
| | | 역할 관리 | `/admin/auth/groups` | 역할/그룹 관리 | ADMIN |
| | | 보안 설정 | `/admin/auth/security` | 비밀번호/세션 정책 | ADMIN |
| | | 메일 설정 | `/admin/auth/mail` | SMTP 설정 | ADMIN |
| | | 세션 관리 | `/admin/auth/sessions` | 활성 세션 모니터링 | ADMIN |
| | | 품질유형 관리 | `/admin/auth/quality-type` | 품질 분류 유형 | ADMIN |
| | | 변경 로그 | `/admin/auth/change-log` | 변경 이벤트 조회 | ADMIN |
| | | 페이지 탭 설정 | `/admin/auth/page-tab` | 동적 탭 설정 | ADMIN |
| | | 브랜드 설정 | `/admin/auth/brand` | 로고/시스템명 설정 | ADMIN |
| | 개인설정 | 프로필 | `/settings/profile` | 개인 프로필 수정 | 전체 |
| | | 비밀번호 | `/settings/password` | 비밀번호 변경 | 전체 |
| | | 메모 | `/settings/memo` | 개인 메모 | 전체 |

---

## 5. 화면 명세

### 5.1 하드웨어 자산 목록 화면

| 항목 | 내용 |
|------|------|
| **화면명** | 온프레미스 서버 목록 |
| **화면 ID** | `hw_server_onpremise` |
| **화면 목적** | 온프레미스 서버 자산의 목록 조회, 등록, 일괄 삭제 |
| **주요 기능** | 목록 조회, 상세 이동, 신규 등록, 일괄 삭제, CSV 다운로드, 컬럼 선택 |
| **조회조건** | 검색어(q), 카테고리, 업무분류, 센터, 상태, 삭제포함 여부 |
| **입력항목** | 신규: 자산코드, 자산명, 업무정보, IP, 제조사, 센터, 랙, 부서, 담당자 등 |
| **출력항목** | 자산코드, 자산명, 시스템명, IP, 제조사, 센터, 랙, 부서, 담당자, 상태, 보안등급 |
| **버튼** | 조회, 등록, 삭제, 다운로드, 컬럼선택, 전체선택 |
| **유효성** | 자산코드 필수·유니크, IP 형식 검증 |
| **권한** | 조회: `hardware_read`, 등록/수정/삭제: `hardware_write` |

### 5.2 하드웨어 자산 상세 화면

| 항목 | 내용 |
|------|------|
| **화면명** | 온프레미스 서버 상세 |
| **화면 ID** | `hw_server_onpremise_detail` |
| **화면 목적** | 서버 자산의 상세 정보를 탭 기반으로 관리 |
| **주요 기능** | 탭별 CRUD — 하드웨어/소프트웨어/백업/인터페이스/계정/권한/활성화/방화벽/스토리지/작업/취약점/패키지/로그/파일 |
| **권한** | 상세 탭별 권한은 `detail_page` + `*_detail_permission` 테이블로 제어 |
| **비고** | 공유 탭 템플릿(tab01~tab15) 활용, 장비 유형별 탭 구성 동일 |

**자산 상세 탭 목록 (서버 기준)**

| 탭 번호 | 탭 ID | 탭명 | 설명 |
|---------|--------|------|------|
| tab01 | `hw` | 하드웨어 | CPU, 메모리, 디스크 등 하드웨어 사양 |
| tab02 | `sw` | 소프트웨어 | 설치된 OS/DB/미들웨어/보안SW |
| tab03 | `backup` | 백업 | 백업 정책(정책명, 주기, 보관기간, 오프사이트) |
| tab04 | `if` | 인터페이스 | NIC, 포트, IP 할당 정보 |
| tab05 | `account` | 계정 | 시스템 계정(계정명, 유형, 로그인방식) |
| tab06 | `authority` | 권한 | 접근 권한 매트릭스 |
| tab07 | `activate` | 활성화 | 부팅/활성화 절차 기록 |
| tab08 | `firewalld` | 방화벽 | 서버별 방화벽 규칙 |
| tab10 | `storage` | 스토리지 | 할당된 스토리지 볼륨 |
| tab11 | `task` | 작업 | 서버 관련 작업 이력 |
| tab12 | `vulnerability` | 취약점 | 보안 취약점 점검 결과(항목/심각도/조치) |
| tab13 | `package` | 패키지 | 설치 패키지/CVE 추적 |
| tab14 | `log` | 변경 로그 | 자산 변경 이력 |
| tab15 | `file` | 파일 | 첨부파일 관리 |

### 5.3 프로젝트 상세 화면 (PMBOK 10대 영역)

| 항목 | 내용 |
|------|------|
| **화면명** | 프로젝트 상세 |
| **화면 ID** | `proj_completed_detail` |
| **화면 목적** | PMBOK 기반 프로젝트 관리 10대 영역의 통합 관리 |
| **주요 기능** | `blsMakeTabCrud` 프레임워크 기반 탭별 CRUD |

**프로젝트 상세 탭 목록**

| 탭 번호 | 탭명 | 설명 |
|---------|------|------|
| tab81 | 통합 관리 | 프로젝트 목표, 범위, 일정 통합 |
| tab82 | 범위 관리 | 요구사항 정의, WBS 분해 |
| tab83 | 일정 관리 | 일정 계획, 마일스톤, 진행률 |
| tab84 | 비용 관리 | 예산 편성, 실집행, EAC/EVM |
| tab85 | 품질 관리 | 품질 기준, 검토, 결과 기록 |
| tab86 | 자원 관리 | 인력 배치, 장비 할당 |
| tab87 | 의사소통 관리 | 의사소통 계획, 보고 체계 |
| tab88 | 위험 관리 | 리스크 식별, 평가, 대응 계획 |
| tab89 | 조달 관리 | 조달 계획, 벤더 선정, 계약 |
| tab90 | 이해관계자 관리 | 이해관계자 식별, 참여 전략 |

### 5.4 거버넌스 — DR 훈련 목록

| 항목 | 내용 |
|------|------|
| **화면명** | DR 훈련 관리 |
| **화면 ID** | `gov_dr_training` |
| **화면 목적** | 재해복구 훈련 계획 및 결과 관리 |
| **조회조건** | 훈련 연도, 훈련 유형, 상태, 키워드 검색 |
| **입력항목** | 훈련명, 유형, 일자, 대상시스템수, 참여인원, 참여조직, 복구시간, 결과, 비고 |
| **출력항목** | 연도, 일자, 훈련명, 유형, 상태, 결과, 대상시스템수, 참여인원, 복구시간 |
| **버튼** | 추가, 저장, 삭제, 복제, 일괄수정, CSV 다운로드 |
| **권한** | 조회: `governance_read`, 등록/수정/삭제: `governance_write` |

### 5.5 작업 보고서 화면

| 항목 | 내용 |
|------|------|
| **화면명** | 작업 보고서 |
| **화면 ID** | `wrk_report` |
| **화면 목적** | IT 운영 작업 보고서 생성·검토·승인·실행·완료 워크플로우 |
| **상태 흐름** | DRAFT → REVIEW → APPROVED → SCHEDULED → IN_PROGRESS → COMPLETED → ARCHIVED |
| **입력항목** | 문서번호, 기안일, 작업제목, 분류, 유형, 참여자(사용자/부서), 협력사, 작업결과(실제시작/종료/소요시간) |
| **버튼** | 제출, 회수, 반려, 초기승인, 최종승인, 결과제출, 취소, 일괄완료처리 |
| **권한** | 생성자·검토자·승인자별 단계별 액션 제한 |

### 5.6 거버넌스 상세 페이지 (공통 탭 패턴)

다음 거버넌스 항목은 모두 동일한 탭 구조(목록 + 상세)를 공유한다:

| 거버넌스 항목 | 상세 탭 구성 |
|--------------|-------------|
| IP 정책 | IP대역, 로그, 파일 |
| DNS 정책 | DNS 레코드, 로그, 파일 |
| AD 정책 | 도메인, 계정, FQDN, 로그, 파일 |
| VPN 정책 (1~5) | 담당자, 통신현황, VPN정책, 로그, 파일 |
| 전용회선 (회원사/고객/VAN/제휴/사내) | 담당자, 작업, 로그, 파일 |

### 5.7 데이터센터 화면 목록

| 화면명 | 화면 ID | 설명 |
|--------|---------|------|
| 출입 통제 | `dc_access_control` | 출입 등록/관리 |
| 출입 이력 | `dc_access_records` | 출입 기록 조회 |
| 출입 권한 | `dc_authority_control` | 지역(Zone)별 출입 권한 부여 |
| 출입 시스템 | `dc_access_system` | 출입 연동 시스템 현황 |
| 데이터 삭제 등록부 | `dc_data_deletion` | 데이터 삭제 관리 |
| 랙 레이아웃 (Lab1~4) | `dc_rack_lab1~4` | 전산실별 랙 배치도 |
| 랙 상세 | `dc_rack_detail_basic` | 랙 단위 상세 정보(기본/작업/로그/파일) |
| 온습도 모니터링 (Lab1~4) | `dc_thermo_lab1~4` | 전산실 온습도 현황 |
| CCTV 모니터링 (Lab1~4) | `dc_cctv_lab1~4` | 전산실 CCTV 현황 |

### 5.8 비용관리 화면 목록

| 화면명 | 화면 ID | 설명 |
|--------|---------|------|
| OPEX 대시보드 | `cost_opex_dashboard` | 운영비 종합 현황 |
| OPEX 하드웨어 | `cost_opex_hardware` | 하드웨어 운영비 상세(계약/로그/파일 탭) |
| OPEX 소프트웨어 | `cost_opex_software` | 소프트웨어 운영비 |
| OPEX 기타 | `cost_opex_etc` | 기타 운영비 |
| CAPEX 대시보드 | `cost_capex_dashboard` | 투자비 종합 현황 |
| CAPEX 계약 | `cost_capex_contract` | 투자 계약 관리 |
| CAPEX 하드웨어 | `cost_capex_hardware` | 하드웨어 투자비 상세 |
| CAPEX 소프트웨어 | `cost_capex_software` | 소프트웨어 투자비 |

### 5.9 채팅 및 일정 화면

| 화면명 | 화면 ID | 설명 |
|--------|---------|------|
| 채팅 | `chat` | 1:1 / 그룹 실시간 메시지, 파일 전송 |
| 일정 관리 | `calendar` | 개인/부서/전사 일정 등록, 공유 범위 설정 |

### 5.10 카테고리 상세 페이지 (공통 탭 패턴)

| 카테고리 항목 | 상세 탭 구성 |
|--------------|-------------|
| 비즈니스 그룹 | 담당자, 시스템, 서비스, 작업, 로그, 파일 |
| HW/SW/컴포넌트 유형 | 하드웨어/시스템, 작업, 로그, 파일 |
| 고객 | 담당자, 작업, 로그, 파일 |
| 제조사(Vendor) | 담당자, 하드웨어, 소프트웨어, 컴포넌트, 작업, 로그, 파일 |
| 유지보수사(Vendor) | 담당자, 하드웨어, 소프트웨어, SLA, 이슈, 작업, 로그, 파일 |

---

## 6. 기능 명세

### 6.1 자산 등록 (Create)

| 항목 | 내용 |
|------|------|
| **기능명** | 하드웨어 자산 등록 |
| **기능 ID** | `FN-HW-001` |
| **설명** | 신규 IT 하드웨어 자산을 시스템에 등록 |
| **입력값** | `asset_code`(필수), `asset_name`(필수), `asset_category`, `asset_type`, `work_category_code`, `system_ip`, `manufacturer_code`, `center_code`, `rack_code`, `system_dept_code`, `system_owner_emp_no`, CIA 등급 등 |
| **처리 로직** | 1. 입력값 검증 (asset_code 유니크 확인) → 2. 기본값 세팅 (created_at, created_by) → 3. DB INSERT → 4. 변경 이벤트 기록(change_event) → 5. 응답 반환 |
| **출력값** | `{"success": true, "item": {...}}` |
| **예외 상황** | 중복 자산코드(409), 필수값 누락(400), 인증 실패(401), 권한 부족(403) |
| **권한 조건** | `hardware_write` |
| **연관 테이블** | `hardware`, `change_event`, `change_diff` |
| **연관 API** | `POST /api/hardware/assets` |

### 6.2 자산 수정 (Update)

| 항목 | 내용 |
|------|------|
| **기능명** | 하드웨어 자산 수정 |
| **기능 ID** | `FN-HW-002` |
| **설명** | 기존 자산 정보 수정, 변경 전후 diff 기록 |
| **입력값** | 자산 ID(경로 파라미터), 수정 필드(JSON body) |
| **처리 로직** | 1. 기존 데이터 조회 → 2. 변경 필드 비교(diff 생성) → 3. DB UPDATE → 4. change_event + change_diff 기록 → 5. 응답 반환 |
| **출력값** | `{"success": true, "item": {...}}` |
| **예외 상황** | 자산 미존재(404), 동시 수정 충돌(409) |
| **권한 조건** | `hardware_write` |
| **연관 테이블** | `hardware`, `change_event`, `change_diff` |
| **연관 API** | `PUT /api/hardware/assets/<id>` |

### 6.3 자산 소프트 삭제 (Soft Delete)

| 항목 | 내용 |
|------|------|
| **기능명** | 자산 일괄 삭제 |
| **기능 ID** | `FN-HW-003` |
| **설명** | 선택된 자산들을 `is_deleted=1`로 소프트 삭제 |
| **입력값** | `{"ids": [1, 2, 3]}` (POST body) |
| **처리 로직** | 1. ID 목록 검증 → 2. 각 자산 `is_deleted=1`, `updated_at`, `updated_by` 갱신 → 3. 삭제 이벤트 기록 → 4. 삭제 건수 반환 |
| **출력값** | `{"success": true, "deleted": 3}` |
| **권한 조건** | `hardware_write` |
| **연관 API** | `POST /api/hardware/assets/bulk-delete` |

### 6.4 목록 조회 (List)

| 항목 | 내용 |
|------|------|
| **기능명** | 자산 목록 조회 |
| **기능 ID** | `FN-HW-004` |
| **설명** | 검색 조건에 따른 자산 목록 조회 (페이징, 정렬, 필터) |
| **입력값** | `q`(검색어), `asset_category`, `center_code`, `include_deleted`, `page`, `page_size`, `sort_by`, `sort_dir` |
| **처리 로직** | 1. `is_deleted=0` 기본 필터 → 2. 조건별 WHERE 추가 → 3. 정렬 적용 → 4. 페이징 → 5. DTO 변환 |
| **출력값** | `{"success": true, "items": [...], "total": 150}` |
| **권한 조건** | `hardware_read` |
| **연관 API** | `GET /api/hardware/assets` |

### 6.5 작업 보고서 워크플로우

| 항목 | 내용 |
|------|------|
| **기능명** | 작업 보고서 승인 워크플로우 |
| **기능 ID** | `FN-WRK-001` |
| **설명** | 작업 보고서의 생성부터 완료까지 단계별 상태 관리 |
| **상태 흐름** | DRAFT → REVIEW → APPROVED → SCHEDULED → IN_PROGRESS → COMPLETED → ARCHIVED |
| **처리 로직** | 각 단계 전환 시 상태 변경 권한 확인 + 승인자 기록 + 이메일 알림 |
| **연관 API** | `POST /api/wrk/reports/<id>/submit`, `approve-init`, `approve-final`, `submit-result`, `recall`, `reject`, `cancel` |
| **연관 테이블** | `wrk_report`, `wrk_report_approval`, `wrk_report_file`, `wrk_report_comment` |

### 6.6 변경 이벤트 추적

| 항목 | 내용 |
|------|------|
| **기능명** | 자산 변경 이벤트 자동 추적 |
| **기능 ID** | `FN-CHG-001` |
| **설명** | 자산 데이터 수정 시 변경 전/후 값을 자동으로 기록 |
| **처리 로직** | 1. 수정 API 호출 시 기존값 조회 → 2. 필드별 diff 비교 → 3. `change_event` (이벤트 헤더) 생성 → 4. `change_diff` (필드별 전/후값) 생성 |
| **연관 테이블** | `change_event`, `change_diff` |
| **연관 API** | `GET /api/change-events`, `GET /api/change-events/<id>` |

### 6.7 서비스 티켓 관리

| 항목 | 내용 |
|------|------|
| **기능명** | 서비스 티켓 등록 및 처리 |
| **기능 ID** | `FN-SVC-001` |
| **설명** | 서비스 요청·장애·문제 티켓의 접수부터 해결까지 관리 |
| **입력값** | 제목, 유형, 카테고리, 우선순위, 상세 내용, 대상, 마감일 |
| **상태 흐름** | PENDING → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED |
| **연관 API** | `GET/POST/PUT /api/tickets`, `/api/tickets/<id>/files` |

### 6.8 백업 정책 관리

| 항목 | 내용 |
|------|------|
| **기능명** | 백업 대상/정책 관리 |
| **기능 ID** | `FN-BK-001` |
| **설명** | 백업 정책(대상, 주기, 보관기간, 미디어)을 정의하고 관리 |
| **입력값** | 업무명, 시스템명, IP, 정책명, 디렉터리, 데이터유형, 백업등급, 보관기간, 스토리지풀, 오프사이트여부, 일정 |
| **처리 로직** | 스토리지 풀 할당 → 일정 설정 → 정책 활성화 |
| **연관 테이블** | `bk_backup_target_policy`, `bk_storage_pool`, `bk_library`, `bk_location`, `bk_tape` |
| **연관 API** | `/api/governance/backup/target-policies`, `/storage-pools`, `/libraries`, `/locations`, `/tapes` |

### 6.9 취약점 분석

| 항목 | 내용 |
|------|------|
| **기능명** | 취약점 점검 및 대응 관리 |
| **기능 ID** | `FN-VUL-001` |
| **설명** | 서버별 보안 취약점 점검 항목, 심각도, 조치계획, 조치결과 관리 |
| **점검 정보** | 점검 카테고리, 점검 코드, 점검 항목, 점검 기준, 점검 결과 |
| **조치 정보** | 조치 방법, 조치 상태, 조치 기한, 담당자 |
| **대응 등급** | 상(High) / 중(Medium) / 하(Low), 결과: 양호 / 취약 |
| **연관 테이블** | `hw_server_vulnerability`, `governance_vulnerability_guide` |
| **연관 API** | `/api/hardware/<id>/vulnerability`, `/api/governance/vulnerability-guides` |

### 6.10 채팅 기능

| 항목 | 내용 |
|------|------|
| **기능명** | 실시간 채팅 |
| **기능 ID** | `FN-MSG-001` |
| **설명** | 1:1 및 그룹 채팅, 파일 첨부, 읽음 확인 |
| **기능 상세** | 채팅방(DIRECT/GROUP) 생성, 메시지 송수신, 답장, 편집, 삭제, 파일 첨부, 즐겨찾기, 음소거, 안읽은 메시지 수 |
| **연관 테이블** | `msg_room`, `msg_room_member`, `msg_message`, `msg_file` |
| **연관 API** | `/api/chat/rooms`, `/api/chat/messages`, `/api/chat/whoami`, `/api/chat/unread-total` |

---

## 7. 사용자 및 권한 체계

### 7.1 사용자 유형 정의

| 사용자 유형 | 설명 | 시스템 역할 |
|-------------|------|------------|
| **시스템 관리자** | 전체 시스템 운영·관리 | ADMIN |
| **팀장** | 부서 내 승인·관리 권한 | TEAM_LEADER |
| **일반 사용자** | 업무 수행, 데이터 조회·등록 | USER |

### 7.2 역할(Role) 정의

**레거시 권한 체계** — `role` 테이블의 Boolean 컬럼 기반

| 역할 속성 | 타입 | 설명 |
|-----------|------|------|
| `dashboard_read` / `dashboard_write` | Boolean | 대시보드 읽기/쓰기 |
| `hardware_read` / `hardware_write` | Boolean | 시스템(하드웨어) 읽기/쓰기 |
| `software_read` / `software_write` | Boolean | 소프트웨어 읽기/쓰기 |
| `governance_read` / `governance_write` | Boolean | 거버넌스 읽기/쓰기 |
| `datacenter_read` / `datacenter_write` | Boolean | 데이터센터 읽기/쓰기 |
| `cost_read` / `cost_write` | Boolean | 비용관리 읽기/쓰기 |
| `project_read` / `project_write` | Boolean | 프로젝트 읽기/쓰기 |
| `category_read` / `category_write` | Boolean | 카테고리 읽기/쓰기 |
| `insight_read` / `insight_write` | Boolean | 인사이트 읽기/쓰기 |

**신규 권한 체계** — 메뉴 기반 3-Tier 권한 모델

| 우선순위 | 계층 | 테이블 | 설명 |
|---------|------|--------|------|
| 1(최고) | 사용자 직접 권한 | `user_menu_permission` | 특정 사용자에게 직접 부여 |
| 2 | 역할 권한 | `role_menu_permission` | 사용자가 속한 역할의 권한 |
| 3 | 부서 권한 | `department_menu_permission` | 사용자가 속한 부서의 권한 |

**권한 수준**: `NONE` (접근 불가) < `READ` (읽기 전용) < `WRITE` (읽기+쓰기)

**상속 규칙**: 자식 메뉴의 권한은 부모 메뉴의 권한을 초과할 수 없음

### 7.3 상세 페이지 탭 권한

`detail_page` + `role_detail_permission` / `department_detail_permission` / `user_detail_permission` 테이블을 통해 탭 단위 세밀한 권한 제어 가능.

### 7.4 권한 매트릭스

| 메뉴 | ADMIN | TEAM_LEADER | USER | 비고 |
|------|-------|-------------|------|------|
| 대시보드 | READ/WRITE | READ/WRITE | READ | 전체 사용자 접근 |
| 시스템 — 서버 | READ/WRITE | READ/WRITE | READ | 팀장 이상 수정 |
| 시스템 — 스토리지 | READ/WRITE | READ/WRITE | READ | |
| 시스템 — SAN | READ/WRITE | READ/WRITE | READ | |
| 시스템 — 네트워크 | READ/WRITE | READ/WRITE | READ | |
| 시스템 — 보안장비 | READ/WRITE | READ/WRITE | READ | |
| 거버넌스 — DR 훈련 | READ/WRITE | READ/WRITE | READ | |
| 거버넌스 — 백업 정책 | READ/WRITE | READ/WRITE | READ | |
| 거버넌스 — 취약점 | READ/WRITE | READ/WRITE | READ | |
| 거버넌스 — IP/DNS/VPN | READ/WRITE | READ/WRITE | READ | 네트워크 담당자 |
| 데이터센터 | READ/WRITE | READ/WRITE | READ | |
| 비용관리 — OPEX | READ/WRITE | READ | READ | 등록은 관리자 |
| 비용관리 — CAPEX | READ/WRITE | READ | READ | |
| 프로젝트 | READ/WRITE | READ/WRITE | READ/WRITE | 전체 참여 |
| 카테고리 | READ/WRITE | READ | READ | 기준정보 관리자만 수정 |
| 인사이트 — 블로그 | READ/WRITE | READ/WRITE | READ/WRITE | 전체 게시 가능 |
| 설정 — 관리자 | READ/WRITE | NONE | NONE | ADMIN 전용 |
| 설정 — 개인설정 | READ/WRITE | READ/WRITE | READ/WRITE | 본인 정보만 |

### 7.5 인증(Authentication) 흐름

```text
[사용자]
   │ ID/PW 입력
   ▼
[Login API] ─── IP 허용 확인 ──→ (차단 시 거부)
   │
   ├── 비밀번호 검증
   │   ├── 실패 → fail_cnt++ → 잠금 기준 초과 시 계정 잠금
   │   └── 성공 ↓
   │
   ├── MFA 활성화 여부 확인
   │   ├── 활성 → MFA 코드 발송 (TOTP/SMS/이메일/회사OTP)
   │   │          → 코드 입력 → 검증 성공 → 세션 생성
   │   └── 비활성 → 세션 즉시 생성
   │
   ├── 약관 동의 확인
   │   ├── 미동의 → /terms 페이지 리다이렉트
   │   └── 동의 완료 → 메인 페이지 이동
   │
   └── 세션 정보 저장
       ├── session['user_id']
       ├── session['emp_no']
       ├── session['role']
       └── session['_perms'] (권한 캐시)
```

### 7.6 세션 관리

| 정책 | 기본값 | 설명 |
|------|--------|------|
| **세션 유효시간** | 12시간 | `PERMANENT_SESSION_LIFETIME` |
| **최대 동시 세션** | 1 | `max_sessions` (보안정책) |
| **동시접속 정책** | kill_oldest | 기존 세션 종료 후 신규 허용 |
| **유휴 세션 검사** | 5분 간격 | `@auth_bp.before_app_request` |
| **HttpOnly** | True | XSS 방지 |
| **SameSite** | Lax (개발) / Strict (운영) | CSRF 방지 |
| **Secure** | 운영 환경만 True | HTTPS 강제 |

### 7.7 보안 정책 (관리자 설정 가능)

| 정책 | 설명 | 기본값 |
|------|------|--------|
| 최소 비밀번호 길이 | `min_length` | 8 |
| 최대 비밀번호 길이 | `max_length` | 20 |
| 비밀번호 만료(일) | `expiry_days` | 90 |
| 로그인 실패 잠금 임계값 | `fail_lock_threshold` | 5 |
| 비밀번호 이력 보관 수 | `history` | 5 |
| 금지 비밀번호 목록 | `banned_words` | 별도 테이블 관리 |

---

## 8. 데이터 흐름

### 8.1 자산 등록 → 변경 → 폐기 흐름

```text
[사용자 입력]
     │
     ▼
[1. 자산 등록]
     │ POST /api/hardware/assets
     │ → hardware 테이블 INSERT
     │ → change_event (CREATE) 생성
     ▼
[2. 자산 정보 변경]
     │ PUT /api/hardware/assets/<id>
     │ → 기존값 조회
     │ → 변경 필드 diff 비교
     │ → hardware 테이블 UPDATE
     │ → change_event (UPDATE) + change_diff 생성
     ▼
[3. 탭 정보 추가]
     │ POST /api/hardware/server-software/<id>
     │ POST /api/hardware/<id>/backup-policy
     │ POST /api/hardware/<id>/vulnerability
     │ → 각 탭별 하위 테이블에 데이터 저장
     ▼
[4. 불용자산 전환]
     │ 상태 변경: 운영 → 불용
     │ → change_event (STATUS_CHANGE) 기록
     ▼
[5. 소프트 삭제]
     │ POST /api/hardware/assets/bulk-delete
     │ → is_deleted = 1
     │ → change_event (DELETE) 기록
```

### 8.2 작업 보고서 워크플로우

```text
[1. 초안 작성]              [1:. DRAFT]
     │ POST /api/wrk/reports
     ▼
[2. 검토 제출]              [2:. REVIEW]
     │ POST .../submit
     │ → 검토자에게 알림 발송
     ▼
[3. 초기 승인]              [3:. APPROVED (초기)]
     │ POST .../approve-init
     │ → 승인 이력(wrk_report_approval) 기록
     ▼
[4. 최종 승인]              [4:. APPROVED (최종)]
     │ POST .../approve-final
     │ → 작업 일정 배정 가능
     ▼
[5. 일정 배정]              [5:. SCHEDULED]
     │ → 작업 일시 확정
     ▼
[6. 작업 진행]              [6:. IN_PROGRESS]
     │ → 실제시작시간 기록
     ▼
[7. 결과 보고]              [7:. COMPLETED]
     │ POST .../submit-result
     │ → 실제종료시간, 소요시간, 작업결과 기록
     ▼
[8. 아카이브]               [8:. ARCHIVED]
     │ → 장기 보관 처리

※ 회수(recall): REVIEW → DRAFT
※ 반려(reject): REVIEW → DRAFT
※ 취소(cancel): 임의 단계 → CANCELLED
```

### 8.3 권한 검증 흐름

```text
[사용자 요청]
     │
     ▼
[세션 확인] ─── 세션 없음 → 401 Unauthorized
     │
     ▼
[사용자 정보 조회]
     │ session['user_id'] → UserProfile
     │
     ▼
[권한 계산]
     │ get_effective_permissions(user_id)
     │  1. user_menu_permission 조회 (최우선)
     │  2. role_menu_permission 조회
     │  3. department_menu_permission 조회
     │  4. 상위 메뉴 권한 상속 제한 적용
     │
     ▼
[권한 확인]
     ├── WRITE 필요 API → permission ≥ WRITE
     ├── READ 필요 API  → permission ≥ READ
     └── 권한 부족 → 403 Forbidden
```

### 8.4 채팅 메시지 흐름

```text
[송신자]
     │ POST /api/chat/messages (room_id, content_text)
     ▼
[메시지 저장] → msg_message INSERT
     │
     ├─ 채팅방 last_message 갱신
     ├─ 수신자 unread_count 증가
     │
     ▼
[SSE 이벤트 브로드캐스트] ────→ [수신자 브라우저 실시간 반영]
```

---

## 9. API 명세

### 9.1 공통 응답 형식

```json
{
  "success": true,
  "items": [],
  "item": {},
  "total": 0,
  "message": "",
  "deleted": 0,
  "updated": 0
}
```

**공통 응답 빌더 함수**

| 함수 | HTTP 상태 | 용도 |
|------|-----------|------|
| `api_response(success=True, **kwargs)` | 200 | 정상 응답 |
| `api_error(message)` | 500 | 서버 오류 |
| `api_not_found(message)` | 404 | 리소스 없음 |
| `api_bad_request(message)` | 400 | 요청 오류 |
| `api_unauthorized(message)` | 401 | 인증 실패 |

### 9.2 하드웨어 자산 API

#### `GET /api/hardware/assets` — 자산 목록 조회

| 항목 | 내용 |
|------|------|
| **Method** | GET |
| **URL** | `/api/hardware/assets` |
| **설명** | 하드웨어 자산 목록 조회 |
| **권한** | `hardware_read` |

**요청 파라미터**

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `q` | string | N | 검색어 (자산명, IP, 시스템명 등) |
| `asset_category` | string | N | SERVER, STORAGE, SAN, NETWORK, SECURITY |
| `asset_type` | string | N | ON_PREMISE, CLOUD, WORKSTATION 등 |
| `center_code` | string | N | 센터 코드 |
| `include_deleted` | boolean | N | 삭제 포함 여부 (기본: false) |

**응답 예시**

```json
{
  "success": true,
  "items": [
    {
      "id": 1,
      "asset_code": "SVR-001",
      "asset_name": "웹서버01",
      "asset_category": "SERVER",
      "asset_type": "ON_PREMISE",
      "system_name": "WEBSVR01",
      "system_ip": "10.1.1.100",
      "manufacturer_code": "HP",
      "center_code": "DC-MAIN",
      "rack_code": "RACK-A01",
      "system_dept_code": "D001",
      "system_owner_display": "홍길동",
      "cia_confidentiality": 3,
      "cia_integrity": 3,
      "cia_availability": 5,
      "system_grade": "1등급",
      "is_deleted": 0
    }
  ],
  "total": 150
}
```

#### `POST /api/hardware/assets` — 자산 등록

| 항목 | 내용 |
|------|------|
| **Method** | POST |
| **URL** | `/api/hardware/assets` |
| **Content-Type** | application/json |
| **권한** | `hardware_write` |

**요청 예시**

```json
{
  "asset_code": "SVR-002",
  "asset_name": "DB서버01",
  "asset_category": "SERVER",
  "asset_type": "ON_PREMISE",
  "system_name": "DBSVR01",
  "system_ip": "10.1.1.101",
  "manufacturer_code": "DELL",
  "center_code": "DC-MAIN",
  "rack_code": "RACK-B02",
  "system_dept_code": "D002",
  "system_owner_emp_no": "EMP001"
}
```

**응답 예시**

```json
{
  "success": true,
  "item": {
    "id": 2,
    "asset_code": "SVR-002",
    "asset_name": "DB서버01"
  }
}
```

#### `PUT /api/hardware/assets/<id>` — 자산 수정

```http
PUT /api/hardware/assets/2
Content-Type: application/json

{
  "asset_name": "DB서버01-운영",
  "system_ip": "10.1.1.102"
}
```

```json
{
  "success": true,
  "item": { "id": 2, "asset_name": "DB서버01-운영", "system_ip": "10.1.1.102" }
}
```

#### `POST /api/hardware/assets/bulk-delete` — 일괄 삭제

```http
POST /api/hardware/assets/bulk-delete
Content-Type: application/json

{ "ids": [1, 3, 5] }
```

```json
{ "success": true, "deleted": 3 }
```

### 9.3 거버넌스 API

| Method | URL | 설명 |
|--------|-----|------|
| GET | `/api/governance/dr-trainings` | DR 훈련 목록 |
| POST | `/api/governance/dr-trainings` | DR 훈련 등록 |
| PUT | `/api/governance/dr-trainings/<id>` | DR 훈련 수정 |
| POST | `/api/governance/dr-trainings/bulk-delete` | 일괄 삭제 |
| POST | `/api/governance/dr-trainings/bulk-update` | 일괄 수정 |
| POST | `/api/governance/dr-trainings/bulk-create` | 일괄 등록 |
| POST | `/api/governance/dr-trainings/bulk-duplicate` | 일괄 복제 |
| GET | `/api/governance/backup/target-policies` | 백업 정책 목록 |
| POST | `/api/governance/backup/target-policies` | 백업 정책 등록 |
| PUT | `/api/governance/backup/target-policies/<id>` | 백업 정책 수정 |
| GET | `/api/governance/backup/storage-pools` | 스토리지 풀 목록 |
| GET | `/api/governance/backup/libraries` | 백업 라이브러리 목록 |
| GET | `/api/governance/backup/locations` | 보관 위치 목록 |
| GET | `/api/governance/backup/tapes` | 백업 테이프 목록 |
| GET | `/api/governance/packages` | 패키지 목록 |
| GET | `/api/governance/package-dashboard` | 패키지 대시보드 |
| GET | `/api/governance/package-vulnerabilities` | CVE 취약점 목록 |
| POST | `/api/governance/package-vulnerabilities` | CVE 등록 |
| GET | `/api/governance/vulnerability-guides` | 취약점 가이드 목록 |
| POST | `/api/governance/vulnerability-guides` | 가이드 등록 |

### 9.4 프로젝트 API

| Method | URL | 설명 |
|--------|-----|------|
| GET | `/api/projects` | 프로젝트 목록 |
| POST | `/api/projects` | 프로젝트 생성 |
| GET | `/api/projects/<id>` | 프로젝트 상세 |
| PUT | `/api/projects/<id>` | 프로젝트 수정 |
| GET | `/api/projects/<id>/cost-details` | 비용 상세 목록 |
| POST | `/api/projects/<id>/cost-details` | 비용 상세 등록 |

### 9.5 작업 보고서 API

| Method | URL | 설명 |
|--------|-----|------|
| GET | `/api/wrk/reports` | 보고서 목록 |
| POST | `/api/wrk/reports` | 보고서 생성 |
| GET | `/api/wrk/reports/<id>` | 보고서 상세 |
| PUT | `/api/wrk/reports/<id>` | 보고서 수정 |
| DELETE | `/api/wrk/reports/<id>` | 보고서 삭제 |
| POST | `/api/wrk/reports/<id>/submit` | 검토 제출 |
| POST | `/api/wrk/reports/<id>/recall` | 회수 |
| POST | `/api/wrk/reports/<id>/reject` | 반려 |
| POST | `/api/wrk/reports/<id>/approve-init` | 초기 승인 |
| POST | `/api/wrk/reports/<id>/approve-final` | 최종 승인 |
| POST | `/api/wrk/reports/<id>/submit-result` | 결과 보고 |
| POST | `/api/wrk/reports/<id>/cancel` | 취소 |
| POST | `/api/wrk/reports/batch-clear` | 일괄 완료 |
| GET | `/api/wrk/reports/<id>/comments` | 댓글 목록 |
| POST | `/api/wrk/reports/<id>/comments` | 댓글 등록 |
| GET | `/api/wrk/reports/<id>/files` | 파일 목록 |
| POST | `/api/wrk/reports/<id>/files` | 파일 업로드 |
| GET | `/api/wrk/reports/by-system` | 시스템별 보고서 |
| GET | `/api/wrk/reports/stats-by-system` | 시스템별 통계 |

### 9.6 채팅 API

| Method | URL | 설명 |
|--------|-----|------|
| GET | `/api/chat/rooms` | 채팅방 목록 |
| POST | `/api/chat/rooms` | 채팅방 생성 |
| GET | `/api/chat/rooms/<id>` | 채팅방 상세 |
| PUT | `/api/chat/rooms/<id>` | 채팅방 수정 |
| DELETE | `/api/chat/rooms/<id>` | 채팅방 삭제 |
| DELETE | `/api/chat/rooms/<id>/leave` | 채팅방 퇴장 |
| POST | `/api/chat/rooms/<id>/mark-read` | 읽음 처리 |
| GET | `/api/chat/rooms/<id>/members` | 멤버 목록 |
| POST | `/api/chat/rooms/<id>/members` | 멤버 추가 |
| GET | `/api/chat/messages/<room_id>` | 메시지 조회 |
| POST | `/api/chat/messages` | 메시지 전송 |
| PATCH | `/api/chat/messages/<id>` | 메시지 수정 |
| DELETE | `/api/chat/messages/<id>` | 메시지 삭제 |
| GET | `/api/chat/whoami` | 현재 사용자 정보 |
| GET | `/api/chat/unread-total` | 전체 안읽은 수 |
| GET | `/api/chat/directory` | 사용자 디렉터리 |

### 9.7 서비스 티켓 API

| Method | URL | 설명 |
|--------|-----|------|
| GET | `/api/tickets` | 티켓 목록 |
| POST | `/api/tickets` | 티켓 생성 |
| GET | `/api/tickets/<id>` | 티켓 상세 |
| PUT | `/api/tickets/<id>` | 티켓 수정 |
| POST | `/api/tickets/bulk-delete` | 일괄 삭제 |
| GET | `/api/tickets/<id>/files` | 티켓 파일 |
| POST | `/api/tickets/<id>/files` | 파일 업로드 |

### 9.8 일정 관리 API

| Method | URL | 설명 |
|--------|-----|------|
| GET | `/api/calendar/schedules` | 일정 목록 |
| POST | `/api/calendar/schedules` | 일정 등록 |
| GET | `/api/calendar/schedules/<id>` | 일정 상세 |
| PUT | `/api/calendar/schedules/<id>` | 일정 수정 |
| DELETE | `/api/calendar/schedules/<id>` | 일정 삭제 |
| POST | `/api/calendar/schedules/<id>/attachments` | 첨부파일 |

### 9.9 인증/관리 API

| Method | URL | 설명 |
|--------|-----|------|
| POST | `/login` | 로그인 |
| GET | `/logout` | 로그아웃 |
| GET/POST | `/register` | 회원 가입 |
| GET/POST | `/settings/password` | 비밀번호 변경 |
| GET/POST | `/reset-password` | 비밀번호 초기화 |
| GET | `/api/mfa/status` | MFA 상태 확인 |
| POST | `/api/mfa/send-code` | MFA 코드 발송 |
| POST | `/api/mfa/verify` | MFA 코드 검증 |
| POST | `/admin/auth/create` | 사용자 생성 (관리자) |
| POST | `/admin/auth/update` | 사용자 수정 (관리자) |
| POST | `/admin/auth/delete` | 사용자 삭제 (관리자) |
| GET | `/admin/auth/groups/list` | 역할 목록 |
| POST | `/admin/auth/group/create` | 역할 생성 |
| POST | `/admin/auth/groups/permissions` | 권한 수정 |
| GET/PUT | `/admin/auth/security-policy` | 보안 정책 |
| GET | `/admin/auth/active-sessions` | 활성 세션 목록 |
| DELETE | `/admin/auth/active-sessions/<id>` | 세션 종료 |
| GET/PUT | `/admin/auth/mail/config` | 메일 설정 |
| GET/PUT | `/admin/auth/mfa/config` | MFA 설정 |

### 9.10 기타 공통 API

| Method | URL | 설명 |
|--------|-----|------|
| GET | `/api/companies` | 회사 목록 |
| GET | `/api/users` | 사용자 목록 |
| GET | `/api/user-profiles` | 사용자 프로필 목록 |
| GET | `/api/org-users/suggest` | 사용자 검색 자동완성 |
| GET | `/api/org-users/cascade` | 조직 계층 조회 |
| GET/POST | `/api/me/profile` | 내 프로필 조회/수정 |
| GET | `/api/login-history` | 로그인 이력 |
| GET | `/api/change-events` | 변경 이벤트 목록 |
| GET | `/api/notifications` | 알림 목록 |

### 9.11 오류 코드 정의

| HTTP 상태 | 코드 | 설명 |
|-----------|------|------|
| 200 | OK | 정상 처리 |
| 400 | Bad Request | 요청 파라미터 오류, 필수값 누락 |
| 401 | Unauthorized | 인증 실패, 세션 만료 |
| 403 | Forbidden | 권한 부족 |
| 404 | Not Found | 리소스 미존재 |
| 409 | Conflict | 데이터 충돌 (중복 코드 등) |
| 500 | Internal Server Error | 서버 내부 오류 |

---

## 10. 공통 규칙

### 10.1 공통 코드 관리

- 비즈니스 분류 코드: `biz_work_category`, `biz_work_division`, `biz_work_status`, `biz_work_operation`, `biz_work_group` 테이블로 관리
- 하드웨어 유형 코드: `hw_server_type`, `hw_storage_type`, `hw_san_type`, `hw_network_type`, `hw_security_type`
- 소프트웨어 유형 코드: `sw_os_type`, `sw_db_type`, `sw_middleware_type`, `sw_virtual_type`, `sw_security_type`, `sw_ha_type`
- 컴포넌트 유형 코드: `cmp_cpu_type`, `cmp_memory_type`, `cmp_disk_type`, `cmp_nic_type`, `cmp_hba_type`, `cmp_gpu_type`, `cmp_etc_type`
- 각 코드 테이블은 `XXXX_code` (유니크), `XXXX_name`, `is_deleted` 컬럼 보유
- 앱 시작 시 `init_*_table()` 함수로 테이블 자동 생성

### 10.2 페이징 규칙

| 파라미터 | 기본값 | 설명 |
|---------|--------|------|
| `page` | 1 | 현재 페이지 번호 (1-based) |
| `page_size` | 20 | 페이지당 표시 건수 |
| `total` | — | 전체 건수 (응답) |

프론트엔드: `blossom.js`의 `goToPage()`, `changePageSize()` 함수로 제어

### 10.3 검색 조건 규칙

- `q` 파라미터: 통합 검색 키워드 (LIKE 검색)
- 개별 필터: `asset_category`, `center_code`, `year` 등 도메인 특화
- `include_deleted`: 삭제 데이터 포함 여부 (기본: false)

### 10.4 정렬 규칙

- `sort_by`: 정렬 기준 컬럼
- `sort_dir`: `asc` / `desc` (기본: `desc`)
- 기본 정렬: `created_at DESC` (최신순)
- 프론트엔드: `sortTable()` 함수로 컬럼 헤더 클릭 정렬

### 10.5 날짜/시간 포맷

| 구분 | 포맷 | 예시 |
|------|------|------|
| 날짜 저장 | ISO 8601 | `2026-03-28T09:30:00` |
| 날짜 표시 | `YYYY-MM-DD` | `2026-03-28` |
| 날짜시간 표시 | `YYYY-MM-DD HH:mm` | `2026-03-28 09:30` |
| DB 저장 (SQLite) | TEXT (ISO) | `2026-03-28T09:30:00` |
| DB 저장 (MySQL) | DATETIME | `2026-03-28 09:30:00` |

### 10.6 삭제 여부 플래그

- 모든 데이터는 **소프트 삭제** 방식 적용
- `is_deleted` 컬럼: `0` = 활성, `1` = 삭제
- 기본 검색 쿼리: `WHERE is_deleted = 0`
- 관리자는 `include_deleted=true`로 삭제 데이터 포함 조회 가능

### 10.7 이력 관리 정책

| 이력 유형 | 테이블 | 기록 대상 |
|----------|--------|-----------|
| 변경 이력 | `change_event` + `change_diff` | 자산 데이터 변경 전/후 |
| 로그인 이력 | `auth_login_history` | 로그인 시도 (성공/실패) |
| 비밀번호 이력 | `auth_password_history` | 비밀번호 변경 기록 |
| 권한 감사 이력 | `permission_audit_log` | 권한 변경 전/후 |
| 보안정책 이력 | `security_policy_log` | 보안 정책 변경 |
| 작업 이력 | `ui_task_history` | 자산별 작업 기록 |
| 작업 보고 이력 | `wrk_report_approval` | 보고서 승인 단계별 기록 |

---

## 11. DB 설계 개요

### 11.1 DB 설계 원칙

| 원칙 | 설명 |
|------|------|
| **이중 DB 전략** | 메인 DB(SQLAlchemy ORM) + 보조 DB(instance/ 하위 SQLite, Raw SQL) |
| **소프트 삭제** | `is_deleted` 플래그로 논리 삭제, 물리 삭제 없음 |
| **감사 추적** | 모든 테이블에 `created_at`, `created_by`, `updated_at`, `updated_by` 포함 |
| **코드 테이블 분리** | 유형/분류 데이터는 별도 코드 테이블로 관리 |
| **JSON 유연성** | 프로젝트 탭 등 가변 스키마는 `payload_json` 컬럼 활용 |

### 11.2 테이블 네이밍 규칙

| 규칙 | 예시 | 설명 |
|------|------|------|
| 도메인 접두사 | `prj_`, `wrk_`, `msg_`, `net_`, `bk_`, `hw_`, `sw_`, `cal_`, `svc_`, `dc_` | 모듈 식별 |
| snake_case | `hw_server_backup_policy` | 소문자 + 언더스코어 |
| 복수형 회피 | `org_user` (O), `org_users` (X) | 단수형 우선 (일부 레거시 예외) |
| 연결 테이블 | `role_user` | {테이블1}_{테이블2} |
| 이력 테이블 | `auth_login_history`, `auth_password_history` | {도메인}_{대상}_history |
| 권한 테이블 | `role_menu_permission`, `user_detail_permission` | {주체}_{대상}_permission |

### 11.3 PK/FK 규칙

| 항목 | 규칙 |
|------|------|
| **PK** | `id` INTEGER 자동 증가 (SQLAlchemy `autoincrement=True`) |
| **FK** | `{관계테이블}_id` 명명 (예: `project_id`, `room_id`, `user_id`) |
| **비즈니스 키** | `{접두사}_code` UNIQUE TEXT (예: `asset_code`, `emp_no`, `dept_code`) |
| **자기참조** | `parent_menu_id`, `parent_dept_code` 등 |

### 11.4 인덱스 기준

- PK 자동 인덱스
- UNIQUE 제약 자동 인덱스 (`asset_code`, `emp_no`, `dept_code` 등)
- 검색 빈도 높은 FK 컬럼 수동 인덱스 (`center_code`, `rack_code`)
- 복합 인덱스: `(asset_category, is_deleted)` 등 자주 조합되는 조건

### 11.5 운영 DB 설정 (MySQL)

```python
# ProductionConfig
SQLALCHEMY_DATABASE_URI = "mysql+pymysql://{user}:{pw}@{host}:{port}/{db}?charset=utf8mb4"
SQLALCHEMY_ENGINE_OPTIONS = {
    'pool_size': 10,
    'pool_recycle': 3600,
    'pool_pre_ping': True
}
```

---

## 12. DB 테이블 목록

### 12.1 인증/사용자/권한 (18개)

| 테이블명 | 논리명 | 설명 | 주요 용도 |
|---------|--------|------|-----------|
| `auth_users` | 인증 사용자 | 로그인 계정 정보 | 사번/비밀번호/역할/상태 |
| `auth_login_history` | 로그인 이력 | 로그인 시도 기록 | 보안 감사 |
| `auth_password_history` | 비밀번호 이력 | 비밀번호 변경 기록 | 재사용 방지 |
| `auth_roles` | 인증 역할 | 역할 정의 (JSON 권한) | ADMIN/USER 등 |
| `org_user` | 사용자 프로필 | 상세 사용자 정보 | 사번/이름/부서/연락처/프로필 |
| `org_department` | 부서 | 조직 부서 정보 | 부서코드/부서명/상위부서 |
| `role` | 역할 (레거시) | 섹션별 읽기/쓰기 권한 | Boolean 기반 권한 |
| `role_user` | 역할-사용자 매핑 | 사용자의 역할 할당 | M:N 연결 |
| `menu` | 메뉴 | 메뉴 트리 구조 | 메뉴코드/메뉴명/정렬 |
| `role_menu_permission` | 역할-메뉴 권한 | 역할별 메뉴 접근 권한 | NONE/READ/WRITE |
| `department_menu_permission` | 부서-메뉴 권한 | 부서별 메뉴 접근 권한 | NONE/READ/WRITE |
| `user_menu_permission` | 사용자-메뉴 권한 | 사용자 직접 권한 | NONE/READ/WRITE |
| `permission_audit_log` | 권한 감사 로그 | 권한 변경 이력 | 변경 전/후 기록 |
| `detail_page` | 상세 페이지 | 탭 페이지 정의 | 페이지코드/정렬 |
| `role_detail_permission` | 역할-상세 권한 | 역할별 탭 권한 | 탭 단위 세분화 |
| `department_detail_permission` | 부서-상세 권한 | 부서별 탭 권한 | 탭 단위 세분화 |
| `user_detail_permission` | 사용자-상세 권한 | 사용자별 탭 권한 | 탭 단위 세분화 |
| `active_sessions` | 활성 세션 | 현재 로그인 세션 관리 | 세션ID/IP/브라우저/최종접속 |

### 12.2 보안 정책 (5개)

| 테이블명 | 논리명 | 설명 |
|---------|--------|------|
| `security_policy` | 보안 정책 | 비밀번호/세션 정책 설정값 |
| `security_policy_log` | 보안 정책 이력 | 보안 정책 변경 이력 |
| `banned_passwords` | 금지 비밀번호 | 사용 금지 비밀번호 목록 |
| `mfa_config` | MFA 설정 | MFA 활성화/인증방식 설정 |
| `mfa_pending_codes` | MFA 코드 | 발송된 인증 코드 임시 저장 |

### 12.3 하드웨어 자산 (별도 SQLite DB: instance/hardware_asset.db)

| 테이블명 | 논리명 | 설명 |
|---------|--------|------|
| `hardware` | 하드웨어 자산 | 전체 IT 하드웨어 자산 기본정보 |

### 12.4 하드웨어 자산 부속 (메인 DB)

| 테이블명 | 논리명 | 설명 |
|---------|--------|------|
| `hw_server_backup_policy` | 서버 백업 정책 | 자산별 백업 정책 (tab03) |
| `hw_server_vulnerability` | 서버 취약점 | 자산별 취약점 점검 (tab12) |
| `hw_storage_basic` | 스토리지 기본정보 | 스토리지/백업 기본 사양 (tab31) |
| `hw_interface` | 인터페이스 | NIC/포트 정보 (tab04) |
| `hw_maintenance_contract` | 유지보수 계약 | 서버별 유지보수 계약 |
| `hw_activate` | 활성화 정보 | 서버 활성화/부팅 (tab07) |
| `hw_firewalld` | 방화벽 규칙 | 서버별 방화벽 규칙 (tab08) |
| `hw_frame_frontbay` | 프레임 전면 베이 | 블레이드 서버 전면 베이 |
| `hw_frame_rearbay` | 프레임 후면 베이 | 블레이드 서버 후면 베이 |

### 12.5 소프트웨어 자산 (별도 SQLite DB: instance/software_asset.db)

| 테이블명 | 논리명 | 설명 |
|---------|--------|------|
| `software_asset` | 소프트웨어 자산 | 전체 소프트웨어 자산 기본정보 |

### 12.6 프로젝트 관리 (14개)

| 테이블명 | 논리명 | 설명 |
|---------|--------|------|
| `prj_project` | 프로젝트 | 프로젝트 기본 정보 |
| `prj_project_member` | 프로젝트 멤버 | 프로젝트 구성원 |
| `prj_tab_integrity` | 통합 관리 탭 | PMBOK 통합 (payload_json) |
| `prj_tab_scope` | 범위 관리 탭 | PMBOK 범위 |
| `prj_tab_schedule` | 일정 관리 탭 | PMBOK 일정 |
| `prj_tab_cost` | 비용 관리 탭 | PMBOK 비용 |
| `prj_cost_detail` | 비용 상세 | 프로젝트 비용 상세 항목 |
| `prj_tab_quality` | 품질 관리 탭 | PMBOK 품질 |
| `prj_tab_resource` | 자원 관리 탭 | PMBOK 자원 |
| `prj_tab_communication` | 의사소통 관리 탭 | PMBOK 의사소통 |
| `prj_tab_risk` | 위험 관리 탭 | PMBOK 위험 |
| `prj_tab_procurement` | 조달 관리 탭 | PMBOK 조달 |
| `prj_tab_stakeholder` | 이해관계자 관리 탭 | PMBOK 이해관계자 |

### 12.7 작업 보고서 (11개)

| 테이블명 | 논리명 | 설명 |
|---------|--------|------|
| `wrk_report` | 작업 보고서 | 작업 보고서 헤더 |
| `wrk_report_classification` | 보고서 분류 | 작업 분류 태그 |
| `wrk_report_worktype` | 보고서 작업유형 | 작업 유형 태그 |
| `wrk_report_participant_user` | 참여자 (사용자) | 보고서 참여 사용자 |
| `wrk_report_participant_dept` | 참여자 (부서) | 보고서 참여 부서 |
| `wrk_report_vendor` | 참여 협력사 | 보고서 참여 벤더 |
| `wrk_report_vendor_staff` | 협력사 담당자 | 벤더 내 참여자 |
| `wrk_report_approval` | 승인 이력 | 단계별 승인 기록 |
| `wrk_report_file` | 보고서 파일 | 첨부파일 |
| `wrk_report_comment` | 보고서 댓글 | 댓글/피드백 |
| `wrk_report_user_clear` | 보고서 완료 확인 | 사용자별 완료 확인 |

### 12.8 채팅/메시징 (4개)

| 테이블명 | 논리명 | 설명 |
|---------|--------|------|
| `msg_room` | 채팅방 | 1:1/그룹 채팅방 |
| `msg_room_member` | 채팅 멤버 | 채팅방 참여자 |
| `msg_message` | 메시지 | 채팅 메시지 본문 |
| `msg_file` | 메시지 파일 | 채팅 첨부 파일 |

### 12.9 일정 관리 (4개)

| 테이블명 | 논리명 | 설명 |
|---------|--------|------|
| `cal_schedule` | 일정 | 일정 이벤트 |
| `cal_schedule_attachment` | 일정 첨부파일 | 일정 첨부 |
| `cal_schedule_share_user` | 일정 공유 (사용자) | 사용자별 일정 공유 |
| `cal_schedule_share_dept` | 일정 공유 (부서) | 부서별 일정 공유 |

### 12.10 서비스 티켓 (2개)

| 테이블명 | 논리명 | 설명 |
|---------|--------|------|
| `svc_ticket` | 서비스 티켓 | 요청/장애/문제 티켓 |
| `svc_ticket_file` | 티켓 파일 | 티켓 첨부파일 |

### 12.11 네트워크 VPN (6개)

| 테이블명 | 논리명 | 설명 |
|---------|--------|------|
| `net_vpn_partner` | VPN 파트너 | VPN 연동 기관 |
| `net_vpn_line` | VPN 회선 | VPN 회선 정보 |
| `net_vpn_line_manager` | VPN 담당자 | 회선별 담당자 |
| `net_vpn_line_device` | VPN 장비 | 회선별 장비 |
| `net_vpn_line_communication` | VPN 통신현황 | 회선별 통신 매핑 |
| `net_vpn_line_policy` | VPN 정책 | 회선별 IPSec 정책 |

### 12.12 네트워크 전용회선 (4개)

| 테이블명 | 논리명 | 설명 |
|---------|--------|------|
| `net_leased_line` | 전용회선 | 전용회선 기본 정보 |
| `net_leased_line_manager` | 전용회선 담당자 | 회선별 담당자 |
| `net_leased_line_task` | 전용회선 작업 | 회선별 작업 이력 |
| `net_leased_line_attachment` | 전용회선 첨부 | 회선별 첨부파일 |

### 12.13 백업/거버넌스 (6개)

| 테이블명 | 논리명 | 설명 |
|---------|--------|------|
| `bk_library` | 백업 라이브러리 | 백업 디바이스(라이브러리) |
| `bk_location` | 보관 위치 | 미디어 보관 물리 위치 |
| `bk_tape` | 백업 테이프 | 백업 미디어 관리 |
| `bk_storage_pool` | 스토리지 풀 | 백업 스토리지 풀 |
| `bk_backup_target_policy` | 백업 대상 정책 | 백업 정책 정의 |
| `dr_training` | DR 훈련 | 재해복구 훈련 기록 |

### 12.14 데이터센터 (4개)

| 테이블명 | 논리명 | 설명 |
|---------|--------|------|
| `dc_access_system` | 출입 시스템 | 데이터센터 출입 시스템 |
| `access_zone` | 출입 지역 | 출입 가능 지역(Zone) 정의 |
| `access_permission` | 출입 권한 | 사용자별 출입 권한 매핑 |
| `access_permission_zone` | 출입 권한-지역 | 권한별 지역 허용 여부 |

### 12.15 블로그/인사이트 (4개)

| 테이블명 | 논리명 | 설명 |
|---------|--------|------|
| `blog` | 블로그 | 블로그 게시글 |
| `blog_comment` | 블로그 댓글 | 계층형 댓글 |
| `blog_like` | 블로그 좋아요 | 게시글 좋아요 |
| `blog_comment_like` | 댓글 좋아요 | 댓글 좋아요 |

### 12.16 공통/시스템 테이블

| 테이블명 | 논리명 | 설명 |
|---------|--------|------|
| `rack_layouts` | 랙 레이아웃 | 랙 배치도 (JSON) |
| `ui_task_history` | 작업 이력 | 범용 작업 이력 |
| `change_event` | 변경 이벤트 | 변경 추적 이벤트 헤더 |
| `change_diff` | 변경 상세 | 필드별 변경 전/후 |
| `sys_notification` | 시스템 알림 | 알림 메시지 |
| `sys_info_message` | 정보 메시지 | 시스템 공지 |
| `page_tab_config` | 페이지 탭 설정 | 동적 탭 구성 |
| `upload_meta` | 업로드 메타 | 업로드 파일 메타 정보 |
| `smtp_config` | SMTP 설정 | 메일 서버 설정 |
| `sms_config` | SMS 설정 | SMS 발송 설정 |
| `company_otp_config` | 회사 OTP 설정 | 회사 OTP 연동 설정 |

### 12.17 보조 SQLite 테이블 (instance/ 하위, 60+개)

서비스 `init_*_table()` 함수가 앱 시작 시 자동 생성하는 보조 테이블:

| 그룹 | 테이블 예시 | DB 파일 |
|------|------------|---------|
| 비즈니스 분류 | `biz_work_category`, `biz_work_division`, `biz_work_status`, `biz_work_operation`, `biz_work_group` | 각각 개별 .db |
| 조직 | `org_center`, `org_rack`, `org_thermometer`, `org_cctv` | 개별 .db |
| 시스템 Lab | `system_lab[1-4]_surface`, `system_lab[1-4]_thermometer`, `system_lab[1-4]_cctv` | 개별 .db |
| HW 유형 | `hw_server_type`, `hw_storage_type`, `hw_san_type`, `hw_network_type`, `hw_security_type` | 개별 .db |
| SW 유형 | `sw_os_type`, `sw_db_type`, `sw_middleware_type`, `sw_virtual_type`, `sw_security_type`, `sw_ha_type` | 개별 .db |
| 컴포넌트 유형 | `cmp_cpu_type`, `cmp_memory_type`, `cmp_disk_type`, `cmp_nic_type`, `cmp_hba_type`, `cmp_gpu_type`, `cmp_etc_type` | 개별 .db |
| 벤더 | `biz_vendor_manufacturer`, `biz_vendor_manufacturer_manager`, `biz_vendor_maintenance`, 등 | 개별 .db |
| 비용 | `opex_contract`, `capex_contract`, `cost_contract_tab61`, `cost_capex_contract_tab62` | 개별 .db |
| 고객 | `customer_member`, `customer_associate`, `customer_client` | 개별 .db |
| 네트워크 | `network_ip_policy`, `network_dns_policy`, `network_ip_diagram`, `network_ad`, 등 | 개별 .db |

---

## 13. 테이블 상세 정의

### 13.1 org_user (사용자 프로필)

| 항목 | 내용 |
|------|------|
| **테이블명** | `org_user` |
| **논리명** | 사용자 프로필 |
| **설명** | 시스템 사용자의 상세 프로필 정보 |
| **PK** | `id` |
| **유니크** | `emp_no` |
| **FK** | `department_id` → `org_department.id` |
| **관계** | Role (M:N via `role_user`), 권한 (1:N `user_menu_permission`, `user_detail_permission`) |

| 컬럼명 | 타입 | NULL | PK | FK | 기본값 | 설명 |
|--------|------|------|----|----|--------|------|
| `id` | Integer | N | Y | | auto | 자동증가 PK |
| `emp_no` | String(50) | N | | | | 사번 (유니크) |
| `name` | String(100) | Y | | | | 성명 |
| `nickname` | String(100) | Y | | | | 닉네임 |
| `company` | String(200) | Y | | | | 소속 회사명 |
| `department` | String(200) | Y | | | | 소속 부서명 (텍스트) |
| `department_id` | Integer | Y | | FK | | org_department FK |
| `employment_status` | String(50) | Y | | | | 재직상태 (재직/퇴직/휴직) |
| `email` | String(200) | Y | | | | 이메일 |
| `role` | String(50) | Y | | | 'USER' | 역할 (ADMIN/TEAM_LEADER/USER) |
| `allowed_ip` | String(500) | Y | | | | 허용 IP (CIDR, 쉼표 구분) |
| `profile_image` | String(500) | Y | | | | 프로필 이미지 경로 |
| `locked` | Boolean | Y | | | False | 계정 잠금 여부 |
| `fail_cnt` | Integer | Y | | | 0 | 로그인 실패 횟수 |
| `note` | Text | Y | | | | 관리자 메모 |
| `motto` | String(500) | Y | | | | 좌우명 |
| `is_deleted` | Integer | Y | | | 0 | 삭제 여부 |
| `created_at` | DateTime | Y | | | utcnow | 생성일시 |
| `updated_at` | DateTime | Y | | | utcnow | 수정일시 |

### 13.2 auth_users (인증 사용자)

| 항목 | 내용 |
|------|------|
| **테이블명** | `auth_users` |
| **논리명** | 인증 사용자 |
| **설명** | 로그인 인증 전용 계정 테이블 |
| **PK** | `id` |
| **유니크** | `emp_no` |

| 컬럼명 | 타입 | NULL | PK | 기본값 | 설명 |
|--------|------|------|----|--------|------|
| `id` | Integer | N | Y | auto | |
| `emp_no` | String(50) | N | | | 사번 (유니크) |
| `password_hash` | String(256) | N | | | 해시된 비밀번호 |
| `email` | String(200) | Y | | | 이메일 |
| `role` | String(50) | Y | | 'USER' | 역할 |
| `status` | String(50) | Y | | 'ACTIVE' | 상태 (ACTIVE/LOCKED/DISABLED) |
| `locked_until` | DateTime | Y | | | 잠금 해제 일시 |
| `last_terms_accepted_at` | DateTime | Y | | | 최근 약관 동의 일시 |
| `created_at` | DateTime | Y | | utcnow | |
| `updated_at` | DateTime | Y | | utcnow | |

### 13.3 hardware (하드웨어 자산)

| 항목 | 내용 |
|------|------|
| **테이블명** | `hardware` |
| **논리명** | 하드웨어 자산 |
| **설명** | 전체 IT 하드웨어 자산 기본 정보 (보조 SQLite) |
| **PK** | `id` |
| **유니크** | `asset_code` |
| **인덱스** | `idx_hardware_code`, `idx_hardware_center`, `idx_hardware_rack` |

| 컬럼명 | 타입 | NULL | PK | FK참조 | 기본값 | 설명 |
|--------|------|------|----|--------|--------|------|
| `id` | INTEGER | N | Y | | auto | |
| `asset_category` | TEXT | Y | | | | SERVER/STORAGE/SAN/NETWORK/SECURITY |
| `asset_type` | TEXT | Y | | | | ON_PREMISE/CLOUD/WORKSTATION 등 |
| `asset_code` | TEXT | N | | | | 자산코드 (유니크) |
| `asset_name` | TEXT | Y | | | | 자산명 |
| `work_category_code` | TEXT | Y | | biz_work_category | | 업무 카테고리 코드 |
| `work_division_code` | TEXT | Y | | biz_work_division | | 업무 구분 코드 |
| `work_status_code` | TEXT | Y | | biz_work_status | | 업무 상태 코드 |
| `work_operation_code` | TEXT | Y | | biz_work_operation | | 운영 코드 |
| `work_group_code` | TEXT | Y | | biz_work_group | | 업무 그룹 코드 |
| `work_name` | TEXT | Y | | | | 업무명 |
| `system_name` | TEXT | Y | | | | 시스템명 |
| `system_ip` | TEXT | Y | | | | 시스템 IP |
| `mgmt_ip` | TEXT | Y | | | | 관리 IP |
| `manufacturer_code` | TEXT | Y | | biz_vendor_manufacturer | | 제조사 코드 |
| `server_code` | TEXT | Y | | hw_server_type | | 서버모델 코드 |
| `center_code` | TEXT | Y | | org_center | | 센터 코드 |
| `rack_code` | TEXT | Y | | org_rack | | 랙 코드 |
| `system_slot` | INTEGER | Y | | | | 랙 슬롯 번호 |
| `system_size` | INTEGER | Y | | | | 랙 U 사이즈 |
| `system_dept_code` | TEXT | Y | | org_department | | 시스템 보유 부서 |
| `system_owner_emp_no` | TEXT | Y | | org_user | | 시스템 담당자 사번 |
| `system_owner_display` | TEXT | Y | | | | 시스템 담당자명 |
| `service_dept_code` | TEXT | Y | | org_department | | 서비스 부서 |
| `service_owner_emp_no` | TEXT | Y | | org_user | | 서비스 담당자 사번 |
| `service_owner_display` | TEXT | Y | | | | 서비스 담당자명 |
| `virtualization_type` | TEXT | Y | | | | 가상화 유형 |
| `cia_confidentiality` | INTEGER | Y | | | | CIA 기밀성 (0~5) |
| `cia_integrity` | INTEGER | Y | | | | CIA 무결성 (0~5) |
| `cia_availability` | INTEGER | Y | | | | CIA 가용성 (0~5) |
| `security_score` | INTEGER | Y | | | | 보안 점수 |
| `system_grade` | TEXT | Y | | | | 등급 (1등급/2등급/3등급) |
| `is_core_system` | INTEGER | Y | | | | 핵심 시스템 여부 (0/1) |
| `has_dr_site` | INTEGER | Y | | | | DR 사이트 여부 (0/1) |
| `has_service_ha` | INTEGER | Y | | | | HA 구성 여부 (0/1) |
| `service_ha_type` | TEXT | Y | | | | HA 유형 (Active-Active 등) |
| `created_at` | TEXT | Y | | | | 생성일시 |
| `created_by` | TEXT | Y | | | | 생성자 |
| `updated_at` | TEXT | Y | | | | 수정일시 |
| `updated_by` | TEXT | Y | | | | 수정자 |
| `is_deleted` | INTEGER | Y | | | 0 | 삭제 여부 |

### 13.4 role (역할)

| 컬럼명 | 타입 | NULL | PK | 기본값 | 설명 |
|--------|------|------|----|--------|------|
| `id` | Integer | N | Y | auto | |
| `name` | String(128) | N | | | 역할명 (유니크) |
| `description` | String(512) | Y | | | 역할 설명 |
| `dashboard_read` | Boolean | Y | | False | 대시보드 읽기 |
| `dashboard_write` | Boolean | Y | | False | 대시보드 쓰기 |
| `hardware_read` | Boolean | Y | | False | 시스템 읽기 |
| `hardware_write` | Boolean | Y | | False | 시스템 쓰기 |
| `software_read` | Boolean | Y | | False | 소프트웨어 읽기 |
| `software_write` | Boolean | Y | | False | 소프트웨어 쓰기 |
| `governance_read` | Boolean | Y | | False | 거버넌스 읽기 |
| `governance_write` | Boolean | Y | | False | 거버넌스 쓰기 |
| `datacenter_read` | Boolean | Y | | False | 데이터센터 읽기 |
| `datacenter_write` | Boolean | Y | | False | 데이터센터 쓰기 |
| `cost_read` | Boolean | Y | | False | 비용관리 읽기 |
| `cost_write` | Boolean | Y | | False | 비용관리 쓰기 |
| `project_read` | Boolean | Y | | False | 프로젝트 읽기 |
| `project_write` | Boolean | Y | | False | 프로젝트 쓰기 |
| `category_read` | Boolean | Y | | False | 카테고리 읽기 |
| `category_write` | Boolean | Y | | False | 카테고리 쓰기 |
| `insight_read` | Boolean | Y | | False | 인사이트 읽기 |
| `insight_write` | Boolean | Y | | False | 인사이트 쓰기 |
| `created_at` | DateTime | Y | | utcnow | |
| `updated_at` | DateTime | Y | | utcnow | |

### 13.5 menu (메뉴)

| 컬럼명 | 타입 | NULL | PK | FK | 기본값 | 설명 |
|--------|------|------|----|----| --------|------|
| `id` | Integer | N | Y | | auto | |
| `menu_code` | String(100) | N | | | | 메뉴 코드 (유니크) |
| `menu_name` | String(200) | N | | | | 메뉴명 |
| `parent_menu_id` | Integer | Y | | menu.id | | 상위 메뉴 ID |
| `sort_order` | Integer | Y | | 0 | 정렬 순서 |
| `created_at` | DateTime | Y | | utcnow | |
| `updated_at` | DateTime | Y | | utcnow | |

### 13.6 prj_project (프로젝트)

| 컬럼명 | 타입 | NULL | PK | FK | 기본값 | 설명 |
|--------|------|------|----|----| --------|------|
| `id` | Integer | N | Y | | auto | |
| `project_number` | String(100) | N | | | | 프로젝트 번호 (유니크) |
| `project_name` | String(500) | N | | | | 프로젝트명 |
| `project_type` | String(100) | Y | | | | 프로젝트 유형 |
| `owner_dept_id` | Integer | Y | | org_department.id | | 주관 부서 |
| `manager_user_id` | Integer | Y | | org_user.id | | PM |
| `priority` | String(50) | Y | | | | 우선순위 |
| `status` | String(50) | Y | | | | 상태 |
| `gorf_goal` | Text | Y | | | | 목표 |
| `gorf_organization` | Text | Y | | | | 조직 |
| `gorf_research` | Text | Y | | | | 조사 |
| `gorf_finance` | Text | Y | | | | 재무 |
| `budget_amount` | Float | Y | | | | 예산 |
| `start_date` | String(50) | Y | | | | 시작일 |
| `expected_end_date` | String(50) | Y | | | | 종료 예정일 |
| `task_count_cached` | Integer | Y | | 0 | | 작업 수 캐시 |
| `progress_percent` | Float | Y | | 0 | | 진행률 (%) |
| `cleared` | Boolean | Y | | False | | 완료 여부 |
| `created_by_user_id` | Integer | Y | | org_user.id | | 생성자 |
| `is_deleted` | Integer | Y | | 0 | | 삭제 여부 |
| `created_at` | DateTime | Y | | utcnow | | |
| `updated_at` | DateTime | Y | | utcnow | | |

### 13.7 wrk_report (작업 보고서)

| 컬럼명 | 타입 | NULL | PK | FK | 기본값 | 설명 |
|--------|------|------|----|----| --------|------|
| `id` | Integer | N | Y | | auto | |
| `project_id` | Integer | Y | | prj_project.id | | 프로젝트 FK |
| `doc_no` | String(100) | Y | | | | 문서번호 |
| `draft_date` | String(50) | Y | | | | 기안일 |
| `task_title` | String(500) | Y | | | | 작업 제목 |
| `status` | String(50) | Y | | 'DRAFT' | | 상태 |
| `result_type` | String(100) | Y | | | | 작업 결과 유형 |
| `actual_start_time` | String(50) | Y | | | | 실제 시작 시각 |
| `actual_end_time` | String(50) | Y | | | | 실제 종료 시각 |
| `actual_duration` | String(100) | Y | | | | 실제 소요 시간 |
| `impact` | Text | Y | | | | 영향도 |
| `created_by_user_id` | Integer | Y | | org_user.id | | 생성자 |
| `is_deleted` | Integer | Y | | 0 | | |
| `created_at` | DateTime | Y | | utcnow | | |
| `updated_at` | DateTime | Y | | utcnow | | |

### 13.8 msg_room (채팅방)

| 컬럼명 | 타입 | NULL | PK | FK | 기본값 | 설명 |
|--------|------|------|----|----| --------|------|
| `id` | Integer | N | Y | | auto | |
| `room_type` | String(20) | N | | | | DIRECT / GROUP |
| `room_name` | String(200) | Y | | | | 채팅방명 |
| `direct_key` | String(200) | Y | | | | 1:1 대화 고유키 (유니크) |
| `last_message_preview` | String(500) | Y | | | | 최근 메시지 미리보기 |
| `last_message_at` | DateTime | Y | | | | 최근 메시지 시각 |
| `created_by_user_id` | Integer | Y | | org_user.id | | 생성자 |
| `is_deleted` | Integer | Y | | 0 | | |
| `created_at` | DateTime | Y | | utcnow | | |

### 13.9 change_event (변경 이벤트)

| 컬럼명 | 타입 | NULL | PK | 기본값 | 설명 |
|--------|------|------|----|--------|------|
| `id` | Integer | N | Y | auto | |
| `scope_type` | String | Y | | | 대상 유형 (hardware/software 등) |
| `scope_id` | String | Y | | | 대상 ID |
| `event_type` | String | Y | | | CREATE/UPDATE/DELETE |
| `summary` | Text | Y | | | 변경 요약 |
| `created_by` | String | Y | | | 변경 수행자 |
| `created_at` | DateTime | Y | | utcnow | |

### 13.10 bk_backup_target_policy (백업 대상 정책)

| 컬럼명 | 타입 | NULL | PK | FK | 기본값 | 설명 |
|--------|------|------|----|----| --------|------|
| `id` | Integer | N | Y | | auto | |
| `backup_scope` | String | Y | | | | 백업 범위 |
| `business_name` | String | Y | | | | 업무명 |
| `system_name` | String | Y | | | | 시스템명 |
| `ip_address` | String | Y | | | | 대상 IP |
| `backup_policy_name` | String | Y | | | | 정책명 |
| `backup_directory` | String | Y | | | | 백업 디렉터리 |
| `data_type` | String | Y | | | | 데이터 유형 |
| `backup_grade` | String | Y | | | | 백업 등급 |
| `retention_value` | Integer | Y | | | | 보관 기간 값 |
| `retention_unit` | String | Y | | | | 보관 기간 단위 (일/주/월/년) |
| `storage_pool_id` | Integer | Y | | bk_storage_pool.id | | 스토리지 풀 |
| `offsite_yn` | String(1) | Y | | | | 오프사이트 여부 |
| `media_type` | String | Y | | | | 미디어 유형 |
| `schedule_period` | String | Y | | | | 주기 (일/주/월) |
| `schedule_weekday` | String | Y | | | | 요일 |
| `schedule_day` | String | Y | | | | 일자 |
| `schedule_name` | String | Y | | | | 스케줄명 |
| `start_time` | String | Y | | | | 시작 시각 |
| `created_by` | Integer | Y | | org_user.id | | 생성자 |
| `is_deleted` | Integer | Y | | 0 | | |
| `created_at` | DateTime | Y | | utcnow | | |
| `updated_at` | DateTime | Y | | utcnow | | |

### 13.11 svc_ticket (서비스 티켓)

| 컬럼명 | 타입 | NULL | PK | FK | 기본값 | 설명 |
|--------|------|------|----|----| --------|------|
| `id` | Integer | N | Y | | auto | |
| `title` | String(500) | N | | | | 티켓 제목 |
| `ticket_type` | String(50) | Y | | | | 유형 (요청/장애/문제) |
| `category` | String(100) | Y | | | | 카테고리 |
| `priority` | String(50) | Y | | | | 우선순위 |
| `status` | String(50) | Y | | 'PENDING' | | 상태 |
| `requester_user_id` | Integer | Y | | org_user.id | | 요청자 |
| `assignee_user_id` | Integer | Y | | org_user.id | | 담당자 |
| `target_object` | String(200) | Y | | | | 대상 객체 |
| `due_at` | DateTime | Y | | | | 마감일 |
| `detail` | Text | Y | | | | 상세 내용 |
| `resolved_at` | DateTime | Y | | | | 해결일 |
| `closed_at` | DateTime | Y | | | | 종료일 |
| `resolution_summary` | Text | Y | | | | 해결 요약 |
| `created_by_user_id` | Integer | Y | | org_user.id | | 생성자 |
| `is_deleted` | Integer | Y | | 0 | | |
| `created_at` | DateTime | Y | | utcnow | | |
| `updated_at` | DateTime | Y | | utcnow | | |

---

## 14. 테이블 관계도 설명

### 14.1 사용자/권한 관계

```text
org_user(1) ────── (N) role_user (N) ────── (1) role
     │
     ├── (N) user_menu_permission (N) ────── (1) menu
     ├── (N) user_detail_permission (N) ──── (1) detail_page
     │
     └── org_department(1)
              ├── (N) department_menu_permission (N) ── (1) menu
              └── (N) department_detail_permission (N) ── (1) detail_page

role(1) ────── (N) role_menu_permission (N) ────── (1) menu
     └── (N) role_detail_permission (N) ────── (1) detail_page

menu(1) ─── (N) menu [자기참조: parent_menu_id]
detail_page(1) ─── (N) detail_page [자기참조: parent_page_id]
```

### 14.2 하드웨어 자산 관계

```text
hardware(1) ─── (N) hw_server_backup_policy [asset_id]
     ├── (N) hw_server_vulnerability [asset_id]
     ├── (N) hw_storage_basic [asset_id]
     ├── (N) hw_interface [asset_id]
     ├── (N) hw_maintenance_contract [asset_id]
     ├── (N) hw_activate [asset_id]
     ├── (N) hw_firewalld [asset_id]
     ├── (N) ui_task_history [scope_id]
     ├── (N) change_event [scope_id]
     └── (N) tab15_file [scope_id]

hardware(N) ─── (1) biz_work_category [work_category_code]
     ├── (1) biz_vendor_manufacturer [manufacturer_code]
     ├── (1) hw_server_type [server_code]
     ├── (1) org_center [center_code]
     ├── (1) org_rack [rack_code]
     ├── (1) org_department [system_dept_code]
     └── (1) org_user [system_owner_emp_no]
```

### 14.3 프로젝트 관계

```text
prj_project(1) ─── (N) prj_project_member
     ├── (N) prj_tab_integrity
     ├── (N) prj_tab_scope
     ├── (N) prj_tab_schedule
     ├── (N) prj_tab_cost
     ├── (N) prj_cost_detail
     ├── (N) prj_tab_quality
     ├── (N) prj_tab_resource
     ├── (N) prj_tab_communication
     ├── (N) prj_tab_risk
     ├── (N) prj_tab_procurement
     ├── (N) prj_tab_stakeholder
     └── (N) wrk_report [project_id]

prj_project(N) ─── (1) org_department [owner_dept_id]
     └── (1) org_user [manager_user_id]
```

### 14.4 작업 보고서 관계

```text
wrk_report(1) ─── (N) wrk_report_classification
     ├── (N) wrk_report_worktype
     ├── (N) wrk_report_participant_user ─── (1) org_user
     ├── (N) wrk_report_participant_dept ─── (1) org_department
     ├── (N) wrk_report_vendor
     │        └── (N) wrk_report_vendor_staff
     ├── (N) wrk_report_approval ─── (1) org_user [approver]
     ├── (N) wrk_report_file
     ├── (N) wrk_report_comment
     └── (N) wrk_report_user_clear
```

### 14.5 채팅 관계

```text
msg_room(1) ─── (N) msg_room_member ─── (1) org_user
     └── (N) msg_message ─── (1) org_user [sender]
              └── (1) msg_file

msg_message(1) ─── (1) msg_message [reply_to_message_id, 자기참조]
```

### 14.6 VPN 관계

```text
net_vpn_partner(1) ─── (N) net_vpn_line
     net_vpn_line(1) ─── (N) net_vpn_line_manager
          ├── (N) net_vpn_line_device
          ├── (N) net_vpn_line_communication
          └── (1) net_vpn_line_policy [1:1]
```

### 14.7 백업 관계

```text
bk_storage_pool(1) ─── (N) bk_backup_target_policy
bk_library(1) ─── (N) bk_tape
bk_location(1) ─── (N) bk_tape
```

### 14.8 일정 관계

```text
cal_schedule(1) ─── (N) cal_schedule_attachment
     ├── (N) cal_schedule_share_user ─── (1) org_user
     └── (N) cal_schedule_share_dept ─── (1) org_department
```

### 14.9 데이터센터 출입 관계

```text
access_permission(1) ─── (N) access_permission_zone ─── (1) access_zone
access_permission(N) ─── (1) org_user [user_id]
     └── (1) org_department [department_id]
```

---

## 15. 공통 컬럼 표준

### 15.1 감사 추적 컬럼

모든 주요 테이블에 다음 컬럼을 표준으로 포함한다:

| 컬럼명 | 타입 | 기본값 | 자동갱신 | 설명 |
|--------|------|--------|---------|------|
| `created_at` | DateTime | `datetime.utcnow` | N | 레코드 생성 일시 (UTC) |
| `created_by` | String / Integer | — | N | 생성자 (emp_no 또는 user_id) |
| `updated_at` | DateTime | `datetime.utcnow` | Y (`onupdate`) | 최종 수정 일시 (UTC) |
| `updated_by` | String / Integer | — | N | 수정자 (emp_no 또는 user_id) |
| `is_deleted` | Integer | `0` | N | 소프트 삭제 (0=활성, 1=삭제) |

### 15.2 SQLAlchemy 표준 구현

```python
class ExampleModel(db.Model):
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    # ... 도메인 컬럼 ...
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.String(100))
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = db.Column(db.String(100))
    is_deleted = db.Column(db.Integer, default=0)
```

### 15.3 보조 컬럼

| 컬럼명 | 타입 | 기본값 | 사용 대상 | 설명 |
|--------|------|--------|----------|------|
| `sort_order` | Integer | 0 | 메뉴, 탭, 정렬 필요 테이블 | 표시 순서 |
| `remark` / `note` | Text | — | 대부분 테이블 | 비고/메모 |
| `status` | String | 테이블마다 다름 | 상태 관리 테이블 | 처리 상태값 |
| `payload_json` | Text (JSON) | — | 프로젝트 탭 | 가변 스키마 데이터 |

---

## 16. 운영 및 관리 관점

### 16.1 로그 관리

| 로그 유형 | 저장 위치 | 보관 정책 | 설명 |
|----------|----------|----------|------|
| 로그인 이력 | `auth_login_history` | 영구 보관 | 성공/실패, IP, 브라우저 |
| 비밀번호 변경 이력 | `auth_password_history` | 영구 보관 | 최근 N개 재사용 방지 |
| 권한 변경 감사 | `permission_audit_log` | 영구 보관 | 변경 전/후 값 |
| 보안 정책 변경 | `security_policy_log` | 영구 보관 | 정책 설정 변경 |
| 자산 변경 이력 | `change_event` + `change_diff` | 영구 보관 | 필드별 변경 추적 |
| 애플리케이션 로그 | 콘솔/파일 | 설정에 따름 | Flask 로깅 (`LOG_LEVEL`) |

### 16.2 첨부파일 관리

| 항목 | 설정 |
|------|------|
| **저장 위치** | `uploads/` 디렉터리 (로컬 파일시스템) |
| **최대 파일 크기** | 16MB (`MAX_CONTENT_LENGTH`) |
| **파일명** | UUID 기반 저장명 + 원본명 보관 (`stored_name`, `original_name`) |
| **메타 정보** | `content_type`, `size_bytes`, `uploaded_by_user_id` |
| **적용 영역** | 작업 보고서, 전용회선, 일정, 서비스 티켓, 채팅, 자산 파일탭 |

### 16.3 배치 처리

| 배치 | 실행 주기 | 설명 |
|------|----------|------|
| 세션 정리 | 5분 | `before_app_request`에서 유휴 세션 정리 |
| SSE 이벤트 브로드캐스트 | 실시간 | 변경 사항 클라이언트 동기화 |

### 16.4 백업 고려사항

| 대상 | 방식 | 주기 | 비고 |
|------|------|------|------|
| 메인 DB (MySQL) | mysqldump + 증분 백업 | 일 1회 전체, 시간별 증분 | 운영 환경 필수 |
| 보조 DB (SQLite) | 파일 복사 | 일 1회 | instance/ 디렉터리 전체 |
| 업로드 파일 | 파일시스템 백업 | 일 1회 | uploads/ 디렉터리 |
| 설정 파일 | Git 관리 | 변경 시 | config.py, requirements.txt |

### 16.5 보안 고려사항

| 항목 | 현재 적용 | 설명 |
|------|----------|------|
| **비밀번호 해싱** | bcrypt/werkzeug | `password_hash` 필드에 해시 저장 |
| **세션 보안** | HttpOnly, SameSite, Secure(운영) | 쿠키 하이재킹 방지 |
| **MFA** | TOTP, SMS, 이메일, 회사 OTP | 다중 인증 수단 지원 |
| **IP 제한** | `allowed_ip` CIDR 기반 | 사용자별 접근 IP 제한 |
| **계정 잠금** | 5회 실패 자동 잠금 | brute-force 방지 |
| **비밀번호 정책** | 최소/최대 길이, 만료, 이력 | 관리자 설정 가능 |
| **권한 분리** | 3-Tier 메뉴+탭 권한 | 최소 권한 원칙 적용 |
| **CSRF 방지** | SameSite Cookie | 운영: Strict 모드 |
| **XSS 방지** | Jinja2 자동 이스케이프 + HttpOnly | 템플릿 자동 이스케이프 |
| **파일 업로드 제한** | 16MB, content_type 검증 | 대용량 업로드 차단 |
| **SQL Injection** | SQLAlchemy ORM / Parameterized Query | ORM 또는 파라미터 바인딩 |

### 16.6 감사 추적 항목

| 감사 대상 | 추적 내용 | 테이블 |
|----------|----------|--------|
| 로그인 | 시도 일시, IP, 성공/실패, 브라우저 | `auth_login_history` |
| 비밀번호 변경 | 변경자, 변경 일시 | `auth_password_history` |
| 권한 변경 | 대상(역할/부서/사용자), 메뉴, 변경 전/후 | `permission_audit_log` |
| 자산 변경 | 대상 자산, 이벤트 유형, 필드별 diff | `change_event`, `change_diff` |
| 보안 정책 | 정책 변경 내역 | `security_policy_log` |
| 세션 관리 | 세션 생성/종료, 관리자 강제 종료 | `active_sessions` |

---

## 17. 향후 확장 고려사항

### 17.1 기능 확장 가능성

| 영역 | 확장 방향 | 비고 |
|------|----------|------|
| **CMDB 통합** | 자산 간 의존성/관계 맵핑 | CI(Configuration Item) 관계 그래프 |
| **자동화** | 자산 자동 검색(Discovery), 에이전트 기반 수집 | SNMP/WMI/SSH 연동 |
| **모니터링** | 실시간 성능 모니터링, 알람 | Prometheus/Grafana 연동 |
| **SLA 관리** | 서비스 수준 협약 이행률 추적 | 가용률, 응답률, 장애복구 시간 |
| **대시보드 고도화** | BI 기반 분석, 트렌드 예측 | 자산 수명주기 예측 |
| **모바일 지원** | 반응형 UI 또는 모바일 앱 | PWA 방식 적용 가능 |

### 17.2 권한 세분화

- **데이터 수준 권한** (Row-Level Security): 부서별 자산만 조회 가능
- **필드 수준 권한**: 비밀번호/인증 정보 필드 마스킹
- **시간 기반 권한**: 특정 기간에만 유효한 임시 접근 권한
- **승인 워크플로우 권한**: 다단계 승인 체인 확장

### 17.3 외부 시스템 연계

| 연계 대상 | 프로토콜 | 용도 |
|----------|---------|------|
| Active Directory / LDAP | LDAP | 사용자 인증 SSO |
| ERP 시스템 | REST API | 자산 구매/비용 정보 동기화 |
| SIEM | Syslog / REST | 보안 이벤트 수집 |
| 모니터링 도구 (Zabbix, Nagios) | API | 자산 상태 자동 반영 |
| 메일 서버 | SMTP (현재 구현) | 알림 발송 |
| SMS 게이트웨이 | CoolSMS API (현재 구현) | MFA 코드 발송 |
| SSO 제공자 | SAML 2.0 / OAuth 2.0 | 통합 인증 |

### 17.4 이력 및 통계 확장

- 자산 수명주기 통계 (도입→운영→불용 기간 분석)
- 부서별/센터별 자산 보유 현황 추이
- 비용 추이 분석 (월별/분기별/연도별)
- 취약점 조치율 추이 분석
- 프로젝트 이행률 및 예산 소진율 분석

### 17.5 멀티테넌시/조직 확장

- **현재**: 단일 조직 (Single-Tenant) 구조
- **확장 방향**: `tenant_id` 컬럼 추가로 멀티테넌시 지원
- **조직 계층**: 현재 `org_department` (부서) 2단계 → 회사/사업부/부서/팀 N단계로 확장 가능
- **데이터 격리**: 테넌트별 DB 분리 또는 Row-Level 격리

---

## 부록 A. 환경별 설정 비교

| 설정 | 개발 (Development) | 운영 (Production) | 테스트 (Testing) |
|------|-------------------|-------------------|-----------------|
| DEBUG | True | False | True |
| DB | SQLite | MySQL 8.0 (pymysql) | In-Memory SQLite |
| DB Pool | — | pool_size=10, recycle=3600s | — |
| Session Cookie | HttpOnly, SameSite=Lax | HttpOnly, SameSite=Strict, Secure | — |
| SECRET_KEY | 'dev-secret-key-...' | 환경변수 필수 | 'test-key' |
| 파일 캐시 | 0초 (캐시 없음) | 기본값 (브라우저 캐시 활용) | — |
| 템플릿 리로드 | True | False | True |
| Max Upload | 16MB | 16MB | 16MB |

## 부록 B. 서비스 계층 목록 (89개 파일)

| 도메인 | 서비스 파일 |
|--------|------------|
| **하드웨어** | `hardware_asset_service`, `hardware_authority_service`, `hw_server_type_service`, `hw_storage_type_service`, `hw_storage_basic_service`, `hw_san_type_service`, `hw_network_type_service`, `hw_security_type_service` |
| **소프트웨어** | `software_asset_service`, `server_software_service`, `sw_os_type_service`, `sw_db_type_service`, `sw_middleware_type_service`, `sw_virtual_type_service`, `sw_security_type_service`, `sw_high_availability_type_service`, `sw_system_allocation_service` |
| **컴포넌트** | `cmp_cpu_type_service`, `cmp_gpu_type_service`, `cmp_disk_type_service`, `cmp_nic_type_service`, `cmp_hba_type_service`, `cmp_memory_type_service`, `cmp_etc_type_service` |
| **인터페이스/계약** | `hw_interface_service`, `hw_maintenance_contract_service`, `hw_activate_service`, `hw_firewalld_service`, `hw_frame_frontbay_service`, `hw_frame_rearbay_service` |
| **조직** | `org_department_service`, `org_center_service`, `org_rack_service`, `org_rack_face_service`, `org_thermometer_service`, `org_cctv_service` |
| **비즈니스** | `biz_work_category_service`, `biz_work_division_service`, `biz_work_status_service`, `biz_work_operation_service`, `biz_work_group_service`, `biz_work_group_file_service`, `biz_work_asset_counts_service` |
| **벤더** | `biz_vendor_manufacturer_service`, `biz_vendor_manufacturer_manager_service`, `biz_vendor_manufacturer_software_service`, `biz_vendor_maintenance_service`, `biz_vendor_maintenance_software_service`, `biz_vendor_maintenance_sla_service`, `biz_vendor_maintenance_issue_service`, `vendor_component_service`, `vendor_hardware_service` |
| **고객** | `customer_member_service`, `customer_associate_service`, `customer_client_service` |
| **네트워크** | `net_vpn_partner_service`, `net_vpn_line_service`, `net_leased_line_service`, `net_leased_line_log_service`, `network_ip_policy_service`, `network_ip_diagram_service`, `network_ip_address_suggest_service`, `network_dns_policy_service`, `network_dns_record_service`, `network_dns_diagram_service`, `network_dns_policy_log_service`, `network_ad_service`, `network_ad_diagram_service`, `network_ad_account_service`, `network_ad_fqdn_service` |
| **거버넌스** | `asset_account_service`, `asset_package_service`, `package_vulnerability_service`, `vulnerability_guide_service`, `governance_package_service` |
| **비용** | `opex_contract_service`, `capex_contract_service`, `cost_contract_tab61_service`, `cost_capex_contract_tab62_service`, `cost_opex_hardware_config_service` |
| **프로젝트/작업** | `project_service`, `project_membership_service`, `wf_design_service` |
| **시스템/공통** | `change_event_service`, `notification_service`, `permission_service`, `dashboard_service`, `category_dashboard_service`, `audit_service`, `rate_limiter_service`, `custom_column_service`, `tab14_change_log_service`, `tab15_file_service`, `tab32_assign_group_service`, `upload_meta_service`, `dynamic_tab_record_service`, `page_tab_config_service`, `brand_setting_service`, `quality_type_service`, `info_message_service`, `insight_item_service`, `chat_service` |
| **데이터센터** | `access_entry_register_service`, `data_delete_register_service`, `data_delete_system_service`, `system_lab1~4_surface_service`, `system_lab_cctv_service`, `system_lab_thermometer_service`, `thermometer_log_json_store`, `rack_detail_sqlite` |

## 부록 C. 캐시 무효화 규칙

- CSS 버전: HTML `<link>` 태그에 `?v=X.XX` 쿼리스트링
- JS 버전: HTML `<script>` 태그에 `?v=날짜코드` 쿼리스트링
- 수정 시 해당 HTML 파일의 버전 번호를 증가시켜 브라우저 캐시 강제 갱신
- 빌드 도구 없음 — 수동 버전 관리

---

*본 문서의 내용은 소스코드 기반으로 작성되었으며, 실제 운영 환경과 차이가 있을 수 있습니다. 정기적으로 최신화하여 관리하시기 바랍니다.*
