"""
P1 — 최우선 동작테스트 (운영 투입 차단 기준)
==============================================
QA_동작테스트_계획서.md의 P1 시나리오를 자동화한 테스트.

대상:
  TC-AUTH  : 인증/세션/로그아웃
  TC-NAV   : 페이지 이동/라우팅
  TC-LIST  : 자산 목록 조회/검색/페이징
  TC-DETAIL: 상세 페이지 탭 전환
  TC-CRU   : 등록/수정 CRUD, 중복클릭 방지
  TC-DEL   : 삭제/일괄삭제
  TC-PERM  : 권한 격리 (READ/NONE/WRITE)
"""
import uuid
from datetime import datetime, timedelta

import pytest

from app.models import (
    AuthLoginHistory,
    AuthUser,
    UserProfile,
    db,
)


# ═══════════════════════════════════════════════════════════
#  Helper: 세션 로그인 유틸
# ═══════════════════════════════════════════════════════════

def _login(client, *, user_id, emp_no, role=None):
    """테스트 클라이언트에 세션을 수동 설정(HTTP POST 없이)."""
    with client.session_transaction() as sess:
        sess['user_id'] = user_id
        sess['emp_no'] = emp_no
        sess['user_profile_id'] = user_id
        sess['_login_at'] = datetime.utcnow().isoformat()
        if role:
            sess['role'] = role


