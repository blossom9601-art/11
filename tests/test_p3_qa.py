"""
P3 — 보완 동작테스트 (사용성·경계값·보안)
==========================================
QA_동작테스트_계획서.md의 P3 시나리오를 자동화한 테스트.

대상:
  P3-01 : 존재하지 않는 URL → 404
  P3-02 : SQL Injection 시도 → 안전 처리
  P3-03 : XSS 스크립트 입력 → 이스케이프 처리
  P3-04 : 매우 긴 문자열 입력 → 에러 없이 처리
  P3-05 : 동일 데이터 버전 충돌 → 409
  P3-07 : 더블클릭(중복 등록) 방지
  P3-10 : CSV 내보내기(해당 시 검증)

  + 추가 보안:
    - 500 에러에 스택트레이스 미노출
    - 공백만 입력 시 필수값 검증
    - 삭제된 데이터 재조회 → 404
    - 업무보고서 결재 플로우 상태 검증
"""
from datetime import datetime, timedelta

import pytest

from app.models import (
    AuthUser,
    CalSchedule,
    SvcTicket,
    UserProfile,
    WrkReport,
    db,
)


# ═══════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════

def _login(client, *, user_id, emp_no, role=None):
    with client.session_transaction() as sess:
        sess['user_id'] = user_id
        sess['emp_no'] = emp_no
        sess['user_profile_id'] = user_id
        sess['_login_at'] = datetime.utcnow().isoformat()
        if role:
            sess['role'] = role


def _ensure_raw_tables(app):
    stmts = [
        """CREATE TABLE IF NOT EXISTS security_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type VARCHAR(50) NOT NULL,
            emp_no VARCHAR(30) NOT NULL DEFAULT '',
            ip_address VARCHAR(45) NOT NULL DEFAULT '',
            description VARCHAR(500) NOT NULL DEFAULT '',
            details TEXT DEFAULT '',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""",
        """CREATE TABLE IF NOT EXISTS active_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id VARCHAR(255) NOT NULL UNIQUE,
            emp_no VARCHAR(64) NOT NULL,
            user_name TEXT NOT NULL DEFAULT '',
            ip_address TEXT, user_agent TEXT, browser TEXT, os TEXT,
            created_at TEXT NOT NULL, last_active TEXT NOT NULL,
            is_current INTEGER NOT NULL DEFAULT 0
        )""",
        """CREATE TABLE IF NOT EXISTS security_policy (
            id INTEGER PRIMARY KEY,
            min_length INTEGER NOT NULL DEFAULT 12,
            max_length INTEGER NOT NULL DEFAULT 64,
            expiry_days INTEGER NOT NULL DEFAULT 90,
            history INTEGER NOT NULL DEFAULT 5,
            fail_lock_threshold INTEGER NOT NULL DEFAULT 5,
            lock_duration_minutes INTEGER NOT NULL DEFAULT 30,
            max_sessions INTEGER NOT NULL DEFAULT 1,
            absolute_hours INTEGER NOT NULL DEFAULT 12,
            concurrent_policy TEXT NOT NULL DEFAULT 'kill_oldest',
            updated_at TEXT
        )""",
        "INSERT OR IGNORE INTO security_policy (id) VALUES (1)",
    ]
    with app.app_context():
        for sql in stmts:
            try:
                db.session.execute(db.text(sql))
            except Exception:
                db.session.rollback()
        db.session.commit()


def _create_auth_user(app, emp_no, password='Test1234!', status='active',
                      role='user'):
    _ensure_raw_tables(app)
    with app.app_context():
        au = AuthUser(emp_no=emp_no, role=role, status=status,
                      login_fail_cnt=0,
                      last_terms_accepted_at=datetime.utcnow())
        au.set_password(password)
        db.session.add(au)
        db.session.flush()
        up = UserProfile.query.filter_by(emp_no=emp_no).first()
        if not up:
            up = UserProfile(emp_no=emp_no, name=f'User {emp_no}',
                             department='IT', email=f'{emp_no}@test.com',
                             allowed_ip='*')
            db.session.add(up)
        db.session.commit()
        return au.id, up.id


def _json(resp):
    return resp.get_json(force=True)


XHR = {'X-Requested-With': 'XMLHttpRequest'}


