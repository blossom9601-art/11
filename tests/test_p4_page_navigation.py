"""
P4 — 페이지 이동 중심 시나리오 (TC-NAV-001 ~ TC-NAV-010)
=========================================================
QA_동작테스트_계획서.md §3.2 "페이지 이동/네비게이션" 시나리오를 자동화.

서버측 검증 대상:
  TC-NAV-001/002 : TEMPLATE_MAP 전체 페이지 SPA 렌더 200
  TC-NAV-005     : 직접 URL 접근(새로고침) → spa_shell 200
  TC-NAV-006     : 존재하지 않는 페이지 키 → 404
  TC-NAV-007     : 잘못된 상세 ID → 에러 처리 (500 미발생)
  TC-NAV-009     : 자산 상세 탭 전환 → 각 탭 200

클라이언트 전용(스킵):
  TC-NAV-003     : 사이드바 3단계 접기 (CSS/JS)
  TC-NAV-004     : 브라우저 뒤로가기/앞으로가기 (popstate)
  TC-NAV-008     : 브라우저 다중 탭 (세션 쿠키)
  TC-NAV-010     : 검색조건 유지 (sessionStorage)
"""
from datetime import datetime

import pytest

from app.models import UserProfile, db
from app.routes.pages import TEMPLATE_MAP


# ═══════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════

SPA = {'X-Requested-With': 'blossom-spa'}
XHR = {'X-Requested-With': 'XMLHttpRequest'}


def _full_session(client, *, user_id, emp_no, profile_id, role='user'):
    """세션 만료 미들웨어를 통과하는 완전한 세션 구성"""
    with client.session_transaction() as sess:
        sess['user_id'] = user_id
        sess['emp_no'] = emp_no
        sess['user_profile_id'] = profile_id
        sess['role'] = role
        sess['_login_at'] = datetime.utcnow().isoformat()
        sess['_last_active'] = datetime.utcnow().isoformat()


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
            idle_minutes INTEGER NOT NULL DEFAULT 30,
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


@pytest.fixture
def nav_client(app, actor_user_id):
    """ADMIN 세션이 완전히 설정된 테스트 클라이언트 (권한 체크 우회)"""
    from app.models import AuthUser
    _ensure_raw_tables(app)
    with app.app_context():
        au = AuthUser.query.filter_by(emp_no='NAV001').first()
        if not au:
            au = AuthUser(emp_no='NAV001', role='ADMIN', status='active',
                          login_fail_cnt=0,
                          last_terms_accepted_at=datetime.utcnow())
            au.set_password('Test1234!')
            db.session.add(au)
            db.session.flush()
        auth_id = au.id

        up = UserProfile.query.filter_by(emp_no='NAV001').first()
        if not up:
            up = UserProfile(emp_no='NAV001', name='Nav Tester',
                             department='IT', allowed_ip='*')
            db.session.add(up)
            db.session.flush()
        profile_id = up.id
        db.session.commit()

    client = app.test_client()
    _full_session(client, user_id=auth_id, emp_no='NAV001',
                  profile_id=profile_id, role='ADMIN')
    return client


# ═══════════════════════════════════════════════════════════
#  TC-NAV-001/002 : TEMPLATE_MAP 전체 페이지 SPA 렌더
# ═══════════════════════════════════════════════════════════

# 목록/대시보드 페이지 (세션 컨텍스트 불필요)
# 템플릿 파일 미생성으로 제외할 키 (TEMPLATE_MAP 등록만 되고 파일 없음)
_SKIP_KEYS = {
    'maint_contract_list',  # 7.maintenance 템플릿 미생성
}

_LIST_PAGES = sorted([
    k for k in TEMPLATE_MAP
    if k not in _SKIP_KEYS
    and not any(k.endswith(s) for s in [
        '_detail', '_hw', '_sw', '_log', '_file', '_task',
        '_vulnerability', '_package', '_if', '_account',
        '_authority', '_activate', '_firewalld', '_storage',
        '_basic', '_assign', '_zone', '_rearbay', '_frontbay',
        '_manager', '_communication', '_system', '_hardware',
        '_software', '_component', '_sla', '_issue', '_contract',
        '_service', '_domain', '_ip_range', '_dns_record',
        '_vpn_policy', '_backup', '_integrity', '_scope',
        '_schedule', '_cost', '_quality', '_resource', '_risk',
        '_procurement', '_stakeholder',
    ])
    and '_detail' not in k
])

# 상세/탭 페이지 (세션 컨텍스트 필요)
_DETAIL_PAGES = sorted([
    k for k in TEMPLATE_MAP
    if k.endswith('_detail') and k not in _SKIP_KEYS
])

# 공유 탭 페이지 (log/file/task/account 등)
_TAB_SUFFIXES = ['_log', '_file', '_task', '_account', '_hw', '_if',
                 '_vulnerability', '_package']