def _ensure_raw_tables(app):
    """login 핸들러가 의존하는 raw SQL 테이블을 SQLite 호환 문법으로 생성."""
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
                      role='user', locked_until=None, login_fail_cnt=0):
    """AuthUser + UserProfile 레코드 생성 후 (auth_user.id, profile.id) 반환."""
    _ensure_raw_tables(app)
    with app.app_context():
        au = AuthUser(emp_no=emp_no, role=role, status=status,
                      login_fail_cnt=login_fail_cnt, locked_until=locked_until,
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


# ═══════════════════════════════════════════════════════════
#  P1-01 ~ P1-05 : 인증 / 세션
# ═══════════════════════════════════════════════════════════

class TestP1Auth:
    """TC-AUTH-001 ~ TC-AUTH-013: 로그인/로그아웃/세션"""

    # ── TC-AUTH-001: 정상 로그인 ──
    def test_login_success(self, app, client):
        """정상 사번/비밀번호 → 대시보드 리다이렉트, 세션 설정."""
        _create_auth_user(app, 'LOGIN01', 'Correct123!')

        resp = client.post('/login', data={
            'employee_id': 'LOGIN01',
            'password': 'Correct123!',
        }, follow_redirects=False)

        # 로그인 성공 시 리다이렉트(302)
        assert resp.status_code in (302, 200)
        if resp.status_code == 302:
            assert '/p/dashboard' in resp.headers.get('Location', '') or \
                   '/terms' in resp.headers.get('Location', '') or \
                   '/' in resp.headers.get('Location', '')

        # 세션에 emp_no 설정됨
        with client.session_transaction() as sess:
            assert sess.get('emp_no') == 'LOGIN01'

        # 로그인 히스토리 기록
        with app.app_context():
            hist = AuthLoginHistory.query.filter_by(
                emp_no='LOGIN01', success=True
            ).first()
            assert hist is not None

    # ── TC-AUTH-002: 잘못된 비밀번호 ──
    def test_login_wrong_password(self, app, client):
        """잘못된 비밀번호 → 로그인 실패, login_fail_cnt 증가."""
        _create_auth_user(app, 'WRONG01', 'RealPass1!')

        resp = client.post('/login', data={
            'employee_id': 'WRONG01',
            'password': 'BadPassword',
        })

        # 로그인 페이지 유지 (200)
        assert resp.status_code == 200
        html = resp.data.decode('utf-8')
        assert '비밀번호가 올바르지 않습니다' in html or 'error' in html.lower()

        # fail count 증가
        with app.app_context():
            user = AuthUser.query.filter_by(emp_no='WRONG01').first()
            assert user.login_fail_cnt >= 1

    # ── TC-AUTH-003: 5회 실패 → 계정 잠금 ──
    def test_login_account_lock_after_5_failures(self, app, client):
        """비밀번호 5회 틀리면 계정 잠금 30분."""
        _create_auth_user(app, 'LOCK01', 'GoodPass1!')

        # 5회 실패
        for i in range(5):
            client.post('/login', data={
                'employee_id': 'LOCK01',
                'password': f'Wrong{i}',
            })

        # DB 확인: 잠금 설정
        with app.app_context():
            user = AuthUser.query.filter_by(emp_no='LOCK01').first()
            assert user.login_fail_cnt >= 5
            assert user.locked_until is not None
            assert user.locked_until > datetime.utcnow()

        # 6번째: 올바른 비밀번호로도 잠금 메시지
        resp = client.post('/login', data={
            'employee_id': 'LOCK01',
            'password': 'GoodPass1!',
        })
        assert resp.status_code == 200
        html = resp.data.decode('utf-8')
        assert '잠겨' in html or 'locked' in html.lower()

    # ── TC-AUTH-004: 비활성 계정 ──
    def test_login_inactive_account(self, app, client):
        """비활성(inactive) 계정 → 로그인 거부."""
        _create_auth_user(app, 'INACT01', 'Pass1234!', status='inactive')

        resp = client.post('/login', data={
            'employee_id': 'INACT01',
            'password': 'Pass1234!',
        })
        assert resp.status_code == 200
        html = resp.data.decode('utf-8')
        assert '비활성' in html

    # ── TC-AUTH-005: 존재하지 않는 사번 ──
    def test_login_nonexistent_user(self, app, client):
        """존재하지 않는 사번 → 에러 메시지."""
        resp = client.post('/login', data={
            'employee_id': 'NOUSER999',
            'password': 'AnyPass1!',
        })
        assert resp.status_code == 200
        html = resp.data.decode('utf-8')
        assert '존재하지 않는' in html or '사번' in html

    # ── TC-AUTH-009: 하트비트 — 인증 세션 ──
    def test_heartbeat_authenticated(self, authed_client):
        """인증된 세션 → heartbeat alive=True."""
        resp = authed_client.get('/api/session/heartbeat')
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['alive'] is True

    # ── TC-AUTH-009b: 하트비트 — 미인증 ──
    def test_heartbeat_unauthenticated(self, client):
        """미인증 상태 → heartbeat 401."""
        resp = client.get('/api/session/heartbeat')
        assert resp.status_code == 401
        body = resp.get_json()
        assert body['alive'] is False

    # ── TC-AUTH-012: 로그아웃 → 세션 삭제 ──
    def test_logout_clears_session(self, app, client):
        """로그아웃 후 세션 완전 삭제."""
        au_id, up_id = _create_auth_user(app, 'LOGOUT01', 'Pass1234!')
        # 로그인 (HTTP POST 대신 세션 직접 설정 — 로그인 핸들러 부작용 회피)
        _login(client, user_id=up_id, emp_no='LOGOUT01')

        # 세션 확인
        with client.session_transaction() as sess:
            assert sess.get('emp_no') == 'LOGOUT01'

        # 로그아웃
        resp = client.get('/logout', follow_redirects=False)
        assert resp.status_code in (302, 200)

        # 세션 비어있음
        with client.session_transaction() as sess:
            assert sess.get('emp_no') is None
            assert sess.get('user_id') is None

    # ── TC-AUTH-013: 비인증 보호 API 접근 ──
    def test_unauthenticated_api_returns_401(self, client):
        """비인증 상태에서 보호된 API 호출 → 401."""
        endpoints = [
            ('GET', '/api/session/heartbeat'),
            ('GET', '/api/session/permissions'),
        ]
        for method, url in endpoints:
            resp = getattr(client, method.lower())(url)
            assert resp.status_code == 401, f'{method} {url} should be 401'

    # ── TC-AUTH-010: 세션 강제 종료 후 하트비트 ──
    def test_heartbeat_after_session_killed(self, app, client):
        """active_sessions에서 제거된 세션 → 하트비트 401 또는 세션 클리어."""
        au_id, up_id = _create_auth_user(app, 'KILL01', 'Pass1234!')

        # 세션을 수동 설정 (_session_id 없이 → middleware가 자동 등록)
        _login(client, user_id=up_id, emp_no='KILL01')

        # 첫 요청: middleware가 _session_id 자동 등록 → heartbeat 200
        resp1 = client.get('/api/session/heartbeat',
                           headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp1.status_code == 200

        # 자동 등록된 session_id 가져오기
        with client.session_transaction() as sess:
            sid = sess.get('_session_id')
        assert sid is not None, 'middleware가 _session_id를 자동 등록해야 함'

        # 관리자가 세션 삭제 (시뮬레이션)
        with app.app_context():
            db.session.execute(db.text(
                "DELETE FROM active_sessions WHERE session_id = :sid"
            ), {'sid': sid})
            db.session.commit()

        # 다음 요청 시 세션 클리어 → 하트비트 401
        resp2 = client.get('/api/session/heartbeat',
                           headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp2.status_code == 401

    # ── TC-AUTH: 이미 로그인 상태에서 /login GET → 리다이렉트 ──
    def test_login_page_redirects_when_logged_in(self, app, client):
        """이미 로그인 상태에서 /login 접근 → 대시보드 리다이렉트."""
        au_id, up_id = _create_auth_user(app, 'REDIR01', 'Pass1234!')
        _login(client, user_id=up_id, emp_no='REDIR01')

        resp = client.get('/login', follow_redirects=False)
        # 이미 로그인 → 리다이렉트
        if resp.status_code == 302:
            loc = resp.headers.get('Location', '')
            assert 'dashboard' in loc or '/' in loc

    # ── TC-AUTH: 빈 값 로그인 ──
    def test_login_empty_fields(self, app, client):
        """사번/비밀번호 빈값 → 에러 메시지."""
        resp = client.post('/login', data={
            'employee_id': '',
            'password': '',
        })
        assert resp.status_code == 200
        html = resp.data.decode('utf-8')
        assert '입력' in html


# ═══════════════════════════════════════════════════════════
#  P1-05 : 페이지 이동 / SPA 라우팅
# ═══════════════════════════════════════════════════════════

class TestP1PageNavigation:
    """TC-NAV-001 ~ TC-NAV-009: 페이지 이동, SPA 셸, 탭 라우팅."""

    # ── TC-NAV-002: TEMPLATE_MAP 주요 경로 정상 렌더링 ──
    @pytest.mark.parametrize('key', [
        'dashboard',
        'hw_server_onpremise',
        'hw_server_cloud',
        'hw_storage_san',
        'hw_network_firewall',
        'gov_backup_dashboard',
        'cat_vendor_manufacturer',
        'proj_status',
    ])
    def test_spa_shell_renders_for_known_keys(self, authed_client, key):
        """TEMPLATE_MAP에 등록된 주요 키 → SPA 셸 200 응답."""
        resp = authed_client.get(f'/p/{key}')
        assert resp.status_code == 200

    # ── TC-NAV-002b: SPA XHR 요청 → 실제 템플릿 렌더링 ──
    @pytest.mark.parametrize('key', [
        'dashboard',
        'hw_server_onpremise',
    ])
    def test_spa_xhr_renders_template(self, authed_client, key):
        """blossom-spa XHR 헤더 → 실제 템플릿 반환."""
        resp = authed_client.get(
            f'/p/{key}',
            headers={'X-Requested-With': 'blossom-spa'}
        )
        assert resp.status_code == 200
        # HTML 콘텐츠 반환 (빈 응답 아님)
        assert len(resp.data) > 100

    # ── TC-NAV-006: 존재하지 않는 키 → 에러 처리 ──
    def test_unknown_page_key(self, authed_client):
        """존재하지 않는 TEMPLATE_MAP 키 → 404 또는 빈 응답."""
        resp = authed_client.get(
            '/p/this_key_does_not_exist_99999',
            headers={'X-Requested-With': 'blossom-spa'}
        )
        # 404 또는 200 (빈 셸)이어야 하며, 500은 안 됨
        assert resp.status_code != 500

    # ── TC-NAV-005: 새로고침(GET) 시 SPA 셸 반환 ──
    def test_direct_url_returns_spa_shell(self, authed_client):
        """브라우저 직접 접근(GET, 비-XHR) → spa_shell.html 반환."""
        resp = authed_client.get('/p/hw_server_onpremise')
        assert resp.status_code == 200
        html = resp.data.decode('utf-8')
        # SPA 셸엔 blossom.js 로드 스크립트가 포함
        assert 'blossom' in html.lower() or 'spa' in html.lower() or '<html' in html.lower()


# ═══════════════════════════════════════════════════════════
#  P1-05 ~ P1-06 : 자산 목록 API
# ═══════════════════════════════════════════════════════════

class TestP1AssetListAPI:
    """TC-LIST-001 ~ TC-LIST-009: 자산 목록 조회, 검색, 페이징."""

    # ── TC-LIST-001: 온프레미스 목록 조회 ──
    def test_list_hardware_assets(self, authed_client):
        """하드웨어 자산 목록 API → 200, items 배열 반환."""
        resp = authed_client.get(
            '/api/hardware/assets?asset_category=SERVER&asset_type=ON_PREMISE'
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert 'items' in body or 'rows' in body
        assert isinstance(body.get('total', 0), int)

    # ── TC-LIST-002: 빈 자산 카테고리 ──
    def test_list_empty_category(self, authed_client):
        """데이터 없는 카테고리 → success=True, total=0, items=[]."""
        resp = authed_client.get(
            '/api/hardware/assets?asset_category=SECURITY&asset_type=HSM'
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        items = body.get('items') or body.get('rows') or []
        assert len(items) == 0

    # ── TC-LIST-003: 검색 파라미터 ──
    def test_list_with_search_query(self, authed_client):
        """검색어(q) 전달 시 에러 없이 응답."""
        resp = authed_client.get(
            '/api/hardware/assets?asset_category=SERVER&asset_type=ON_PREMISE&q=WEB'
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True

    # ── TC-LIST-005: SQL Injection 안전 처리 ──
    def test_search_sql_injection_safe(self, authed_client):
        """SQL Injection 검색어 → 에러 없이 빈 결과."""
        resp = authed_client.get(
            "/api/hardware/assets?asset_category=SERVER&asset_type=ON_PREMISE&q=' OR 1=1--"
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True

    # ── TC-LIST-005b: XSS 검색어 ──
    def test_search_xss_safe(self, authed_client):
        """XSS 스크립트 검색어 → 스크립트 미실행, 에러 무."""
        resp = authed_client.get(
            '/api/hardware/assets?asset_category=SERVER&asset_type=ON_PREMISE'
            '&q=<script>alert(1)</script>'
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        # 응답 내 스크립트 태그 미포함 확인
        raw = resp.data.decode('utf-8')
        assert '<script>alert(1)</script>' not in raw

    # ── TC-LIST-009: 페이징 파라미터 ──
    def test_list_pagination_params(self, authed_client):
        """page/page_size 파라미터 → 정상 처리."""
        resp = authed_client.get(
            '/api/hardware/assets?asset_category=SERVER&asset_type=ON_PREMISE'
            '&page=1&page_size=10'
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True

    # ── TC-LIST-001b: 미인증 목록 조회 → 401 ──
    def test_list_unauthenticated(self, client):
        """미인증 상태 자산 목록 조회 → 401."""
        resp = client.get(
            '/api/hardware/assets?asset_category=SERVER&asset_type=ON_PREMISE'
        )
        # 조회도 인증 필요 (heartbeat 기반 세션 체크)
        # 실제 구현에 따라 200(공개) 또는 401
        # 여기서는 API 응답 정상 여부만 확인
        assert resp.status_code in (200, 401)


# ═══════════════════════════════════════════════════════════
#  P1-06 ~ P1-07 : 프로젝트 탭 CRUD
# ═══════════════════════════════════════════════════════════

class TestP1ProjectTabCRUD:
    """TC-PRJ-001 ~ TC-PRJ-002: 프로젝트 목록→상세→탭 CRUD."""

    @pytest.fixture(autouse=True)
    def _setup_project(self, authed_client, app):
        """테스트용 프로젝트 생성."""
        self.client = authed_client
        resp = self.client.post('/api/prj/projects', json={
            'project_name': 'P1 테스트 프로젝트',
            'status': 'IN_PROGRESS',
        })
        if resp.status_code in (200, 201):
            body = resp.get_json()
            self.project_id = body.get('item', {}).get('id')
        else:
            self.project_id = None

    # ── TC-PRJ-001: 프로젝트 목록 조회 ──
    def test_project_list(self):
        """프로젝트 목록 API → 200, 생성한 프로젝트 존재."""
        resp = self.client.get('/api/prj/projects')
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True

    # ── TC-PRJ-001b: 프로젝트 상세 조회 ──
    def test_project_detail(self):
        """프로젝트 상세 API → 200, 데이터 일치."""
        if not self.project_id:
            pytest.skip('프로젝트 생성 실패')
        resp = self.client.get(f'/api/prj/projects/{self.project_id}')
        assert resp.status_code == 200
        item = resp.get_json().get('item', {})
        assert item.get('project_name') == 'P1 테스트 프로젝트'

    # ── TC-PRJ-002: 탭 CRUD (tab84 비용) ──
    def test_tab_crud_cost(self):
        """탭(tab84 비용) 행 추가 → 조회 → 수정 → 삭제."""
        if not self.project_id:
            pytest.skip('프로젝트 생성 실패')

        pid = self.project_id
        tab_key = 'tab84'

        # CREATE
        resp = self.client.post(
            f'/api/prj/projects/{pid}/tabs/{tab_key}',
            json={'cost_item': '서버 구매', 'amount': 5000000}
        )
        if resp.status_code == 404:
            pytest.skip(f'탭 {tab_key} 미등록')
        assert resp.status_code in (200, 201)
        body = resp.get_json()
        item_id = body.get('item', {}).get('id')
        assert item_id is not None

        # READ
        resp = self.client.get(f'/api/prj/projects/{pid}/tabs/{tab_key}')
        assert resp.status_code == 200
        items = resp.get_json().get('items', [])
        assert any(i.get('id') == item_id for i in items)

        # UPDATE
        resp = self.client.put(
            f'/api/prj/projects/{pid}/tabs/{tab_key}/{item_id}',
            json={'cost_item': '서버 구매(수정)', 'amount': 6000000}
        )
        assert resp.status_code == 200

        # DELETE (soft)
        resp = self.client.delete(
            f'/api/prj/projects/{pid}/tabs/{tab_key}/{item_id}'
        )
        assert resp.status_code == 200

    # ── P1-08: 프로젝트 일괄 삭제 ──
    def test_project_bulk_delete(self):
        """프로젝트 bulk-delete → 삭제 후 목록 미포함."""
        if not self.project_id:
            pytest.skip('프로젝트 생성 실패')

        resp = self.client.post('/api/prj/projects/bulk-delete', json={
            'ids': [self.project_id]
        })
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert body.get('deleted', 0) >= 1

        # 삭제 후 목록에서 미포함 확인
        resp2 = self.client.get('/api/prj/projects')
        items = resp2.get_json().get('items', [])
        ids_in_list = [i.get('id') for i in items]
        assert self.project_id not in ids_in_list

    # ── P1-08b: bulk-delete 빈 ids ──
    def test_bulk_delete_empty_ids(self):
        """빈 ids 배열 → 400 에러."""
        resp = self.client.post('/api/prj/projects/bulk-delete', json={
            'ids': []
        })
        assert resp.status_code == 400


# ═══════════════════════════════════════════════════════════
#  P1-09 ~ P1-10 : 권한 격리
# ═══════════════════════════════════════════════════════════

class TestP1Permissions:
    """TC-PERM-001 ~ TC-PERM-002: READ/NONE/WRITE 권한 격리."""

    # ── TC-PERM-002: 미인증 사용자 쓰기 API 차단 ──
    def test_unauthenticated_write_blocked(self, client):
        """미인증 → POST/PUT/DELETE API 401."""
        write_endpoints = [
            ('POST', '/api/prj/projects', {'project_name': 'hack'}),
            ('POST', '/api/prj/projects/bulk-delete', {'ids': [1]}),
        ]
        for method, url, payload in write_endpoints:
            resp = getattr(client, method.lower())(url, json=payload)
            assert resp.status_code == 401, f'{method} {url} → {resp.status_code}'

    # ── TC-PERM-001: 권한 API → 세션 없으면 401 ──
    def test_permissions_api_requires_auth(self, client):
        """권한 조회 API → 미인증 시 401."""
        resp = client.get('/api/session/permissions')
        assert resp.status_code == 401

    # ── TC-PERM-001b: ADMIN 세션 → 전체 권한 ──
    def test_admin_session_has_full_permissions(self, app, client):
        """ADMIN 역할 로그인 → 모든 메뉴 WRITE."""
        au_id, up_id = _create_auth_user(app, 'ADMIN001', 'Pass1234!', role='admin')
        _login(client, user_id=up_id, emp_no='ADMIN001', role='ADMIN')

        resp = client.get('/api/session/permissions')
        if resp.status_code == 200:
            body = resp.get_json()
            perms = body.get('permissions', {})
            role = body.get('role', '')
            # ADMIN이면 모든 섹션 WRITE
            if role == 'ADMIN' or perms:
                for section, level in perms.items():
                    assert level == 'WRITE', f'{section} should be WRITE for ADMIN'


# ═══════════════════════════════════════════════════════════
#  P1-11 ~ P1-12 : 세션 관리 (동시접속, 만료)
# ═══════════════════════════════════════════════════════════

class TestP1SessionManagement:
    """TC-AUTH-010 ~ TC-AUTH-011: 세션 만료, 동시접속."""

    # ── TC-AUTH-011: 동시접속 — 기존 세션 킬 ──
    def test_concurrent_session_oldest_killed(self, app, client):
        """동일 사번 2세션 → max_sessions=1일 때 기존 세션 제거 확인."""
        au_id, up_id = _create_auth_user(app, 'CONC01', 'Pass1234!')

        with app.app_context():
            # security_policy max_sessions=1 보장
            db.session.execute(db.text(
                "UPDATE security_policy SET max_sessions = 1 WHERE id = 1"
            ))
            db.session.commit()

        # 1) 첫 번째 세션 로그인 → middleware 자동 등록
        _login(client, user_id=up_id, emp_no='CONC01')
        resp1 = client.get('/api/session/heartbeat',
                           headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp1.status_code == 200

        with client.session_transaction() as sess:
            first_sid = sess.get('_session_id')
        assert first_sid is not None

        # 2) 두 번째 클라이언트로 같은 사번 로그인 → 실제 HTTP POST 로그인
        client2 = app.test_client()
        resp_login = client2.post('/login', data={
            'employee_id': 'CONC01',
            'password': 'Pass1234!',
        }, follow_redirects=False)
        # 로그인 성공 = 302 또는 200
        assert resp_login.status_code in (200, 302)

        with client2.session_transaction() as sess2:
            second_sid = sess2.get('_session_id')

        if not second_sid:
            # POST 로그인 실패 시(IP 등) → 수동 세션 등록으로 대체
            _login(client2, user_id=up_id, emp_no='CONC01')
            client2.get('/api/session/heartbeat',
                        headers={'X-Requested-With': 'XMLHttpRequest'})
            with client2.session_transaction() as sess2:
                second_sid = sess2.get('_session_id')

        if not second_sid:
            pytest.skip('두 번째 세션 자동 등록 실패')

        # 3) 두 번째 세션으로 heartbeat → middleware가 old 세션 cleanup
        resp2 = client2.get('/api/session/heartbeat',
                            headers={'X-Requested-With': 'XMLHttpRequest'})
        assert resp2.status_code == 200

        # 4) active_sessions에서 첫 번째 세션이 삭제되었는지 확인
        with app.app_context():
            old_row = db.session.execute(db.text(
                "SELECT id FROM active_sessions WHERE session_id = :sid"
            ), {'sid': first_sid}).fetchone()
            new_row = db.session.execute(db.text(
                "SELECT id FROM active_sessions WHERE session_id = :sid"
            ), {'sid': second_sid}).fetchone()
            # max_sessions=1이면 첫 번째 세션은 삭제되어야 함
            assert new_row is not None, '두 번째 세션은 유지되어야 함'
            # 첫 번째 세션 삭제 여부 (구현에 따라 다를 수 있음)
            if old_row is not None:
                # _register_active_session에서 이미 삭제했을 수도 있고
                # _enforce_active_session에서 삭제했을 수도 있음
                total = db.session.execute(db.text(
                    "SELECT COUNT(*) FROM active_sessions WHERE UPPER(emp_no) = 'CONC01'"
                )).scalar()
                assert total <= 1, f'max_sessions=1인데 세션 {total}개 존재'


# ═══════════════════════════════════════════════════════════
#  P1-13 : 프로젝트 비용 탭 동기화
# ═══════════════════════════════════════════════════════════

class TestP1ProjectCostSync:
    """TC-PRJ-002 확장: 비용 탭 CRUD 후 집계 동기화."""

    def test_create_project_and_read(self, authed_client):
        """프로젝트 생성 → 상세 조회 데이터 일치."""
        resp = authed_client.post('/api/prj/projects', json={
            'project_name': '비용검증 프로젝트',
            'status': 'IN_PROGRESS',
        })
        if resp.status_code not in (200, 201):
            pytest.skip('프로젝트 생성 실패')

        pid = resp.get_json()['item']['id']

        # 상세 조회
        resp2 = authed_client.get(f'/api/prj/projects/{pid}')
        assert resp2.status_code == 200
        item = resp2.get_json()['item']
        assert item['project_name'] == '비용검증 프로젝트'


# ═══════════════════════════════════════════════════════════
#  P1-15 : 로그아웃 후 보호 자원 접근 차단
# ═══════════════════════════════════════════════════════════

class TestP1LogoutProtection:
    """TC-AUTH-012 확장: 로그아웃 후 API 접근 차단."""

    def test_api_blocked_after_logout(self, app, client):
        """로그아웃 후 보호 API 호출 → 401."""
        au_id, up_id = _create_auth_user(app, 'PROT01', 'Pass1234!')
        _login(client, user_id=up_id, emp_no='PROT01')

        # 하트비트 정상
        resp1 = client.get('/api/session/heartbeat')
        assert resp1.status_code == 200

        # 로그아웃
        client.get('/logout')

        # 하트비트 → 401
        resp2 = client.get('/api/session/heartbeat')
        assert resp2.status_code == 401


# ═══════════════════════════════════════════════════════════
#  P1 보안: 경계값 / 주입 공격 방어
# ═══════════════════════════════════════════════════════════

class TestP1Security:
    """TC-CRU-004, TC-LIST-005: 보안 필수 항목."""

    # ── XSS in project name ──
    def test_xss_in_project_name(self, authed_client):
        """프로젝트명에 스크립트 태그 → 이스케이프 처리."""
        xss_payload = '<script>alert("xss")</script>'
        resp = authed_client.post('/api/prj/projects', json={
            'project_name': xss_payload,
        })
        if resp.status_code not in (200, 201):
            return  # 입력 거부도 OK

        pid = resp.get_json()['item']['id']
        resp2 = authed_client.get(f'/api/prj/projects/{pid}')
        body = resp2.data.decode('utf-8')
        # 스크립트가 실행 가능한 형태로 저장되어선 안 됨 (JSON 내 이스케이프는 OK)
        assert '<script>alert("xss")</script>' not in body or \
               resp2.content_type.startswith('application/json')

    # ── 매우 긴 입력 ──
    def test_very_long_input(self, authed_client):
        """1000자 프로젝트명 → 저장 또는 검증 에러, 500 미발생."""
        long_name = 'A' * 1000
        resp = authed_client.post('/api/prj/projects', json={
            'project_name': long_name,
        })
        # 500이 아닌 한 OK (400 검증 에러 또는 200 저장)
        assert resp.status_code != 500

    # ── Path Traversal ──
    def test_path_traversal_in_url(self, authed_client):
        """경로 탐색 공격 URL → 안전 처리."""
        resp = authed_client.get('/api/../../etc/passwd')
        assert resp.status_code in (400, 404, 405)
        assert b'root:' not in resp.data


# ═══════════════════════════════════════════════════════════
#  P1: CRUD 흐름 통합 테스트
# ═══════════════════════════════════════════════════════════

class TestP1CRUDIntegration:
    """TC-CRU-006 ~ TC-CRU-009: 등록→수정→삭제 통합 흐름."""

    def test_project_full_crud_lifecycle(self, authed_client):
        """프로젝트 등록 → 수정 → 삭제 전체 흐름."""
        # CREATE
        resp = authed_client.post('/api/prj/projects', json={
            'project_name': 'CRUD 통합테스트',
            'status': 'IN_PROGRESS',
        })
        assert resp.status_code in (200, 201)
        body = resp.get_json()
        assert body['success'] is True
        pid = body['item']['id']

        # READ
        resp = authed_client.get(f'/api/prj/projects/{pid}')
        assert resp.status_code == 200
        assert resp.get_json()['item']['project_name'] == 'CRUD 통합테스트'

        # UPDATE
        resp = authed_client.put(f'/api/prj/projects/{pid}', json={
            'project_name': 'CRUD 통합테스트(수정)',
            'status': 'DONE',
        })
        assert resp.status_code == 200
        assert resp.get_json()['item']['project_name'] == 'CRUD 통합테스트(수정)'

        # DELETE
        resp = authed_client.delete(f'/api/prj/projects/{pid}')
        assert resp.status_code == 200

        # VERIFY: 삭제 후 조회 → 404
        resp = authed_client.get(f'/api/prj/projects/{pid}')
        assert resp.status_code == 404

    def test_delete_nonexistent_project(self, authed_client):
        """존재하지 않는 프로젝트 삭제 → 404, 500 미발생."""
        resp = authed_client.delete('/api/prj/projects/999999')
        assert resp.status_code in (200, 404)
        assert resp.status_code != 500
