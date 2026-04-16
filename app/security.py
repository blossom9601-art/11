"""
보안 모듈 — Blossom ITSM
========================
운영 환경 보안 강화를 위한 통합 보안 미들웨어/유틸리티.

[포함 기능]
1. 보안 헤더 (CSP, X-Frame-Options, HSTS 등)
2. CSRF 방어 (SameSite 쿠키 + 커스텀 헤더 검증)
3. Rate Limiting (IP 기반)
4. 파일 업로드 검증 (확장자 화이트리스트)
5. 입력값 새니타이징 헬퍼
6. 감사 로깅 (Audit Log)
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
import secrets
import time
from collections import defaultdict
from datetime import datetime, timedelta
from functools import wraps
from threading import Lock
from typing import Optional, Set, Tuple

from flask import Flask, Request, Response, abort, current_app, g, jsonify, request, session

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════
# 1) 보안 헤더 미들웨어
# ═══════════════════════════════════════════════════════════

def apply_security_headers(response: Response) -> Response:
    """모든 응답에 보안 헤더를 추가한다."""
    # X-Frame-Options: 클릭재킹 방지
    response.headers['X-Frame-Options'] = 'DENY'
    # X-Content-Type-Options: MIME 스니핑 방지
    response.headers['X-Content-Type-Options'] = 'nosniff'
    # X-XSS-Protection: 레거시 브라우저 XSS 필터
    response.headers['X-XSS-Protection'] = '1; mode=block'
    # Referrer-Policy: 외부 Referer 노출 방지
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    # Permissions-Policy: 불필요한 브라우저 기능 비활성화
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
    # Content-Security-Policy
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://unpkg.com; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "font-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none';"
    )
    # Cache-Control for HTML pages (API/pages, not static assets)
    if not request.path.startswith('/static/'):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, private'
        response.headers['Pragma'] = 'no-cache'
    return response


def apply_hsts_header(response: Response) -> Response:
    """HTTPS 환경에서 HSTS 헤더를 추가한다."""
    if request.is_secure or request.headers.get('X-Forwarded-Proto') == 'https':
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response


# ═══════════════════════════════════════════════════════════
# 2) CSRF 방어
# ═══════════════════════════════════════════════════════════

CSRF_SAFE_METHODS = frozenset({'GET', 'HEAD', 'OPTIONS'})
CSRF_EXEMPT_PATHS = frozenset({'/login', '/logout', '/api/mfa/status', '/api/mfa/send-code', '/api/mfa/verify'})


def generate_csrf_token() -> str:
    """세션에 CSRF 토큰을 생성하여 저장하고 반환한다."""
    if '_csrf_token' not in session:
        session['_csrf_token'] = secrets.token_hex(32)
    return session['_csrf_token']


def validate_csrf_request() -> Optional[Tuple[str, int]]:
    """비안전 메서드(POST/PUT/DELETE)에 대해 CSRF 검증을 수행한다.

    검증 방식 (택 1):
      1) X-Requested-With: XMLHttpRequest 헤더 (AJAX 요청)
      2) X-CSRF-Token 헤더에 세션 토큰과 일치하는 값
      3) Form body의 csrf_token 필드

    Returns:
        None if valid, (error_message, status_code) if invalid
    """
    if request.method in CSRF_SAFE_METHODS:
        return None

    # 테스트 환경에서는 CSRF 검증 생략
    if current_app.config.get('TESTING'):
        return None

    # 로그인/로그아웃 등 예외 경로
    if request.path in CSRF_EXEMPT_PATHS:
        return None

    # 파일 업로드 등 multipart 요청도 AJAX 호출이므로 X-Requested-With 확인
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return None

    # JSON content-type API 호출 (브라우저 form에서는 application/json 불가)
    content_type = request.content_type or ''
    if 'application/json' in content_type:
        return None

    # 토큰 기반 검증 (form submit 등)
    token = (
        request.headers.get('X-CSRF-Token')
        or request.form.get('csrf_token')
        or ''
    )
    expected = session.get('_csrf_token', '')
    if expected and hmac.compare_digest(token, expected):
        return None

    logger.warning('[CSRF] 검증 실패 path=%s method=%s ip=%s',
                   request.path, request.method, request.remote_addr)
    return ('CSRF 토큰이 유효하지 않습니다.', 403)


# ═══════════════════════════════════════════════════════════
# 3) Rate Limiting (메모리 기반, 단일 프로세스용)
# ═══════════════════════════════════════════════════════════

class RateLimiter:
    """IP 기반 요청 속도 제한기."""

    def __init__(self, max_requests: int = 200, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window = window_seconds
        self._buckets: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()
        self._last_cleanup = time.time()

    def is_rate_limited(self, key: str) -> bool:
        now = time.time()
        with self._lock:
            # 주기적 오래된 항목 정리 (5분마다)
            if now - self._last_cleanup > 300:
                self._cleanup(now)
                self._last_cleanup = now

            bucket = self._buckets[key]
            # 윈도우 밖의 항목 제거
            cutoff = now - self.window
            while bucket and bucket[0] < cutoff:
                bucket.pop(0)

            if len(bucket) >= self.max_requests:
                return True

            bucket.append(now)
            return False

    def _cleanup(self, now: float):
        cutoff = now - self.window
        keys_to_delete = []
        for key, bucket in self._buckets.items():
            while bucket and bucket[0] < cutoff:
                bucket.pop(0)
            if not bucket:
                keys_to_delete.append(key)
        for key in keys_to_delete:
            del self._buckets[key]


# 전역 리미터: API 600 req/min, 로그인 10 req/min
_api_limiter = RateLimiter(max_requests=600, window_seconds=60)
_login_limiter = RateLimiter(max_requests=10, window_seconds=60)


def check_rate_limit() -> Optional[Tuple[str, int]]:
    """현재 요청의 Rate Limit을 확인한다."""
    ip = request.remote_addr or 'unknown'

    # 로그인 엔드포인트: 더 엄격한 제한
    if request.path == '/login' and request.method == 'POST':
        if _login_limiter.is_rate_limited(f'login:{ip}'):
            logger.warning('[RateLimit] 로그인 제한 초과 ip=%s', ip)
            return ('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', 429)

    # 전체 API: 일반 제한 (heartbeat는 제외)
    if request.path.startswith('/api/') and request.path != '/api/session/heartbeat':
        if _api_limiter.is_rate_limited(f'api:{ip}'):
            logger.warning('[RateLimit] API 제한 초과 ip=%s', ip)
            return ('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', 429)

    return None


# ═══════════════════════════════════════════════════════════
# 4) 파일 업로드 보안
# ═══════════════════════════════════════════════════════════

# 허용 확장자 화이트리스트
ALLOWED_EXTENSIONS: Set[str] = {
    # 문서
    'txt', 'csv', 'log', 'pdf', 'doc', 'docx', 'xls', 'xlsx',
    'ppt', 'pptx', 'hwp', 'hwpx', 'rtf', 'odt', 'ods', 'odp',
    # 이미지
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico',
    # 압축 (안전한 형식)
    'zip', '7z', 'tar', 'gz',
    # 데이터
    'json', 'xml', 'yaml', 'yml',
}

# 실행 가능 확장자 (반드시 차단)
BLOCKED_EXTENSIONS: Set[str] = {
    'exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'pif', 'vbs',
    'vbe', 'js', 'jse', 'wsf', 'wsh', 'ps1', 'psm1', 'psd1',
    'sh', 'bash', 'csh', 'ksh', 'py', 'pyc', 'pyo', 'rb',
    'php', 'php3', 'php5', 'phtml', 'asp', 'aspx', 'jsp',
    'war', 'jar', 'class', 'dll', 'so', 'dylib',
    'elf', 'bin', 'run', 'app', 'action', 'command',
    'reg', 'inf', 'sct', 'hta', 'cpl', 'msc',
}


def is_allowed_file(filename: str) -> bool:
    """파일명이 허용된 확장자인지 검사한다."""
    if not filename or '.' not in filename:
        return False
    ext = filename.rsplit('.', 1)[1].lower()
    if ext in BLOCKED_EXTENSIONS:
        return False
    return ext in ALLOWED_EXTENSIONS


def sanitize_filename(filename: str) -> str:
    """파일명을 안전하게 변환한다 (UUID 접두사 추가)."""
    from werkzeug.utils import secure_filename as _secure
    safe = _secure(filename)
    if not safe:
        safe = 'unnamed'
    return f"{secrets.token_hex(8)}_{safe}"


# ═══════════════════════════════════════════════════════════
# 5) 입력값 새니타이징
# ═══════════════════════════════════════════════════════════

_HTML_ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
}
_HTML_ESCAPE_RE = re.compile(r'[&<>"\']')


def escape_html(text: str) -> str:
    """HTML 특수 문자를 이스케이프한다."""
    if not text:
        return text
    return _HTML_ESCAPE_RE.sub(lambda m: _HTML_ESCAPE_MAP[m.group()], text)


def sanitize_input(value: str, max_length: int = 10000) -> str:
    """사용자 입력값을 새니타이징한다.

    - 길이 제한
    - null 바이트 제거
    - 앞뒤 공백 제거
    """
    if not value:
        return ''
    # null 바이트 제거 (SQL 인젝션/로그 위조 방지)
    value = value.replace('\x00', '')
    # 길이 제한
    if len(value) > max_length:
        value = value[:max_length]
    return value.strip()


# ═══════════════════════════════════════════════════════════
# 6) 감사 로깅 (Audit Logging)
# ═══════════════════════════════════════════════════════════

def log_audit_event(
    event_type: str,
    description: str,
    emp_no: str = '',
    ip_address: str = '',
    details: str = '',
):
    """보안 감사 이벤트를 DB에 기록한다.

    event_type: LOGIN_SUCCESS, LOGIN_FAIL, LOGOUT, PERMISSION_CHANGE,
                DATA_MODIFY, DATA_DELETE, FILE_UPLOAD, SESSION_EXPIRE, etc.
    """
    if not emp_no:
        emp_no = session.get('emp_no', 'anonymous')
    if not ip_address:
        ip_address = request.remote_addr or ''

    try:
        from app.models import db
        from sqlalchemy import text as sa_text
        db.session.execute(sa_text(
            "INSERT INTO security_audit_log "
            "(event_type, emp_no, ip_address, description, details, created_at) "
            "VALUES (:type, :emp, :ip, :desc, :details, :now)"
        ), {
            'type': event_type,
            'emp': emp_no,
            'ip': ip_address,
            'desc': description[:500],
            'details': details[:2000] if details else '',
            'now': datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S'),
        })
        db.session.commit()
    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        logger.error('[AuditLog] 기록 실패: %s — %s', event_type, e)


# ═══════════════════════════════════════════════════════════
# 7) 앱 초기화 통합 함수
# ═══════════════════════════════════════════════════════════

def init_security(app: Flask):
    """Flask 앱에 보안 미들웨어를 등록한다."""

    # ── SECRET_KEY 검증 (프로덕션 필수) ──
    _WEAK_KEYS = {'dev-secret-key-change-in-production', 'secret', 'changeme', ''}
    _sk = app.config.get('SECRET_KEY', '')
    if not app.config.get('DEBUG') and not app.config.get('TESTING'):
        if not _sk or _sk in _WEAK_KEYS or len(_sk) < 32:
            logger.critical(
                '[Security] SECRET_KEY가 안전하지 않습니다! '
                '환경변수 SECRET_KEY를 64바이트 이상 랜덤 값으로 설정하세요. '
                '예: python -c "import secrets; print(secrets.token_hex(64))"'
            )
    elif _sk in _WEAK_KEYS:
        logger.warning('[Security] 개발 환경 기본 SECRET_KEY 사용 중 — 프로덕션 배포 전 반드시 변경하세요.')

    # ── HTTPS 리다이렉트 (프로덕션 전용) ──
    if not app.config.get('DEBUG') and not app.config.get('TESTING'):
        @app.before_request
        def _force_https():
            """프로덕션 환경에서 HTTP 요청을 HTTPS로 리다이렉트한다."""
            # 리버스 프록시가 X-Forwarded-Proto를 전달하는 경우 확인
            if not request.is_secure and request.headers.get('X-Forwarded-Proto', 'http') != 'https':
                from flask import redirect
                url = request.url.replace('http://', 'https://', 1)
                return redirect(url, code=301)

    # ── 세션 쿠키 보안 설정 ──
    app.config.setdefault('SESSION_COOKIE_HTTPONLY', True)
    app.config.setdefault('SESSION_COOKIE_SAMESITE', 'Lax')
    # 프로덕션에서만 Secure 플래그 (HTTPS 필수)
    if not app.config.get('DEBUG'):
        app.config.setdefault('SESSION_COOKIE_SECURE', True)
        app.config.setdefault('SESSION_COOKIE_SAMESITE', 'Strict')

    # ── 세션 만료 시간 (기본: 보안 정책 DB에서 관리, 여기는 Flask 기본값) ──
    # 15분 유휴 만료는 before_request에서 DB 정책으로 처리
    app.config.setdefault('PERMANENT_SESSION_LIFETIME', timedelta(hours=12))

    # ── CSRF 토큰을 Jinja 템플릿에 주입 ──
    @app.context_processor
    def _inject_csrf():
        return {'csrf_token': generate_csrf_token}

    # ── before_request: Rate Limiting + CSRF ──
    @app.before_request
    def _security_before_request():
        # Rate Limiting
        result = check_rate_limit()
        if result:
            msg, code = result
            if request.path.startswith('/api/') or request.is_json:
                return jsonify({'success': False, 'error': 'rate_limited', 'message': msg}), code
            abort(code)

        # CSRF 검증
        csrf_result = validate_csrf_request()
        if csrf_result:
            msg, code = csrf_result
            if request.path.startswith('/api/') or request.is_json:
                return jsonify({'success': False, 'error': 'csrf_invalid', 'message': msg}), code
            abort(code)

    # ── after_request: 보안 헤더 ──
    @app.after_request
    def _security_after_request(response: Response) -> Response:
        response = apply_security_headers(response)
        response = apply_hsts_header(response)
        return response

    # ── 에러 핸들러 보안 강화 ──
    _register_secure_error_handlers(app)

    logger.info('[Security] 보안 미들웨어 초기화 완료')


def init_security_tables(app: Flask):
    """DB 초기화 후 호출: 보안 감사 로그 테이블 생성."""
    _init_audit_log_table(app)


def _init_audit_log_table(app: Flask):
    """보안 감사 로그 테이블을 생성한다."""
    try:
        from app.models import db
        with app.app_context():
            db.session.execute(db.text("""
                CREATE TABLE IF NOT EXISTS security_audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type VARCHAR(50) NOT NULL,
                    emp_no VARCHAR(30) NOT NULL DEFAULT '',
                    ip_address VARCHAR(45) NOT NULL DEFAULT '',
                    description VARCHAR(500) NOT NULL DEFAULT '',
                    details TEXT DEFAULT '',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """))
            # 인덱스 생성 (이미 존재하면 무시)
            try:
                db.session.execute(db.text(
                    "CREATE INDEX IF NOT EXISTS idx_audit_log_type ON security_audit_log(event_type)"
                ))
                db.session.execute(db.text(
                    "CREATE INDEX IF NOT EXISTS idx_audit_log_emp ON security_audit_log(emp_no)"
                ))
                db.session.execute(db.text(
                    "CREATE INDEX IF NOT EXISTS idx_audit_log_created ON security_audit_log(created_at)"
                ))
            except Exception:
                pass
            db.session.commit()
    except Exception as e:
        logger.error('[Security] 감사 로그 테이블 생성 실패: %s', e)


def _register_secure_error_handlers(app: Flask):
    """에러 핸들러를 등록하여 내부 정보 노출을 방지한다."""

    @app.errorhandler(400)
    def _bad_request(e):
        if request.path.startswith('/api/') or request.is_json:
            return jsonify({'success': False, 'error': 'bad_request', 'message': '잘못된 요청입니다.'}), 400
        return app.jinja_env.get_or_select_template('error/pages-404.html').render(), 400

    @app.errorhandler(403)
    def _forbidden(e):
        if request.path.startswith('/api/') or request.is_json:
            return jsonify({'success': False, 'error': 'forbidden', 'message': '접근 권한이 없습니다.'}), 403
        return app.jinja_env.get_or_select_template('error/pages-404.html').render(), 403

    @app.errorhandler(429)
    def _rate_limited(e):
        if request.path.startswith('/api/') or request.is_json:
            return jsonify({'success': False, 'error': 'rate_limited', 'message': '요청이 너무 많습니다.'}), 429
        return app.jinja_env.get_or_select_template('error/pages-404.html').render(), 429

    @app.errorhandler(500)
    def _internal_error(e):
        logger.exception('[500] 내부 서버 오류 path=%s', request.path)
        if request.path.startswith('/api/') or request.is_json:
            return jsonify({'success': False, 'error': 'server_error', 'message': '처리 중 오류가 발생했습니다.'}), 500
        try:
            return app.jinja_env.get_or_select_template('error/pages-500.html').render(), 500
        except Exception:
            return '처리 중 오류가 발생했습니다.', 500
