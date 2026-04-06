# -*- coding: utf-8 -*-
"""
인포메이션 문구 관리 API 통합 테스트
tests/test_info_message_api.py
"""
import pytest

from app.services.info_message_service import (
    init_info_message_table,
    seed_info_messages,
)


# ──────────────────────────────────────────────
# 픽스처
# ──────────────────────────────────────────────
@pytest.fixture
def _init_info(app):
    """info_message 테이블 초기화 + 시드."""
    with app.app_context():
        init_info_message_table(app)
        seed_info_messages(app)


@pytest.fixture
def admin_client(app, _init_info):
    """관리자 세션이 설정된 테스트 클라이언트."""
    from app.models import AuthUser, db as _db
    with app.app_context():
        user = AuthUser.query.filter_by(emp_no='ADMIN_TEST').first()
        if not user:
            user = AuthUser(emp_no='ADMIN_TEST', role='ADMIN',
                            password_hash='unused', email='admin@test.com')
            _db.session.add(user)
            _db.session.commit()
        uid = user.id
    c = app.test_client()
    with c.session_transaction() as sess:
        sess['emp_no'] = 'ADMIN_TEST'
        sess['user_id'] = uid
        sess['_login_at'] = __import__('datetime').datetime.utcnow().isoformat()
        sess['role'] = 'ADMIN'
    return c


@pytest.fixture
def normal_client(app, _init_info):
    """일반 사용자 세션이 설정된 테스트 클라이언트."""
    from app.models import AuthUser, db as _db
    with app.app_context():
        user = AuthUser.query.filter_by(emp_no='USER_TEST').first()
        if not user:
            user = AuthUser(emp_no='USER_TEST', role='user',
                            password_hash='unused', email='user@test.com')
            _db.session.add(user)
            _db.session.commit()
        uid = user.id
    c = app.test_client()
    with c.session_transaction() as sess:
        sess['emp_no'] = 'USER_TEST'
        sess['user_id'] = uid
        sess['_login_at'] = __import__('datetime').datetime.utcnow().isoformat()
        sess['role'] = 'user'
    return c


@pytest.fixture
def anon_client(app, _init_info):
    """인증 없는 클라이언트."""
    return app.test_client()


# ──────────────────────────────────────────────
# 목록 조회
# ──────────────────────────────────────────────
class TestListInfoMessages:
    def test_list_all(self, admin_client):
        r = admin_client.get('/api/info-messages')
        data = r.get_json()
        assert r.status_code == 200
        assert data['success'] is True
        assert data['total'] >= 30  # seed 데이터 30+

    def test_filter_by_main_category(self, admin_client):
        r = admin_client.get('/api/info-messages?main_category=system')
        data = r.get_json()
        assert data['success'] is True
        for item in data['items']:
            assert item['main_category_code'] == 'system'

    def test_filter_by_enabled(self, admin_client):
        r = admin_client.get('/api/info-messages?is_enabled=1')
        data = r.get_json()
        assert data['success'] is True
        for item in data['items']:
            assert item['is_enabled'] == 1

    def test_search(self, admin_client):
        r = admin_client.get('/api/info-messages?q=server')
        data = r.get_json()
        assert data['success'] is True
        assert any('server' in i['menu_key'] for i in data['items'])


# ──────────────────────────────────────────────
# 단건 조회
# ──────────────────────────────────────────────
class TestGetInfoMessage:
    def test_existing_key(self, admin_client):
        r = admin_client.get('/api/info-messages/system.server')
        data = r.get_json()
        assert data['success'] is True
        assert data['item'] is not None
        assert data['item']['menu_key'] == 'system.server'
        assert data['item']['info_title'] == '시스템 자산관리 보안'

    def test_nonexistent_key_returns_null(self, admin_client):
        r = admin_client.get('/api/info-messages/nonexistent.key')
        data = r.get_json()
        assert data['success'] is True
        assert data['item'] is None

    def test_anonymous_can_read(self, anon_client):
        r = anon_client.get('/api/info-messages/system.server')
        data = r.get_json()
        assert data['success'] is True


# ──────────────────────────────────────────────
# 수정
# ──────────────────────────────────────────────
class TestUpdateInfoMessage:
    def test_update_title_and_content(self, admin_client):
        # 먼저 ID 조회
        r = admin_client.get('/api/info-messages/system.server')
        item = r.get_json()['item']
        msg_id = item['id']

        r = admin_client.put(f'/api/info-messages/{msg_id}',
                             json={'info_title': '새 제목', 'info_content': '새 내용\n추가 줄'})
        data = r.get_json()
        assert data['success'] is True
        assert data['item']['info_title'] == '새 제목'
        assert '추가 줄' in data['item']['info_content']

    def test_update_reflects_on_read(self, admin_client):
        r = admin_client.get('/api/info-messages/system.server')
        item = r.get_json()['item']
        msg_id = item['id']

        admin_client.put(f'/api/info-messages/{msg_id}',
                         json={'info_title': '변경된 제목'})
        r2 = admin_client.get('/api/info-messages/system.server')
        assert r2.get_json()['item']['info_title'] == '변경된 제목'

    def test_normal_user_cannot_update(self, normal_client):
        # 조회는 가능
        r = normal_client.get('/api/info-messages/system.server')
        item = r.get_json()['item']
        msg_id = item['id']
        # 수정은 403
        r = normal_client.put(f'/api/info-messages/{msg_id}',
                              json={'info_title': '탈취 시도'})
        assert r.status_code == 403

    def test_anon_cannot_update(self, anon_client):
        r = anon_client.put('/api/info-messages/1',
                            json={'info_title': '탈취'})
        assert r.status_code == 401