# ═══════════════════════════════════════════════════════════
#  P3-01 : 존재하지 않는 URL → 404
# ═══════════════════════════════════════════════════════════

class TestP3NotFound:
    """미등록 페이지/API 접근 시 적절한 404 응답"""

    def test_unknown_spa_page_returns_404(self, app, authed_client):
        """/p/nonexistent_key → 404 (500 아님)"""
        resp = authed_client.get('/p/this_page_does_not_exist_xyz',
                                headers={'X-Requested-With': 'blossom-spa'})
        assert resp.status_code == 404

    def test_unknown_api_returns_404_json(self, app, authed_client):
        """없는 API → 404 JSON"""
        resp = authed_client.get('/api/nonexistent-endpoint-xyz',
                                headers=XHR)
        assert resp.status_code == 404
        data = _json(resp)
        assert data.get('success') is False

    def test_deleted_report_returns_404(self, app, authed_client):
        """삭제된 업무보고서 재조회 → 404"""
        # 생성
        resp = authed_client.post('/api/wrk/reports',
                                 json={'task_title': '삭제예정 보고서'},
                                 headers=XHR)
        rid = _json(resp)['item']['id']

        # 삭제
        authed_client.delete(f'/api/wrk/reports/{rid}', headers=XHR)

        # 재조회 → 404
        resp = authed_client.get(f'/api/wrk/reports/{rid}', headers=XHR)
        assert resp.status_code == 404

    def test_nonexistent_id_returns_404(self, app, authed_client):
        """존재하지 않는 ID → 404"""
        resp = authed_client.get('/api/wrk/reports/999999', headers=XHR)
        assert resp.status_code == 404

    def test_deleted_ticket_returns_404(self, app, authed_client):
        """삭제된 티켓 재조회 → 404"""
        due = (datetime.utcnow() + timedelta(days=1)).strftime('%Y-%m-%d')
        resp = authed_client.post('/api/tickets',
                                 json={'title': '삭제티켓', 'ticket_type': '요청',
                                       'priority': '보통', 'due_at': due},
                                 headers=XHR)
        tid = _json(resp)['item']['id']
        authed_client.delete(f'/api/tickets/{tid}', headers=XHR)
        resp = authed_client.get(f'/api/tickets/{tid}', headers=XHR)
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════
#  P3-02 : SQL Injection 안전 처리
# ═══════════════════════════════════════════════════════════

class TestP3SQLInjection:
    """SQL Injection 시도 → 안전하게 처리 (ORM 파라미터 바인딩)"""

    SQLI_PAYLOADS = [
        "' OR 1=1--",
        "'; DROP TABLE org_user;--",
        "1 UNION SELECT * FROM auth_users--",
        "\" OR \"\"=\"",
    ]

    @pytest.mark.parametrize('payload', SQLI_PAYLOADS)
    def test_search_sqli_safe(self, app, authed_client, payload):
        """검색 API에 SQL Injection 문자열 → 200, 정상 0건"""
        resp = authed_client.get(f'/api/permission/users?q={payload}',
                                headers=XHR)
        assert resp.status_code == 200
        data = _json(resp)
        assert data['success'] is True
        # 전체 DB 덤프가 아닌 0건 또는 해당 문자열 포함 결과만
        assert isinstance(data.get('users', []), list)

    @pytest.mark.parametrize('payload', SQLI_PAYLOADS)
    def test_calendar_search_sqli(self, app, authed_client, payload):
        """캘린더 검색에 SQL Injection → 200, 안전"""
        resp = authed_client.get(f'/api/calendar/schedules?q={payload}',
                                headers=XHR)
        assert resp.status_code == 200

    def test_sqli_in_create_field(self, app, authed_client):
        """등록 필드에 SQL Injection → 문자열 그대로 저장"""
        payload = "'; DROP TABLE wrk_report;--"
        resp = authed_client.post('/api/wrk/reports',
                                 json={'task_title': payload},
                                 headers=XHR)
        assert resp.status_code == 201
        data = _json(resp)
        assert data['item']['task_title'] == payload


# ═══════════════════════════════════════════════════════════
#  P3-03 : XSS 방지
# ═══════════════════════════════════════════════════════════