class TestNavAllListPages:
    """TC-NAV-001/002: 전체 목록/대시보드 페이지 SPA 렌더 200"""

    @pytest.mark.parametrize('page_key', _LIST_PAGES)
    def test_spa_page_200(self, app, nav_client, page_key):
        """각 페이지 SPA 요청 → 200 (500/404 미발생)"""
        resp = nav_client.get(f'/p/{page_key}', headers=SPA)
        assert resp.status_code == 200, \
            f'/p/{page_key} returned {resp.status_code}'


class TestNavDirectAccess:
    """TC-NAV-005: 직접 URL 접근(F5 새로고침) → spa_shell 200"""

    SAMPLE_PAGES = [
        'dashboard',
        'hw_server_onpremise',
        'gov_backup_dashboard',
        'cat_vendor_manufacturer',
        'cost_opex_dashboard',
        'proj_status',
        'dc_rack_list',
        'insight_trend',
        'settings_version',
    ]

    @pytest.mark.parametrize('page_key', SAMPLE_PAGES)
    def test_direct_url_returns_spa_shell(self, app, nav_client, page_key):
        """SPA 헤더 없이 직접 접근 → spa_shell.html (200)"""
        resp = nav_client.get(f'/p/{page_key}')
        assert resp.status_code == 200
        body = resp.get_data(as_text=True)
        # spa_shell의 특징: HTML wrapper (sidebar + content area)
        assert '<html' in body.lower() or 'spa' in body.lower() or \
               'sidebar' in body.lower() or 'blossom' in body.lower()


class TestNavNotFound:
    """TC-NAV-006: 존재하지 않는 TEMPLATE_MAP 키 → 404"""

    INVALID_KEYS = [
        'nonexistent_page_xyz',
        'hw_server_does_not_exist',
        'admin_secret_panel',
        'dashboard_v2_beta',
        '../../../etc/passwd',
        'hw_server_onpremise; DROP TABLE',
    ]

    @pytest.mark.parametrize('bad_key', INVALID_KEYS)
    def test_unknown_page_404(self, app, nav_client, bad_key):
        """미등록 페이지 키 → 404, 500 미발생"""
        resp = nav_client.get(f'/p/{bad_key}', headers=SPA)
        assert resp.status_code == 404

    def test_empty_key(self, app, nav_client):
        """/p/ 빈 키 → 404 또는 리다이렉트"""
        resp = nav_client.get('/p/', headers=SPA)
        assert resp.status_code in (301, 302, 404)

    def test_404_returns_no_stacktrace(self, app, nav_client):
        """404 응답에 서버 정보 미노출"""
        resp = nav_client.get('/p/nonexistent_xyz', headers=SPA)
        body = resp.get_data(as_text=True)
        assert 'Traceback' not in body
        assert 'File "/' not in body


class TestNavInvalidDetailId:
    """TC-NAV-007: 잘못된 상세 ID로 접근 → 에러 처리"""

    def test_onpremise_detail_no_id(self, app, nav_client):
        """상세 페이지 ID 없이 접근 → 에러 없이 처리"""
        resp = nav_client.get('/p/hw_server_onpremise_detail', headers=SPA)
        # 200 (빈 상세) 또는 400/404 — 500 아님
        assert resp.status_code != 500

    def test_onpremise_detail_invalid_id(self, app, nav_client):
        """존재하지 않는 ID → 에러 없이 처리"""
        resp = nav_client.get('/p/hw_server_onpremise_detail?id=999999',
                              headers=SPA)
        assert resp.status_code != 500

    def test_cost_detail_no_id(self, app, nav_client):
        """비용 상세 페이지 ID 없이 → 에러 없이 처리"""
        resp = nav_client.get('/p/cost_opex_hardware_detail', headers=SPA)
        assert resp.status_code != 500

    def test_gov_detail_no_id(self, app, nav_client):
        """거버넌스 상세 페이지 ID 없이 → 에러 없이 처리"""
        resp = nav_client.get('/p/gov_ip_policy_detail', headers=SPA)
        assert resp.status_code != 500


class TestNavTabSwitching:
    """TC-NAV-009: 자산 상세 내부 탭 전환"""

    # 온프레미스 서버의 탭 키들
    ONPREMISE_TABS = [
        k for k in sorted(TEMPLATE_MAP)
        if k.startswith('hw_server_onpremise_') and k != 'hw_server_onpremise_detail'
    ]

    @pytest.mark.parametrize('tab_key', ONPREMISE_TABS)
    def test_onpremise_tab_loads(self, app, nav_client, tab_key):
        """온프레미스 서버 각 탭 SPA 렌더 → 200 또는 정상 에러"""
        resp = nav_client.get(f'/p/{tab_key}', headers=SPA)
        assert resp.status_code != 500, \
            f'/p/{tab_key} returned 500'

    # 프로젝트 완료 상세의 탭 키들
    PROJECT_TABS = [
        k for k in sorted(TEMPLATE_MAP)
        if k.startswith('proj_completed_') and k != 'proj_completed_detail'
    ]

    @pytest.mark.parametrize('tab_key', PROJECT_TABS)
    def test_project_tab_loads(self, app, nav_client, tab_key):
        """프로젝트 탭 SPA 렌더 → 200 또는 정상 에러"""
        resp = nav_client.get(f'/p/{tab_key}', headers=SPA)
        assert resp.status_code != 500