# ──────────────────────────────────────────────
# 활성/비활성 토글
# ──────────────────────────────────────────────
class TestToggle:
    def test_disable_and_enable(self, admin_client):
        r = admin_client.get('/api/info-messages/governance.vpn_policy')
        item = r.get_json()['item']
        msg_id = item['id']

        # 비활성화
        r = admin_client.put(f'/api/info-messages/{msg_id}/toggle',
                             json={'is_enabled': 0})
        data = r.get_json()
        assert data['success'] is True
        assert data['item']['is_enabled'] == 0

        # 다시 활성화
        r = admin_client.put(f'/api/info-messages/{msg_id}/toggle',
                             json={'is_enabled': 1})
        assert r.get_json()['item']['is_enabled'] == 1

    def test_disabled_item_still_readable(self, admin_client):
        """비활성화된 문구도 API 조회는 가능 (프론트가 숨김 처리)."""
        r = admin_client.get('/api/info-messages/governance.vpn_policy')
        item = r.get_json()['item']
        msg_id = item['id']

        admin_client.put(f'/api/info-messages/{msg_id}/toggle', json={'is_enabled': 0})
        r = admin_client.get('/api/info-messages/governance.vpn_policy')
        data = r.get_json()
        assert data['item'] is not None
        assert data['item']['is_enabled'] == 0


# ──────────────────────────────────────────────
# 신규 등록
# ──────────────────────────────────────────────
class TestCreateInfoMessage:
    def test_create_new(self, admin_client):
        payload = {
            'menu_key': 'test.new_menu',
            'main_category_code': 'test',
            'main_category_name': '테스트',
            'sub_category_code': 'new_menu',
            'sub_category_name': '새 메뉴',
            'info_title': '테스트 제목',
            'info_content': '줄1\n줄2\n줄3',
            'is_enabled': 1,
            'sort_order': 999,
        }
        r = admin_client.post('/api/info-messages', json=payload)
        data = r.get_json()
        assert r.status_code == 201
        assert data['success'] is True
        assert data['item']['menu_key'] == 'test.new_menu'

        # 조회 확인
        r2 = admin_client.get('/api/info-messages/test.new_menu')
        assert r2.get_json()['item']['info_title'] == '테스트 제목'

    def test_missing_menu_key(self, admin_client):
        r = admin_client.post('/api/info-messages', json={'info_title': '제목만'})
        assert r.status_code == 400

    def test_normal_user_cannot_create(self, normal_client):
        r = normal_client.post('/api/info-messages', json={
            'menu_key': 'hack.attempt',
            'main_category_code': 'hack',
            'main_category_name': '해킹',
            'sub_category_code': 'attempt',
            'sub_category_name': '시도',
        })
        assert r.status_code == 403


# ──────────────────────────────────────────────
# 줄바꿈·멀티라인 보존
# ──────────────────────────────────────────────
class TestMultilineContent:
    def test_newlines_preserved(self, admin_client):
        r = admin_client.get('/api/info-messages/system.server')
        item = r.get_json()['item']
        msg_id = item['id']

        multiline = '첫 번째 줄\n두 번째 줄\n세 번째 줄'
        admin_client.put(f'/api/info-messages/{msg_id}',
                         json={'info_content': multiline})
        r = admin_client.get('/api/info-messages/system.server')
        content = r.get_json()['item']['info_content']
        assert content.count('\n') == 2


# ──────────────────────────────────────────────
# 확장성: 새 메뉴 추가 시 코드 변경 없이 DB만 등록
# ──────────────────────────────────────────────
class TestExtensibility:
    def test_new_menu_key_without_code_change(self, admin_client):
        """새 menu_key를 등록하면 바로 조회 가능해야 한다."""
        admin_client.post('/api/info-messages', json={
            'menu_key': 'future.new_feature',
            'main_category_code': 'future',
            'main_category_name': '미래기능',
            'sub_category_code': 'new_feature',
            'sub_category_name': '신규 기능',
            'info_title': '미래 안내',
            'info_content': '이 기능은 나중에 추가될 예정입니다.',
        })
        r = admin_client.get('/api/info-messages/future.new_feature')
        data = r.get_json()
        assert data['success'] is True
        assert data['item']['info_title'] == '미래 안내'