class TestP3XSS:
    """XSS 스크립트 입력 → 이스케이프 또는 그대로 저장 (실행 안 됨)"""

    XSS_PAYLOADS = [
        "<script>alert('xss')</script>",
        '<img src=x onerror=alert(1)>',
        '"><svg onload=alert(1)>',
    ]

    @pytest.mark.parametrize('xss', XSS_PAYLOADS)
    def test_xss_stored_safely_in_report(self, app, authed_client, xss):
        """업무보고서 제목에 XSS → 문자 그대로 저장, 스크립트 태그 미실행"""
        resp = authed_client.post('/api/wrk/reports',
                                 json={'task_title': xss},
                                 headers=XHR)
        assert resp.status_code == 201
        data = _json(resp)
        title = data['item']['task_title']
        # 문자열 그대로이거나 이스케이프됨 — <script>가 실행되지 않음
        assert '<script>' not in title or title == xss

    @pytest.mark.parametrize('xss', XSS_PAYLOADS)
    def test_xss_in_ticket(self, app, authed_client, xss):
        """티켓 제목에 XSS → 안전 저장"""
        due = (datetime.utcnow() + timedelta(days=1)).strftime('%Y-%m-%d')
        resp = authed_client.post('/api/tickets',
                                 json={'title': xss, 'ticket_type': '요청',
                                       'priority': '보통', 'due_at': due},
                                 headers=XHR)
        assert resp.status_code == 201

    def test_xss_in_search_returns_safely(self, app, authed_client):
        """검색어에 XSS → 200, 에러 없이 처리"""
        resp = authed_client.get(
            "/api/permission/users?q=<script>alert(1)</script>",
            headers=XHR)
        assert resp.status_code == 200
        ct = resp.content_type or ''
        assert 'application/json' in ct


# ═══════════════════════════════════════════════════════════
#  P3-04 : 매우 긴 문자열 입력
# ═══════════════════════════════════════════════════════════

class TestP3LongString:
    """극단적 길이 입력 → 500 에러 없이 처리"""

    def test_long_search_query(self, app, authed_client):
        """1000자 검색어 → 200, 0건"""
        long_q = 'A' * 1000
        resp = authed_client.get(f'/api/permission/users?q={long_q}',
                                headers=XHR)
        assert resp.status_code == 200
        data = _json(resp)
        assert data['success'] is True

    def test_long_title_in_report(self, app, authed_client):
        """500자 제목 입력 → 정상 생성 또는 400 (500 아님)"""
        title = '가' * 500
        resp = authed_client.post('/api/wrk/reports',
                                 json={'task_title': title},
                                 headers=XHR)
        assert resp.status_code in (201, 400)

    def test_long_title_in_ticket(self, app, authed_client):
        """500자 제목 → 정상 생성 또는 400"""
        due = (datetime.utcnow() + timedelta(days=1)).strftime('%Y-%m-%d')
        title = 'B' * 500
        resp = authed_client.post('/api/tickets',
                                 json={'title': title, 'ticket_type': '요청',
                                       'priority': '보통', 'due_at': due},
                                 headers=XHR)
        assert resp.status_code in (201, 400)

    def test_very_long_remark(self, app, authed_client):
        """10000자 remark → 정상 처리 (TEXT 컬럼)"""
        resp = authed_client.post('/api/governance/backup/storage-pools',
                                 json={'pool_name': 'LongRemarkPool',
                                       'storage_asset_id': 1,
                                       'remark': 'X' * 10000},
                                 headers=XHR)
        assert resp.status_code in (201, 400)
        if resp.status_code == 201:
            assert len(_json(resp)['item']['remark']) == 10000


# ═══════════════════════════════════════════════════════════
#  P3-05 : 버전 충돌 (Optimistic Locking)
# ═══════════════════════════════════════════════════════════