class TestNavDetailPages:
    """상세(detail) 페이지 키 전수 → 500 미발생"""

    @pytest.mark.parametrize('detail_key', _DETAIL_PAGES)
    def test_detail_page_no_500(self, app, nav_client, detail_key):
        """상세 페이지 접근 시 500 미발생 (200/302/404 허용)"""
        resp = nav_client.get(f'/p/{detail_key}', headers=SPA)
        assert resp.status_code != 500, \
            f'/p/{detail_key} returned 500'


class TestNavUnauthRedirect:
    """미인증 상태 페이지 접근 → /login 리다이렉트"""

    def test_unauth_dashboard_redirect(self, app, client):
        """미인증 대시보드 → 리다이렉트 또는 spa_shell (인증은 JS에서 처리)"""
        resp = client.get('/p/dashboard')
        # 미들웨어 체크: user_id 없으면 skip → spa_shell 반환 가능
        # 또는 redirect to /login
        assert resp.status_code in (200, 302)

    def test_unauth_spa_page_access(self, app, client):
        """미인증 SPA 요청 → 200(인증 후 JS 처리) 또는 401"""
        resp = client.get('/p/hw_server_onpremise', headers=SPA)
        assert resp.status_code in (200, 401, 302)

    def test_session_expired_api_returns_401(self, app):
        """세션 user_id 있지만 _login_at 없음 → 401 (세션 만료)"""
        _ensure_raw_tables(app)
        c = app.test_client()
        with c.session_transaction() as sess:
            sess['user_id'] = 999  # _login_at 없음
        resp = c.get('/p/dashboard', headers=XHR)
        assert resp.status_code in (401, 302)


class TestNavCategoryPages:
    """카테고리 전체 페이지 분류별 렌더 검증"""

    @pytest.mark.parametrize('prefix,count_min', [
        ('cat_', 5),
        ('hw_', 5),
        ('gov_', 5),
        ('dc_', 5),
        ('cost_', 5),
        ('proj_', 3),
        ('insight_', 3),
        ('settings_', 1),
    ])
    def test_category_page_count(self, prefix, count_min):
        """각 분류별 TEMPLATE_MAP 키 수 확인"""
        count = sum(1 for k in TEMPLATE_MAP if k.startswith(prefix))
        assert count >= count_min, \
            f"'{prefix}*' pages: {count} < {count_min}"


class TestNavContentType:
    """SPA/일반 요청별 응답 Content-Type 확인"""

    def test_spa_request_returns_html_fragment(self, app, nav_client):
        """SPA 요청 → HTML fragment (application/json 아님)"""
        resp = nav_client.get('/p/dashboard', headers=SPA)
        assert resp.status_code == 200
        ct = resp.content_type or ''
        assert 'text/html' in ct

    def test_direct_request_returns_full_html(self, app, nav_client):
        """직접 요청 → 전체 HTML 페이지"""
        resp = nav_client.get('/p/dashboard')
        assert resp.status_code == 200
        body = resp.get_data(as_text=True)
        assert '<!DOCTYPE html>' in body or '<html' in body.lower()

    def test_api_404_returns_json(self, app, nav_client):
        """API 404 → JSON 응답"""
        resp = nav_client.get('/api/nonexistent', headers=XHR)
        assert resp.status_code == 404
        data = resp.get_json(force=True)
        assert data.get('success') is False


class TestNavBreadcrumb:
    """페이지 렌더 시 제목/메뉴 코드 전달 확인"""

    PAGES_WITH_TITLE = [
        ('hw_server_onpremise', '서버'),
        ('gov_backup_dashboard', '백업'),
        ('cat_vendor_manufacturer', '제조사'),
    ]

    @pytest.mark.parametrize('page_key,keyword', PAGES_WITH_TITLE)
    def test_page_contains_keyword(self, app, nav_client, page_key, keyword):
        """페이지 렌더 결과에 관련 한국어 키워드 포함"""
        resp = nav_client.get(f'/p/{page_key}', headers=SPA)
        assert resp.status_code == 200
        body = resp.get_data(as_text=True)
        assert keyword in body, \
            f'/p/{page_key} 응답에 "{keyword}" 미포함'
