# Blossom Lumina — 보안 중심 3티어 운영 아키텍처 설계서

> **플랫폼**: Blossom  
> **서비스**: Lumina  
> **기존 컴포넌트**: Lumina-agent (기구현, 호환 통합 대상)  
> **대상 OS**: Rocky Linux 8.10 / 9.x / 10.x  
> **작성일**: 2026-04-06  
> **문서 버전**: 1.0.0

---

## 목차

1. [전체 구조 요약](#1-전체-구조-요약)
2. [서버별 역할 정의](#2-서버별-역할-정의)
3. [Lumina-agent 반영 방식 요약](#3-lumina-agent-반영-방식-요약)
4. [WEB 아키텍처 최종안](#4-web-아키텍처-최종안)
5. [RPM 패키지 설계](#5-rpm-패키지-설계)
6. [디렉터리 구조 및 권한 설계](#6-디렉터리-구조-및-권한-설계)
7. [서비스 계정 및 권한 설계](#7-서비스-계정-및-권한-설계)
8. [DB 설정 자동화 설계](#8-db-설정-자동화-설계)
9. [WEB 설정 자동화 설계](#9-web-설정-자동화-설계)
10. [AP 통신 설정 자동화 설계](#10-ap-통신-설정-자동화-설계)
11. [AGENT 설정 자동화 설계](#11-agent-설정-자동화-설계)
12. [설정 파일 템플릿](#12-설정-파일-템플릿)
13. [systemd unit 파일](#13-systemd-unit-파일)
14. [RPM spec 파일](#14-rpm-spec-파일)
15. [MariaDB 초기화 SQL 및 보안 SQL](#15-mariadb-초기화-sql-및-보안-sql)
16. [NGINX / Gunicorn / Flask 운영 설정](#16-nginx--gunicorn--flask-운영-설정)
17. [방화벽 / 네트워크 정책](#17-방화벽--네트워크-정책)
18. [SELinux 고려사항](#18-selinux-고려사항)
19. [데이터 흐름별 보안 설계표](#19-데이터-흐름별-보안-설계표)
20. [로그 / 감사 / 백업 / 복구 정책](#20-로그--감사--백업--복구-정책)
21. [배포 및 업그레이드 절차](#21-배포-및-업그레이드-절차)
22. [운영 보안 점검 체크리스트](#22-운영-보안-점검-체크리스트)

---

## 1. 전체 구조 요약

```
┌──────────────────────────────────────────────────────────────────┐
│                        Blossom Platform                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐   TLS/mTLS    ┌─────────────┐   TLS    ┌────────────┐
│  │  AGENT 서버  │──────────────▶│  AP 서버     │────────▶│  DB 서버   │
│  │  (N대)       │   :5100       │  Collector   │  :3306  │  MariaDB   │
│  │  lumina-agent│               │  Parser      │         │            │
│  └─────────────┘               │  Worker      │         └────────────┘
│                                 └──────┬──────┘                │
│                                        │                        │
│                                        │ (내부망)                │
│                                        │                        │
│                     ┌──────────────────┘                        │
│                     │                                            │
│  ┌─────────────────▼──────────┐   TLS    ┌────────────┐        │
│  │  WEB 서버                   │────────▶│  DB 서버   │        │
│  │  NGINX → Gunicorn → Flask  │  :3306   │  (READ)    │        │
│  │  :443 (HTTPS only)         │          └────────────┘        │
│  └────────────────────────────┘                                 │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 포트 할당

| 구간 | 포트 | 프로토콜 | 비고 |
|------|------|----------|------|
| Agent → AP | 5100/tcp | TLS 1.3 (mTLS) | 에이전트 데이터 수신 |
| WEB 외부 | 443/tcp | HTTPS (TLS 1.2+) | 유일한 외부 포트 |
| Gunicorn 내부 | 127.0.0.1:8000 | HTTP (loopback) | NGINX↔Gunicorn |
| AP → DB | 3306/tcp | TLS 1.2+ | AP writer 전용 |
| WEB → DB | 3306/tcp | TLS 1.2+ | WEB reader 전용 |

### 핵심 원칙

- **전 구간 암호화**: 평문 통신 없음
- **최소 권한**: root 상시 실행 금지, 서비스별 전용 계정
- **개인정보 보호**: 수집 최소화, 마스킹, 컬럼 암호화
- **자동 보안 기본값**: RPM 설치 시 안전한 설정 자동 생성
- **기존 Agent 호환**: `lumina` RPM → `blossom-lumina-agent` 원활한 전환

---

## 2. 서버별 역할 정의

### 2-1. AGENT 서버 (수집 노드)

| 항목 | 내용 |
|------|------|
| 패키지 | `blossom-lumina-agent` |
| 서비스 계정 | `lumina` (기존 유지) |
| 설정 | `/etc/blossom/lumina/agent.conf` |
| 역할 | 인터페이스/계정/패키지 정보 수집 후 AP 전송 |
| 통신 | AP 서버 :5100 으로 TLS 전송 |
| 인증 | mTLS 클라이언트 인증서 또는 Bearer 토큰 |
| 재시도 | 전송 실패 시 로컬 큐 저장, 지수 백오프 재전송 |
| 대상 OS | Linux (RHEL/Rocky/Ubuntu/Debian/Oracle), Unix (HPUX/AIX), Windows |

### 2-2. AP 서버 (수집/처리)

| 항목 | 내용 |
|------|------|
| 패키지 | `blossom-lumina-ap` |
| 서비스 계정 | `lumina-ap` |
| 설정 | `/etc/blossom/lumina/ap.conf` |
| 역할 | 에이전트 데이터 수신 → 파싱 → DB 적재 |
| 수신 | :5100 TLS (mTLS) |
| 출력 | MariaDB :3306 TLS (lumina_ap_writer) |
| 구성 | Receiver → Queue → Parser → Worker → DB Forwarder |

### 2-3. DB 서버 (저장)

| 항목 | 내용 |
|------|------|
| 패키지 | `blossom-lumina-db-init` (초기화만) |
| 엔진 | MariaDB 10.11+ |
| 계정 | `lumina_ap_writer` (INSERT/UPDATE), `lumina_web_reader` (SELECT) |
| 보안 | TLS 강제, bind-address 제한, root 원격 금지 |
| 보호 | 민감 컬럼 AES_ENCRYPT, 감사 로그, retention 정책 |

### 2-4. WEB 서버 (대시보드)

| 항목 | 내용 |
|------|------|
| 패키지 | `blossom-lumina-web` |
| 서비스 계정 | `lumina-web` |
| 설정 | `/etc/blossom/lumina/web.conf` |
| 역할 | 대시보드 UI, 조회 API, 관리자 기능 |
| 외부 포트 | 443 (HTTPS only, HSTS) |
| 스택 | NGINX → Gunicorn → Flask |
| DB 접근 | READ-ONLY (`lumina_web_reader`) |

---

## 3. Lumina-agent 반영 방식 요약

### 기존 Agent 현황 분석

| 항목 | 기존 값 | 비고 |
|------|---------|------|
| RPM 패키지명 | `lumina` | Name: lumina |
| 서비스명 | `lumina.service` | systemd |
| 설정 경로 | `/etc/lumina/lumina.conf` | INI 포맷 |
| 설치 경로 | `/opt/lumina/` | 에이전트 코드 |
| 데이터 경로 | `/var/lib/lumina/` | JSON fallback |
| 로그 경로 | `/var/log/lumina/` | 파일 로그 |
| 서비스 계정 | `lumina` | nologin |
| 전송 엔드포인트 | `/api/agent/upload` | POST JSON |
| 전송 프로토콜 | HTTPS (verify_ssl=false) | **개선 필요** |

### 전환 전략

```
기존 lumina RPM v1.x
        │
        │  rpm -U blossom-lumina-agent-2.0.0
        │  (Provides: lumina, Obsoletes: lumina < 2.0.0)
        ▼
blossom-lumina-agent RPM v2.x
  ├── /etc/blossom/lumina/agent.conf   ← 신규 경로
  ├── /etc/lumina/lumina.conf          ← 심볼릭 링크 (하위호환)
  ├── /opt/blossom/lumina/agent/       ← 신규 설치 경로  
  ├── lumina-agent.service             ← 신규 서비스명
  └── lumina.service                   ← 심볼릭 링크 (하위호환)
```

### 핵심 호환 조치

1. **RPM 의존성**: `Provides: lumina = %{version}`, `Obsoletes: lumina < 2.0.0`
2. **설정 마이그레이션**: `%post`에서 `/etc/lumina/lumina.conf` 존재 시 자동 변환
3. **서비스명 호환**: `lumina.service` → `lumina-agent.service` 심볼릭 링크
4. **경로 호환**: `/opt/lumina/` → `/opt/blossom/lumina/agent/` 심볼릭 링크
5. **설정 보존**: `%config(noreplace)` 적용, 업그레이드 시 기존 설정 유지

### 보안 강화 항목

| 기존 | 신규 |
|------|------|
| `verify_ssl = false` | `verify_ssl = true` (기본값) |
| `User=root` (systemd) | `User=lumina` (전용 계정) |
| HTTP 허용 | TLS 1.2+ 강제 |
| 토큰 인증 없음 | mTLS 또는 Bearer 토큰 |
| 재시도 없음 | 지수 백오프 재시도 + 로컬 큐 |

---

## 4. WEB 아키텍처 최종안

```
인터넷/내부망
     │
     │  :443 HTTPS (TLS 1.3)
     ▼
┌─────────────────────────────────┐
│  NGINX  (reverse proxy)         │
│  - HSTS 강제                     │
│  - 보안 헤더 주입                 │
│  - rate limit                    │
│  - request size 제한              │
│  - server_tokens off             │
│  - static 파일 서빙               │
│  - 127.0.0.1:8000 proxy_pass    │
└────────────┬────────────────────┘
             │  HTTP (loopback only)
             ▼
┌─────────────────────────────────┐
│  Gunicorn  (WSGI app server)    │
│  - bind 127.0.0.1:8000          │
│  - workers: CPU*2+1              │
│  - user: lumina-web              │
│  - timeout: 30s                  │
│  - graceful-timeout: 10s         │
│  - max-requests: 1000            │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Flask  (application)            │
│  - DEBUG = False                 │
│  - SECRET_KEY: secure.env에서    │
│  - SESSION_COOKIE_SECURE = True  │
│  - SESSION_COOKIE_HTTPONLY = True │
│  - DB: lumina_web_reader (R/O)   │
└──────────────────────────────────┘
```

---

## 5. RPM 패키지 설계

### 5-1. 패키지 목록

| 패키지명 | 역할 | 의존 | 설치 대상 서버 |
|----------|------|------|---------------|
| `blossom-lumina-common` | 공통 라이브러리/유틸/설정 | (없음) | 전 서버 |
| `blossom-lumina-agent` | 에이전트 (기존 lumina RPM 대체) | common | 수집 대상 서버 |
| `blossom-lumina-ap` | AP 수집/처리 서버 | common, python3 | AP 서버 |
| `blossom-lumina-web` | WEB 대시보드 | common, nginx, python3 | WEB 서버 |
| `blossom-lumina-db-init` | DB 초기화 SQL/설정 | mariadb-server | DB 서버 |
| `blossom-lumina-logrotate` | 로그 순환 설정 | logrotate | AP/WEB/Agent |
| `blossom-lumina-cert-tools` | 인증서 생성/갱신 유틸 | openssl | 전 서버 |

### 5-2. 의존성 그래프

```
blossom-lumina-common (기반)
    ├── blossom-lumina-agent
    ├── blossom-lumina-ap
    ├── blossom-lumina-web
    └── blossom-lumina-db-init (독립)

blossom-lumina-logrotate (선택)
blossom-lumina-cert-tools (선택)
```

### 5-3. 버전 정책

- 형식: `MAJOR.MINOR.PATCH`
- common 버전이 올라가면 하위 패키지도 `Requires: blossom-lumina-common >= X.Y` 갱신
- Agent 패키지: `Epoch: 1` 사용하여 기존 `lumina` RPM 대비 항상 상위 버전 보장

---

## 6. 디렉터리 구조 및 권한 설계

### 6-1. 전체 디렉터리 맵

```
/etc/blossom/lumina/                  # 설정 파일 루트
├── common.conf                       # 공통 설정 (0640 root:lumina)
├── ap.conf                           # AP 설정 (0640 root:lumina-ap)
├── web.conf                          # WEB 설정 (0640 root:lumina-web)
├── db.conf                           # DB 접속 설정 (0640 root:lumina)
├── agent.conf                        # Agent 설정 (0640 root:lumina)
├── secure.env                        # 비밀값 (0600 root:root)
└── tls/                              # 인증서 디렉터리
    ├── ca.crt                        # CA 인증서 (0644)
    ├── server.crt                    # 서버 인증서 (0644)
    ├── server.key                    # 서버 개인키 (0600 root:root)
    ├── client.crt                    # 클라이언트 인증서 (0644)
    └── client.key                    # 클라이언트 개인키 (0600)

/opt/blossom/lumina/                  # 애플리케이션 루트
├── common/                           # 공통 라이브러리
│   ├── __init__.py
│   ├── config.py
│   ├── collector.py
│   ├── crypto.py                     # 암호화 유틸
│   └── masking.py                    # 마스킹 유틸
├── agent/                            # 에이전트
│   ├── agent.py
│   └── collectors/
├── ap/                               # AP 서버
│   ├── receiver.py                   # 데이터 수신
│   ├── queue.py                      # 내부 큐
│   ├── parser.py                     # 파서
│   ├── worker.py                     # 워커
│   ├── forwarder.py                  # DB 전달
│   └── wsgi.py                       # WSGI 엔트리
├── web/                              # WEB 서버
│   ├── app/                          # Flask 앱
│   └── wsgi.py                       # Gunicorn 엔트리
└── bin/                              # 관리 스크립트
    ├── lumina-healthcheck
    ├── lumina-rotate-token
    └── lumina-cert-renew

/var/lib/blossom/lumina/              # 런타임 데이터
├── agent/                            # Agent fallback JSON
│   └── queue/                        # 전송 실패 큐
├── ap/                               # AP 큐/버퍼
│   ├── queue/                        # 수신 대기열
│   ├── failed/                       # 실패 데이터
│   └── raw/                          # 원본 로그 보관
└── web/                              # WEB 세션/임시

/var/log/blossom/lumina/              # 로그
├── agent/                            # Agent 로그
├── ap/                               # AP 로그
│   ├── receiver.log
│   ├── parser.log
│   └── worker.log
├── web/                              # WEB 로그
│   ├── access.log
│   ├── error.log
│   └── gunicorn.log
└── audit/                            # 감사 로그

/run/blossom/lumina/                  # PID/소켓
├── ap.pid
├── gunicorn.pid
└── gunicorn.sock
```

### 6-2. 권한 매트릭스

| 경로 | 소유자 | 그룹 | 모드 | 비고 |
|------|--------|------|------|------|
| `/etc/blossom/lumina/` | root | root | 0755 | |
| `/etc/blossom/lumina/*.conf` | root | (서비스별) | 0640 | 서비스 계정만 읽기 |
| `/etc/blossom/lumina/secure.env` | root | root | 0600 | root만 읽기 가능 |
| `/etc/blossom/lumina/tls/` | root | root | 0755 | |
| `/etc/blossom/lumina/tls/*.key` | root | root | 0600 | 개인키 root 전용 |
| `/opt/blossom/lumina/` | root | root | 0755 | 실행 파일 |
| `/var/lib/blossom/lumina/agent/` | lumina | lumina | 0750 | |
| `/var/lib/blossom/lumina/ap/` | lumina-ap | lumina-ap | 0750 | |
| `/var/lib/blossom/lumina/ap/raw/` | lumina-ap | lumina-ap | 0700 | 원본 보호 |
| `/var/lib/blossom/lumina/web/` | lumina-web | lumina-web | 0750 | |
| `/var/log/blossom/lumina/` | root | root | 0755 | |
| `/var/log/blossom/lumina/agent/` | lumina | lumina | 0750 | |
| `/var/log/blossom/lumina/ap/` | lumina-ap | lumina-ap | 0750 | |
| `/var/log/blossom/lumina/web/` | lumina-web | lumina-web | 0750 | |
| `/var/log/blossom/lumina/audit/` | root | root | 0700 | 감사 로그 보호 |
| `/run/blossom/lumina/` | root | root | 0755 | tmpfiles.d 관리 |

---

## 7. 서비스 계정 및 권한 설계

### 7-1. 시스템 계정

| 계정 | UID 범위 | 홈 디렉터리 | 셸 | 용도 |
|------|----------|-------------|-----|------|
| `lumina` | system | `/opt/blossom/lumina/agent` | `/sbin/nologin` | Agent 실행 |
| `lumina-ap` | system | `/opt/blossom/lumina/ap` | `/sbin/nologin` | AP 서비스 실행 |
| `lumina-web` | system | `/opt/blossom/lumina/web` | `/sbin/nologin` | Gunicorn/Flask 실행 |

### 7-2. DB 계정

| 계정 | 권한 | 접근 원본 | 용도 |
|------|------|----------|------|
| `lumina_ap_writer` | INSERT, UPDATE, SELECT on `lumina.*` | AP 서버 IP | AP → DB 적재 |
| `lumina_web_reader` | SELECT on `lumina.*` | WEB 서버 IP | WEB 조회 전용 |
| `lumina_admin` | ALL on `lumina.*` | localhost | 관리/마이그레이션 |

### 7-3. 권한 원칙

- **root 직접 실행 금지**: 모든 서비스는 전용 계정으로 실행
- **sudo 최소화**: 설치/업그레이드 시에만 root 필요
- **파일 접근 분리**: AP는 WEB 설정 읽기 불가, 역도 마찬가지
- **DB 쓰기 분리**: WEB은 절대 DB write 불가
- **setuid/setgid 금지**: 불필요한 권한 상승 없음

---

## 8. DB 설정 자동화 설계

### 8-1. 자동 설정 항목

`blossom-lumina-db-init` RPM의 `%post` 스크립트에서 자동 수행:

1. Lumina 전용 데이터베이스 생성
2. 서비스 계정 생성 (writer/reader/admin)
3. 최소 권한 부여
4. TLS 접속 강제 설정
5. 보안 기본값 MariaDB 설정 파일 배치
6. 스키마 및 인덱스 생성
7. Retention 이벤트 스케줄러 등록

### 8-2. MariaDB 보안 기본 설정

```ini
# /etc/my.cnf.d/lumina-security.cnf — RPM이 자동 생성
[mysqld]
# ── TLS 강제 ──
ssl_ca     = /etc/blossom/lumina/tls/ca.crt
ssl_cert   = /etc/blossom/lumina/tls/server.crt
ssl_key    = /etc/blossom/lumina/tls/server.key
require_secure_transport = ON
tls_version = TLSv1.2,TLSv1.3

# ── 네트워크 최소 노출 ──
bind_address = 0.0.0.0   # 방화벽으로 AP/WEB IP만 허용
skip_name_resolve = ON

# ── 문자셋 ──
character_set_server = utf8mb4
collation_server = utf8mb4_unicode_ci

# ── 연결 제한 ──
max_connections = 200
wait_timeout = 300
interactive_timeout = 300
connect_timeout = 10

# ── 성능 (로그 적재 특성) ──
innodb_buffer_pool_size = 1G
innodb_log_file_size = 256M
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT
innodb_file_per_table = ON

# ── 배치 INSERT 최적화 ──
bulk_insert_buffer_size = 64M

# ── 슬로우 쿼리 ──
slow_query_log = ON
slow_query_log_file = /var/log/mariadb/lumina-slow.log
long_query_time = 2

# ── 보안 ──
local_infile = OFF
symbolic_links = OFF
log_warnings = 2

# ── 감사 (MariaDB Audit Plugin) ──
# plugin_load_add = server_audit
# server_audit_logging = ON
# server_audit_events = CONNECT,QUERY_DDL,QUERY_DML
# server_audit_file_path = /var/log/mariadb/lumina-audit.log
```

### 8-3. 개인정보 보호 전략

| 데이터 유형 | 처리 방식 | DB 구현 |
|------------|-----------|---------|
| 주민번호 | 수집 금지 | — |
| 이메일 | 마스킹 후 저장 | `email_masked VARCHAR(255)` |
| 전화번호 | 뒷자리 마스킹 | `phone_masked VARCHAR(20)` |
| IP 주소 | 원본 저장 (운영 필수) | 접근 제한으로 보호 |
| 계정 ID | 원본 저장 | 조회 권한 분리 |
| 비밀번호 | 수집 금지 | — |
| 인증 토큰 | 해시 저장 | `token_hash CHAR(64)` |

### 8-4. Retention 정책

| 데이터 유형 | 보존 기간 | 파기 방식 |
|------------|-----------|-----------|
| 자산 수집 로그 | 365일 | 자동 DELETE + OPTIMIZE |
| 감사 로그 | 730일 (2년) | 아카이브 후 삭제 |
| 세션/인증 로그 | 90일 | 자동 DELETE |
| 원본(raw) 데이터 | 30일 | AP 서버 로컬 삭제 |

---

## 9. WEB 설정 자동화 설계

### 9-1. RPM 설치 시 자동 수행 항목

1. NGINX 설정 파일 배치 (`/etc/nginx/conf.d/lumina.conf`)
2. Gunicorn systemd unit 등록
3. Flask 앱 배포 구조 생성
4. 보안 헤더 기본 적용
5. HTTPS 리다이렉트 설정
6. HSTS 활성화
7. secure cookie 기본값 주입
8. `lumina-web` 계정 생성
9. 로그 디렉터리 및 logrotate 설정

### 9-2. 보안 헤더 체크리스트

| 헤더 | 값 | 적용 위치 |
|------|-----|----------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | NGINX |
| `X-Content-Type-Options` | `nosniff` | NGINX |
| `X-Frame-Options` | `DENY` | NGINX |
| `X-XSS-Protection` | `0` (modern: CSP 대체) | NGINX |
| `Content-Security-Policy` | `default-src 'self'` | NGINX |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | NGINX |
| `Permissions-Policy` | `geolocation=(), camera=(), microphone=()` | NGINX |

---

## 10. AP 통신 설정 자동화 설계

### 10-1. 수신 아키텍처

```
Agent → [TLS :5100] → Receiver
                         │
                    ┌────▼────┐
                    │  Queue   │ (파일 기반 큐)
                    └────┬────┘
                         │
                    ┌────▼────┐
                    │  Parser  │ (JSON 파싱 + 검증)
                    └────┬────┘
                         │
                    ┌────▼────┐
                    │  Worker  │ (데이터 변환/정규화)
                    └────┬────┘
                         │
                    ┌────▼────────┐
                    │  DB Forwarder│ → MariaDB (TLS)
                    └─────────────┘
```

### 10-2. 보안 자동 설정

- TLS 수신 기본 활성화
- mTLS 설정 템플릿 자동 생성
- 수신 데이터 최대 크기: 10MB 기본 제한
- JSON 스키마 검증 활성화
- Rate limit: IP당 60req/min 기본값
- 실패 데이터 `/var/lib/blossom/lumina/ap/failed/` 에 격리
- raw 로그 `/var/lib/blossom/lumina/ap/raw/` 에 30일 보관
- 파일 기반 큐: 장애 시 데이터 유실 최소화

---

## 11. AGENT 설정 자동화 설계

### 11-1. 기존 Agent 호환성

| 기존 항목 | 신규 경로 | 전환 방식 |
|-----------|-----------|-----------|
| `/etc/lumina/lumina.conf` | `/etc/blossom/lumina/agent.conf` | 심볼릭 링크 + 자동 변환 |
| `/opt/lumina/` | `/opt/blossom/lumina/agent/` | 심볼릭 링크 |
| `lumina.service` | `lumina-agent.service` | alias |
| `/var/lib/lumina/` | `/var/lib/blossom/lumina/agent/` | 심볼릭 링크 |
| `/var/log/lumina/` | `/var/log/blossom/lumina/agent/` | 심볼릭 링크 |

### 11-2. 설정 자동화 항목

RPM `%post`에서 자동 수행:

1. `lumina` 시스템 계정 생성 (기존 존재 시 유지)
2. 디렉터리 생성 및 권한 설정
3. 기존 `/etc/lumina/lumina.conf` 발견 시 → 신규 포맷으로 자동 변환
4. TLS 인증서 경로 placeholder 설정
5. systemd unit 등록
6. 로컬 큐 디렉터리 생성
7. logrotate 설정

### 11-3. Agent 설정 파일 표준

```ini
[server]
host = ap.example.com
port = 5100
protocol = https
verify_ssl = true

[tls]
ca_cert = /etc/blossom/lumina/tls/ca.crt
client_cert = /etc/blossom/lumina/tls/client.crt
client_key = /etc/blossom/lumina/tls/client.key

[auth]
# mTLS 사용 시 token은 선택 사항
# token_file = /etc/blossom/lumina/agent-token

[agent]
interval = 3600
output_dir = /var/lib/blossom/lumina/agent
queue_dir = /var/lib/blossom/lumina/agent/queue
collectors = interface, account, package

[retry]
max_attempts = 5
backoff_base = 30
backoff_max = 3600
queue_max_size_mb = 500

[logging]
log_dir = /var/log/blossom/lumina/agent
log_level = INFO
mask_sensitive = true
```

---

## 12. 설정 파일 템플릿

별도 파일 참조:
- `deploy/conf/common.conf`
- `deploy/conf/ap.conf`
- `deploy/conf/web.conf`
- `deploy/conf/db.conf`
- `deploy/conf/agent.conf`
- `deploy/conf/secure.env`

---

## 13. systemd unit 파일

별도 파일 참조:
- `deploy/systemd/lumina-ap.service`
- `deploy/systemd/lumina-web.service`

---

## 14. RPM spec 파일

별도 파일 참조:
- `deploy/rpm/blossom-lumina-common.spec`
- `deploy/rpm/blossom-lumina-ap.spec`
- `deploy/rpm/blossom-lumina-web.spec`
- `deploy/rpm/blossom-lumina-db-init.spec`

---

## 15. MariaDB 초기화 SQL 및 보안 SQL

별도 파일 참조:
- `deploy/sql/init.sql`

---

## 16. NGINX / Gunicorn / Flask 운영 설정

별도 파일 참조:
- `deploy/nginx/lumina.conf`

---

## 17. 방화벽 / 네트워크 정책

### 17-1. 서버별 firewalld 정책

#### AP 서버

```bash
# Agent 수신 포트 (자체 존 또는 서비스 정의)
firewall-cmd --permanent --new-service=lumina-ap 2>/dev/null || true
firewall-cmd --permanent --service=lumina-ap --set-description="Lumina AP Receiver"
firewall-cmd --permanent --service=lumina-ap --add-port=5100/tcp
firewall-cmd --permanent --add-service=lumina-ap
# 나머지 모든 포트 차단 (기본 정책)
firewall-cmd --permanent --set-default-zone=drop
firewall-cmd --permanent --zone=drop --add-service=ssh
firewall-cmd --permanent --zone=drop --add-service=lumina-ap
firewall-cmd --reload
```

#### WEB 서버

```bash
firewall-cmd --permanent --new-service=lumina-web 2>/dev/null || true
firewall-cmd --permanent --service=lumina-web --add-port=443/tcp
firewall-cmd --permanent --add-service=lumina-web
firewall-cmd --permanent --set-default-zone=drop
firewall-cmd --permanent --zone=drop --add-service=ssh
firewall-cmd --permanent --zone=drop --add-service=lumina-web
firewall-cmd --reload
```

#### DB 서버

```bash
# AP/WEB 서버 IP만 3306 허용 (rich rule)
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="AP_SERVER_IP" port port="3306" protocol="tcp" accept'
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="WEB_SERVER_IP" port port="3306" protocol="tcp" accept'
firewall-cmd --permanent --set-default-zone=drop
firewall-cmd --permanent --zone=drop --add-service=ssh
firewall-cmd --reload
```

### 17-2. 네트워크 세그먼트

| 세그먼트 | 서버 | 허용 통신 |
|----------|------|----------|
| DMZ | WEB 서버 | 외부 → :443 |
| 내부망 | AP 서버 | Agent → :5100, → DB :3306 |
| DB 존 | DB 서버 | AP :3306, WEB :3306 (R/O) |
| 수집 대상 | Agent 서버 | → AP :5100 (outbound only) |

---

## 18. SELinux 고려사항

### 18-1. 정책 모드

- **Enforcing 모드 필수** (Permissive/Disabled 금지)
- Rocky Linux 8/9/10 모두 기본 Enforcing

### 18-2. 서비스별 SELinux 컨텍스트

```bash
# AP 수신 포트 허용
semanage port -a -t lumina_ap_port_t -p tcp 5100

# 실행 파일 컨텍스트
semanage fcontext -a -t bin_t '/opt/blossom/lumina/bin(/.*)?'
semanage fcontext -a -t lumina_ap_exec_t '/opt/blossom/lumina/ap(/.*)?'
semanage fcontext -a -t httpd_exec_t '/opt/blossom/lumina/web(/.*)?'

# 데이터 디렉터리
semanage fcontext -a -t lumina_var_lib_t '/var/lib/blossom/lumina(/.*)?'
semanage fcontext -a -t lumina_log_t '/var/log/blossom/lumina(/.*)?'

# 설정 파일
semanage fcontext -a -t lumina_etc_t '/etc/blossom/lumina(/.*)?'

# 적용
restorecon -Rv /opt/blossom/lumina/
restorecon -Rv /var/lib/blossom/lumina/
restorecon -Rv /var/log/blossom/lumina/
restorecon -Rv /etc/blossom/lumina/
```

### 18-3. Boolean 설정

```bash
# Gunicorn -> MariaDB 연결 허용
setsebool -P httpd_can_network_connect_db 1

# NGINX reverse proxy 허용
setsebool -P httpd_can_network_connect 1

# 필요 시 커스텀 정책 모듈 (RPM 포함)
# semodule -i lumina-ap.pp
```

### 18-4. RPM에 SELinux 정책 포함

각 RPM `%post`에서 `semanage` 명령 실행, `%postun`에서 제거.
복잡한 경우 `.te`/`.pp` 정책 모듈을 RPM에 포함.

---

## 19. 데이터 흐름별 보안 설계표

| # | 구간 | 프로토콜 | 인증 | 암호화 | 데이터 | 민감정보 처리 |
|---|------|----------|------|--------|--------|--------------|
| 1 | Agent 수집 | 로컬 | OS 계정 | N/A | NIC/계정/패키지 | 비밀번호 수집 금지 |
| 2 | Agent → AP | TLS 1.3 | mTLS + 토큰 | AES-256-GCM | JSON payload | 전송 전 마스킹 |
| 3 | AP Queue | 로컬 파일 | FS 권한 | 0700 | 수신 데이터 | 디스크 암호화 권장 |
| 4 | AP Parser | 내부 | N/A | N/A | 파싱 결과 | 추가 마스킹 |
| 5 | AP → DB | TLS 1.2+ | DB 계정 | AES-256 | SQL INSERT | 민감 컬럼 AES_ENCRYPT |
| 6 | DB 저장 | 디스크 | FS 권한 | InnoDB encrypt | 정형 데이터 | 컬럼 암호화 |
| 7 | WEB → DB | TLS 1.2+ | DB 계정(R/O) | AES-256 | SELECT | 마스킹된 값 반환 |
| 8 | WEB → 사용자 | HTTPS | 세션/CSRF | TLS 1.3 | HTML/JSON | UI 마스킹 |
| 9 | 로그 출력 | 로컬 파일 | FS 권한 | N/A | 텍스트 | 자동 마스킹 필수 |
| 10 | 백업 | 로컬/원격 | 접근 제한 | AES-256 암호화 | 전체 DB | 암호화 백업만 허용 |

---

## 20. 로그 / 감사 / 백업 / 복구 정책

### 20-1. 로그 정책

| 서비스 | 로그 경로 | 순환 주기 | 보존 | 크기 제한 |
|--------|---------|----------|------|----------|
| Agent | `/var/log/blossom/lumina/agent/` | daily | 30일 | 100MB |
| AP Receiver | `/var/log/blossom/lumina/ap/receiver.log` | daily | 90일 | 500MB |
| AP Parser | `/var/log/blossom/lumina/ap/parser.log` | daily | 90일 | 500MB |
| AP Worker | `/var/log/blossom/lumina/ap/worker.log` | daily | 90일 | 500MB |
| WEB Access | `/var/log/blossom/lumina/web/access.log` | daily | 90일 | 500MB |
| WEB Error | `/var/log/blossom/lumina/web/error.log` | daily | 90일 | 200MB |
| Gunicorn | `/var/log/blossom/lumina/web/gunicorn.log` | daily | 30일 | 200MB |
| 감사 | `/var/log/blossom/lumina/audit/` | daily | 730일 | 1GB |

### 20-2. Logrotate 설정

```
/var/log/blossom/lumina/*/*.log {
    daily
    rotate 90
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
    dateext
    dateformat -%Y%m%d
    sharedscripts
    postrotate
        systemctl reload lumina-ap 2>/dev/null || true
        systemctl reload lumina-web 2>/dev/null || true
    endscript
}
```

### 20-3. 감사 로그 대상

- 관리자 로그인/로그아웃
- 설정 변경
- DB 스키마 변경
- 사용자/권한 추가/변경/삭제
- 개인정보 조회 (SELECT 감사)
- 인증 실패 (Agent/WEB)
- TLS 인증서 교체

### 20-4. 백업 정책

| 대상 | 방법 | 주기 | 보존 | 암호화 |
|------|------|------|------|--------|
| DB 전체 | `mariadb-dump --ssl` | 일 1회 | 30일 | AES-256 (openssl enc) |
| DB 바이너리 로그 | `mariabackup --ssl` | 실시간 | 7일 | 파일시스템 암호화 |
| 설정 파일 | `tar + gpg` | 변경 시 | 90일 | GPG 암호화 |
| 인증서 | 별도 금고 | 갱신 시 | 영구 | 오프라인 보관 |

### 20-5. 복구 절차

1. DB 복구: `mariadb-dump` 복원 → 바이너리 로그 적용 → 무결성 검증
2. AP 복구: RPM 재설치 → 설정 복원 → 큐 데이터 재처리
3. WEB 복구: RPM 재설치 → 설정 복원 → 서비스 시작
4. Agent 복구: RPM 재설치 → 설정 복원 → 로컬 큐 재전송

---

## 21. 배포 및 업그레이드 절차

### 21-1. 초기 배포 순서

```
1. DB 서버
   └── rpm -ivh blossom-lumina-db-init-*.rpm
   └── mysql < /opt/blossom/lumina/sql/init.sql  (관리자 실행)
   └── TLS 인증서 배치

2. AP 서버
   └── rpm -ivh blossom-lumina-common-*.rpm
   └── rpm -ivh blossom-lumina-ap-*.rpm
   └── TLS 인증서 배치 (서버 + CA)
   └── /etc/blossom/lumina/secure.env 편집
   └── systemctl start lumina-ap

3. WEB 서버
   └── rpm -ivh blossom-lumina-common-*.rpm
   └── rpm -ivh blossom-lumina-web-*.rpm
   └── TLS 인증서 배치 (HTTPS)
   └── /etc/blossom/lumina/secure.env 편집
   └── systemctl start lumina-web
   └── systemctl start nginx

4. Agent 서버 (각 대상)
   └── rpm -ivh blossom-lumina-common-*.rpm
   └── rpm -ivh blossom-lumina-agent-*.rpm  (또는 rpm -U, 기존 lumina RPM 업그레이드)
   └── /etc/blossom/lumina/agent.conf 편집
   └── TLS 클라이언트 인증서 배치
   └── systemctl start lumina-agent
```

### 21-2. 업그레이드 절차

```bash
# 1. 서비스 정지 (graceful)
systemctl stop lumina-ap   # AP

# 2. 패키지 업그레이드
rpm -Uvh blossom-lumina-common-*.rpm
rpm -Uvh blossom-lumina-ap-*.rpm

# 3. 설정 확인 (rpmnew 파일 확인)
diff /etc/blossom/lumina/ap.conf /etc/blossom/lumina/ap.conf.rpmnew

# 4. 서비스 재시작
systemctl start lumina-ap

# 5. 헬스체크
/opt/blossom/lumina/bin/lumina-healthcheck
```

### 21-3. 롤백 절차

```bash
# RPM 다운그레이드
rpm -Uvh --oldpackage blossom-lumina-ap-1.0.0-1.el9.noarch.rpm

# 설정 복원
cp /etc/blossom/lumina/ap.conf.rpmsave /etc/blossom/lumina/ap.conf

# 서비스 재시작
systemctl restart lumina-ap
```

---

## 22. 운영 보안 점검 체크리스트

### 22-1. 일일 점검

- [ ] 전 서비스 정상 동작 확인 (`systemctl status`)
- [ ] Agent 전송 실패 큐 확인 (`/var/lib/blossom/lumina/agent/queue/`)
- [ ] AP 실패 큐 확인 (`/var/lib/blossom/lumina/ap/failed/`)
- [ ] 디스크 사용량 확인 (로그/큐/DB)
- [ ] 인증 실패 로그 확인
- [ ] 비정상 접근 시도 확인 (NGINX access.log)

### 22-2. 주간 점검

- [ ] TLS 인증서 만료일 확인 (30일 이내 갱신)
- [ ] DB slow query 점검
- [ ] logrotate 정상 동작 확인
- [ ] 권한 설정 변경 여부 확인
- [ ] SELinux 거부 로그 확인 (`ausearch -m avc`)
- [ ] 패키지 보안 업데이트 확인

### 22-3. 월간 점검

- [ ] 서비스 계정 권한 재검토
- [ ] DB 계정 권한 재검토
- [ ] 방화벽 규칙 재검토
- [ ] 불필요한 포트 열림 여부 (`ss -tlnp`)
- [ ] 인증서 갱신 계획 수립
- [ ] Retention 정책 이행 확인
- [ ] 개인정보 마스킹 정상 동작 확인
- [ ] 백업 복구 테스트 (분기 1회)

### 22-4. 보안 금지 항목 점검

- [ ] root로 실행 중인 Lumina 서비스 없음
- [ ] 평문 통신 포트 없음 (netstat/ss)
- [ ] `verify_ssl = false` 설정 없음
- [ ] `DEBUG = True` 설정 없음
- [ ] 하드코딩된 비밀번호/토큰 없음
- [ ] 777 권한 파일/디렉터리 없음
- [ ] DB root 원격 접속 허용 없음
- [ ] SELinux Disabled/Permissive 아님
- [ ] 자체 서명 인증서 무분별 사용 없음
- [ ] WEB 서버에서 DB write 연결 없음

---

## 부록: 파일 산출물 목록

| # | 파일 | 경로 |
|---|------|------|
| 1 | blossom-lumina-common.spec | `deploy/rpm/` |
| 2 | blossom-lumina-ap.spec | `deploy/rpm/` |
| 3 | blossom-lumina-web.spec | `deploy/rpm/` |
| 4 | blossom-lumina-db-init.spec | `deploy/rpm/` |
| 5 | lumina-ap.service | `deploy/systemd/` |
| 6 | lumina-web.service | `deploy/systemd/` |
| 7 | lumina.conf (NGINX) | `deploy/nginx/` |
| 8 | init.sql | `deploy/sql/` |
| 9 | common.conf | `deploy/conf/` |
| 10 | ap.conf | `deploy/conf/` |
| 11 | web.conf | `deploy/conf/` |
| 12 | db.conf | `deploy/conf/` |
| 13 | secure.env | `deploy/conf/` |
| 14 | agent.conf | `deploy/conf/` |