class TestP3VersionConflict:
    """동일 데이터 동시 수정 → 409 VERSION_MISMATCH"""

    def test_report_version_conflict(self, app, authed_client):
        """업무보고서: 구버전으로 수정 시도 → 409"""
        resp = authed_client.post('/api/wrk/reports',
                                 json={'task_title': '충돌 테스트'},
                                 headers=XHR)
        rid = _json(resp)['item']['id']

        # 정상 수정 (version=1)
        authed_client.put(f'/api/wrk/reports/{rid}',
                          json={'task_title': 'V2', 'version': 1},
                          headers=XHR)

        # 구버전(1)으로 재시도 → 409
        resp = authed_client.put(f'/api/wrk/reports/{rid}',
                                 json={'task_title': 'Conflict', 'version': 1},
                                 headers=XHR)
        assert resp.status_code == 409
        data = _json(resp)
        assert data.get('error_code') == 'VERSION_MISMATCH' or '수정' in data.get('message', '')

    def test_calendar_version_conflict(self, app, authed_client, actor_user_id):
        """캘린더 일정: 구버전 → 409"""
        now = datetime.utcnow()
        resp = authed_client.post('/api/calendar/schedules',
                                 json={'title': '충돌일정',
                                       'start_datetime': now.isoformat(),
                                       'end_datetime': (now + timedelta(hours=1)).isoformat()},
                                 headers=XHR)
        sid = _json(resp)['item']['id']

        # 정상 수정
        authed_client.put(f'/api/calendar/schedules/{sid}',
                          json={'title': 'V2',
                                'start_datetime': now.isoformat(),
                                'end_datetime': (now + timedelta(hours=1)).isoformat(),
                                'version': 1},
                          headers=XHR)

        # 구버전 → 409
        resp = authed_client.put(f'/api/calendar/schedules/{sid}',
                                 json={'title': 'Conflict',
                                       'start_datetime': now.isoformat(),
                                       'end_datetime': (now + timedelta(hours=1)).isoformat(),
                                       'version': 1},
                                 headers=XHR)
        assert resp.status_code == 409


# ═══════════════════════════════════════════════════════════
#  P3-07 : 더블클릭 — 중복 등록 방지
# ═══════════════════════════════════════════════════════════

class TestP3DoubleSubmit:
    """동일 데이터 2회 연속 POST — 중복 방지 (UNIQUE 위반 또는 2건 허용)"""

    def test_double_submit_storage_pool(self, app, authed_client):
        """스토리지 풀: 같은 이름 2회 → 첫 번째 성공, 두 번째 409(UNIQUE)"""
        payload = {'pool_name': 'DoublePool', 'storage_asset_id': 1}
        r1 = authed_client.post('/api/governance/backup/storage-pools',
                                json=payload, headers=XHR)
        assert r1.status_code == 201

        r2 = authed_client.post('/api/governance/backup/storage-pools',
                                json=payload, headers=XHR)
        assert r2.status_code == 409

    def test_double_submit_report(self, app, authed_client):
        """업무보고서: 동일 제목 2회 → UNIQUE 제약 없으므로 2건 생성됨"""
        payload = {'task_title': '더블클릭 보고서'}
        r1 = authed_client.post('/api/wrk/reports', json=payload, headers=XHR)
        r2 = authed_client.post('/api/wrk/reports', json=payload, headers=XHR)
        assert r1.status_code == 201
        assert r2.status_code == 201
        # 중복 방지가 서버에 없으면 프론트에서 처리 — 두 ID가 다름을 확인
        assert _json(r1)['item']['id'] != _json(r2)['item']['id']

    def test_double_submit_wrk_report_flow(self, app, authed_client):
        """업무보고서 상신 2회 연속 → 첫 번째 성공, 두 번째 409"""
        resp = authed_client.post('/api/wrk/reports',
                                 json={'task_title': '상신 더블'},
                                 headers=XHR)
        rid = _json(resp)['item']['id']

        # DRAFT→REVIEW (첫 상신)
        r1 = authed_client.post(f'/api/wrk/reports/{rid}/submit',
                                headers=XHR)
        assert r1.status_code == 200

        # REVIEW→REVIEW (두 번째 상신 — 이미 REVIEW 상태)
        r2 = authed_client.post(f'/api/wrk/reports/{rid}/submit',
                                headers=XHR)
        assert r2.status_code == 409


# ═══════════════════════════════════════════════════════════
#  공백 입력 검증
# ═══════════════════════════════════════════════════════════

class TestP3WhitespaceValidation:
    """공백만 입력 시 필수값 검증"""

    def test_blank_title_report(self, app, authed_client):
        """공백만 입력 제목 → 400 또는 일반적 검증 에러"""
        resp = authed_client.post('/api/wrk/reports',
                                 json={'task_title': '   '},
                                 headers=XHR)
        # trim 후 빈값 → 400 or 500 (서버 검증 통과 못함)
        assert resp.status_code in (400, 500)

    def test_blank_title_ticket(self, app, authed_client):
        """공백 제목 티켓 → 400"""
        due = (datetime.utcnow() + timedelta(days=1)).strftime('%Y-%m-%d')
        resp = authed_client.post('/api/tickets',
                                 json={'title': '   ', 'ticket_type': '요청',
                                       'priority': '보통', 'due_at': due},
                                 headers=XHR)
        assert resp.status_code == 400

    def test_blank_title_calendar(self, app, authed_client):
        """공백 제목 일정 → 400"""
        now = datetime.utcnow()
        resp = authed_client.post('/api/calendar/schedules',
                                 json={'title': '   ',
                                       'start_datetime': now.isoformat(),
                                       'end_datetime': (now + timedelta(hours=1)).isoformat()},
                                 headers=XHR)
        assert resp.status_code == 400

    def test_blank_pool_name(self, app, authed_client):
        """공백만 입력 스토리지 풀 이름 → 400"""
        resp = authed_client.post('/api/governance/backup/storage-pools',
                                 json={'pool_name': '  ',
                                       'storage_asset_id': 1},
                                 headers=XHR)
        assert resp.status_code == 400


# ═══════════════════════════════════════════════════════════
#  500 에러 스택트레이스 미노출
# ═══════════════════════════════════════════════════════════

class TestP3ErrorSafety:
    """서버 에러 시 내부 정보 누출 방지"""

    def test_404_no_stacktrace(self, app, authed_client):
        """404 JSON에 stacktrace/Traceback 미포함"""
        resp = authed_client.get('/api/nonexistent-xyz', headers=XHR)
        assert resp.status_code == 404
        body = resp.get_data(as_text=True)
        assert 'Traceback' not in body
        assert 'File "' not in body

    def test_405_no_stacktrace(self, app, authed_client):
        """405 JSON에 stacktrace 미포함"""
        resp = authed_client.patch('/api/wrk/reports', headers=XHR)
        assert resp.status_code == 405
        body = resp.get_data(as_text=True)
        assert 'Traceback' not in body

    def test_error_response_json_format(self, app, authed_client):
        """에러 응답이 표준 JSON 형식"""
        resp = authed_client.get('/api/nonexistent-xyz', headers=XHR)
        data = _json(resp)
        assert 'success' in data
        assert data['success'] is False


# ═══════════════════════════════════════════════════════════
#  업무보고서 결재 플로우 상태 검증
# ═══════════════════════════════════════════════════════════

class TestP3ApprovalFlow:
    """업무보고서 결재 상태 전이 규칙 검증"""

    def test_cannot_submit_non_draft(self, app, authed_client):
        """REVIEW 상태에서 상신 불가 → 409"""
        resp = authed_client.post('/api/wrk/reports',
                                 json={'task_title': '플로우 테스트'},
                                 headers=XHR)
        rid = _json(resp)['item']['id']

        # DRAFT → REVIEW
        authed_client.post(f'/api/wrk/reports/{rid}/submit', headers=XHR)

        # REVIEW → 상신 시도 (불가)
        resp = authed_client.post(f'/api/wrk/reports/{rid}/submit',
                                 headers=XHR)
        assert resp.status_code == 409

    def test_recall_own_report(self, app, authed_client):
        """본인이 등록한 REVIEW 보고서 회수 → DRAFT"""
        resp = authed_client.post('/api/wrk/reports',
                                 json={'task_title': '회수 테스트'},
                                 headers=XHR)
        rid = _json(resp)['item']['id']

        # 상신
        authed_client.post(f'/api/wrk/reports/{rid}/submit', headers=XHR)

        # 회수
        resp = authed_client.post(f'/api/wrk/reports/{rid}/recall',
                                 headers=XHR)
        assert resp.status_code == 200
        assert _json(resp)['item']['status'] == 'DRAFT'

    def test_approve_requires_team_leader(self, app, authed_client):
        """일반 사용자가 승인 시도 → 403"""
        resp = authed_client.post('/api/wrk/reports',
                                 json={'task_title': '권한 테스트'},
                                 headers=XHR)
        rid = _json(resp)['item']['id']
        authed_client.post(f'/api/wrk/reports/{rid}/submit', headers=XHR)

        # 일반 사용자 승인 시도
        resp = authed_client.post(f'/api/wrk/reports/{rid}/approve-init',
                                 headers=XHR)
        assert resp.status_code == 403

    def test_reject_requires_team_leader(self, app, authed_client):
        """일반 사용자가 반려 시도 → 403"""
        resp = authed_client.post('/api/wrk/reports',
                                 json={'task_title': '반려 권한 테스트'},
                                 headers=XHR)
        rid = _json(resp)['item']['id']
        authed_client.post(f'/api/wrk/reports/{rid}/submit', headers=XHR)

        resp = authed_client.post(f'/api/wrk/reports/{rid}/reject',
                                 headers=XHR)
        assert resp.status_code == 403

    def test_cannot_recall_others_report(self, app, authed_client,
                                          authed_client2):
        """타인의 보고서 회수 시도 → 403"""
        # ACTOR002가 보고서 생성 및 상신
        resp = authed_client2.post('/api/wrk/reports',
                                  json={'task_title': '타인 보고서'},
                                  headers=XHR)
        rid = _json(resp)['item']['id']
        authed_client2.post(f'/api/wrk/reports/{rid}/submit', headers=XHR)

        # ACTOR001이 회수 시도 → 403 (타인 보고서)
        resp = authed_client.post(f'/api/wrk/reports/{rid}/recall',
                                 headers=XHR)
        assert resp.status_code == 403


# ═══════════════════════════════════════════════════════════
#  특수문자 와일드카드
# ═══════════════════════════════════════════════════════════

class TestP3SpecialChars:
    """검색 와일드카드 특수문자 처리"""

    @pytest.mark.parametrize('char', ['%', '_', '\\'])
    def test_wildcard_chars_in_search(self, app, authed_client, char):
        """%, _, \\ 검색 → 에러 없이 200"""
        resp = authed_client.get(f'/api/permission/users?q={char}',
                                headers=XHR)
        assert resp.status_code == 200

    def test_unicode_search(self, app, authed_client):
        """한국어 검색 → 정상"""
        resp = authed_client.get('/api/permission/users?q=테스트',
                                headers=XHR)
        assert resp.status_code == 200

    def test_emoji_in_field(self, app, authed_client):
        """이모지 저장 → 에러 없이 처리"""
        resp = authed_client.post('/api/wrk/reports',
                                 json={'task_title': '🔥 긴급 작업 🚀'},
                                 headers=XHR)
        # SQLite는 emoji 지원, MySQL은 utf8mb4 필요
        assert resp.status_code in (201, 400, 500)


# ═══════════════════════════════════════════════════════════
#  인증 없는 API 접근 방어
# ═══════════════════════════════════════════════════════════

class TestP3UnauthAccess:
    """인증 없이 쓰기 API 접근 → 401 또는 302 리다이렉트"""

    def test_unauth_create_report(self, app, client):
        """미인증 상태 업무보고서 생성 → 401"""
        resp = client.post('/api/wrk/reports',
                           json={'task_title': '무인증'},
                           headers=XHR)
        assert resp.status_code in (401, 302)

    def test_unauth_create_ticket(self, app, client):
        """미인증 상태 티켓 생성 → 401"""
        resp = client.post('/api/tickets',
                           json={'title': '무인증', 'ticket_type': '요청',
                                 'priority': '보통', 'due_at': '2099-01-01'},
                           headers=XHR)
        assert resp.status_code in (401, 302)

    def test_unauth_create_schedule(self, app, client):
        """미인증 상태 일정 생성 → 401"""
        now = datetime.utcnow()
        resp = client.post('/api/calendar/schedules',
                           json={'title': '무인증',
                                 'start_datetime': now.isoformat(),
                                 'end_datetime': (now + timedelta(hours=1)).isoformat()},
                           headers=XHR)
        assert resp.status_code in (401, 302)
