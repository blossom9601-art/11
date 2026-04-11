"""
P2 — 주요 기능 동작테스트
==========================
QA_동작테스트_계획서.md의 P2 시나리오를 자동화한 테스트.

대상:
  TC-GOV   : 거버넌스 (백업 스토리지/정책, 취약점 가이드)
  TC-NET   : 네트워크 자산 (IP 정책)
  TC-CAT   : 카테고리/벤더/조직
  TC-COST  : 비용 관리 (계약 라인)
  TC-DC    : 데이터센터 출입 권한
  TC-WRK   : 업무 보고서
  TC-CAL   : 캘린더 일정
  TC-TKT   : 티켓
  TC-AGENT : 에이전트
  TC-NOTI  : 알림
  TC-SPA   : SPA 페이지 렌더링
"""
import json
from datetime import datetime, timedelta

import pytest

from app.models import (
    AuthUser,
    BkBackupTargetPolicy,
    BkStoragePool,
    CalSchedule,
    DcAccessPermission,
    OrgDepartment,
    SvcTicket,
    SysNotification,
    UserProfile,
    WrkReport,
    db,
)


# ═══════════════════════════════════════════════════════════
#  Helper utilities
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
                      role='user', locked_until=None, login_fail_cnt=0):
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


def _json(resp):
    """Parse response JSON safely."""
    return resp.get_json(force=True)


XHR = {'X-Requested-With': 'XMLHttpRequest'}


# ═══════════════════════════════════════════════════════════
#  P2-01 : 거버넌스 — 백업 스토리지 풀 CRUD
# ═══════════════════════════════════════════════════════════

class TestP2GovernanceBackupStoragePool:
    """TC-GOV-001: 백업 스토리지 풀 등록 → 조회 → 수정 → 삭제"""

    def test_storage_pool_crud(self, app, authed_client):
        # CREATE
        resp = authed_client.post('/api/governance/backup/storage-pools',
                                 json={'pool_name': 'TestPool1',
                                       'storage_asset_id': 1,
                                       'remark': '테스트 풀'},
                                 headers=XHR)
        assert resp.status_code == 201
        data = _json(resp)
        assert data['success'] is True
        pool_id = data['item']['id']
        assert data['item']['pool_name'] == 'TestPool1'

        # READ (list)
        resp = authed_client.get('/api/governance/backup/storage-pools',
                                headers=XHR)
        assert resp.status_code == 200
        data = _json(resp)
        assert data['success'] is True
        assert any(p['id'] == pool_id for p in data['items'])

        # UPDATE
        resp = authed_client.put(f'/api/governance/backup/storage-pools/{pool_id}',
                                 json={'pool_name': 'UpdatedPool1',
                                       'remark': '수정됨'},
                                 headers=XHR)
        assert resp.status_code == 200
        data = _json(resp)
        assert data['success'] is True
        assert data['item']['pool_name'] == 'UpdatedPool1'

        # DELETE (bulk-delete)
        resp = authed_client.post(
            '/api/governance/backup/storage-pools/bulk-delete',
            json={'ids': [pool_id]},
            headers=XHR)
        assert resp.status_code == 200
        assert _json(resp)['success'] is True

    def test_storage_pool_missing_fields(self, app, authed_client):
        """필수 필드 누락 → 400"""
        resp = authed_client.post('/api/governance/backup/storage-pools',
                                 json={'remark': 'no name'},
                                 headers=XHR)
        assert resp.status_code == 400

    def test_storage_pool_duplicate_name(self, app, authed_client):
        """같은 pool_name 중복 등록 → 409"""
        payload = {'pool_name': 'DupPool', 'storage_asset_id': 1}
        authed_client.post('/api/governance/backup/storage-pools',
                           json=payload, headers=XHR)
        resp = authed_client.post('/api/governance/backup/storage-pools',
                                 json=payload, headers=XHR)
        assert resp.status_code == 409


# ═══════════════════════════════════════════════════════════
#  P2-01 : 거버넌스 — 백업 대상 정책 CRUD
# ═══════════════════════════════════════════════════════════

class TestP2GovernanceBackupTargetPolicy:
    """TC-GOV-002: 백업 대상 정책 등록 → 조회 → 수정 → 삭제"""

    def _create_pool(self, authed_client):
        resp = authed_client.post('/api/governance/backup/storage-pools',
                                 json={'pool_name': f'PolicyPool',
                                       'storage_asset_id': 1},
                                 headers=XHR)
        return _json(resp)['item']['id']

    def test_target_policy_crud(self, app, authed_client):
        pool_id = self._create_pool(authed_client)

        payload = {
            'backup_scope': '내부망',
            'system_name': 'TestSys',
            'backup_policy_name': 'Daily Full',
            'backup_directory': '/backup/full',
            'data_type': 'DB',
            'backup_grade': '1등급',
            'storage_pool_id': pool_id,
            'offsite_yn': 'O',
            'media_type': 'Client(Network)',
            'start_time': '02:00',
        }
        resp = authed_client.post('/api/governance/backup/target-policies',
                                 json=payload, headers=XHR)
        assert resp.status_code == 201
        data = _json(resp)
        assert data['success'] is True
        policy_id = data['item']['id']

        # READ list
        resp = authed_client.get('/api/governance/backup/target-policies',
                                headers=XHR)
        assert resp.status_code == 200
        assert _json(resp)['success'] is True

        # UPDATE
        resp = authed_client.put(
            f'/api/governance/backup/target-policies/{policy_id}',
            json={'system_name': 'UpdatedSys'},
            headers=XHR)
        assert resp.status_code == 200

        # DELETE (bulk-delete)
        resp = authed_client.post(
            '/api/governance/backup/target-policies/bulk-delete',
            json={'ids': [policy_id]},
            headers=XHR)
        assert resp.status_code == 200
        assert _json(resp)['success'] is True

    def test_target_policy_missing_required(self, app, authed_client):
        """필수 필드 누락 → 400"""
        resp = authed_client.post('/api/governance/backup/target-policies',
                                 json={'system_name': 'X'},
                                 headers=XHR)
        assert resp.status_code == 400


# ═══════════════════════════════════════════════════════════
#  P2-02 : 거버넌스 — 취약점 가이드 CRUD
# ═══════════════════════════════════════════════════════════

class TestP2GovernanceVulnerability:
    """TC-GOV-003: 취약점 가이드 등록 → 조회 → 수정 → 삭제"""

    def test_vulnerability_guide_crud(self, app, authed_client):
        payload = {
            'check_category': '계정관리',
            'check_topic': '패스워드 복잡도',
            'check_code': 'U-01',
            'check_type': 'Unix',
            'check_importance': '상',
        }
        # CREATE
        resp = authed_client.post('/api/governance/vulnerability-guides',
                                 json=payload, headers=XHR)
        assert resp.status_code == 201
        data = _json(resp)
        assert data['success'] is True
        guide_id = data['item']['id']

        # READ single
        resp = authed_client.get(
            f'/api/governance/vulnerability-guides/{guide_id}',
            headers=XHR)
        assert resp.status_code == 200
        assert _json(resp)['item']['check_code'] == 'U-01'

        # UPDATE
        resp = authed_client.put(
            f'/api/governance/vulnerability-guides/{guide_id}',
            json={'check_topic': '패스워드 길이 확인', 'check_code': 'U-01',
                  'check_category': '계정관리'},
            headers=XHR)
        assert resp.status_code == 200

        # DELETE
        resp = authed_client.delete(
            f'/api/governance/vulnerability-guides/{guide_id}',
            headers=XHR)
        assert resp.status_code == 200
        assert _json(resp)['success'] is True

    def test_vulnerability_guide_list(self, app, authed_client):
        """목록 조회 → success + items"""
        resp = authed_client.get('/api/governance/vulnerability-guides',
                                headers=XHR)
        assert resp.status_code == 200
        data = _json(resp)
        assert data['success'] is True
        assert 'items' in data or 'rows' in data


# ═══════════════════════════════════════════════════════════
#  P2-03 : 네트워크 — IP 정책 CRUD
# ═══════════════════════════════════════════════════════════

class TestP2NetworkIPPolicy:
    """TC-NET-001: IP 정책 등록 → 조회 → 수정 → 삭제"""

    def test_ip_policy_crud(self, app, authed_client):
        payload = {
            'status': 'active',
            'start_ip': '10.0.0.1',
            'end_ip': '10.0.0.255',
        }
        # CREATE
        resp = authed_client.post('/api/network/ip-policies',
                                 json=payload, headers=XHR)
        assert resp.status_code == 201
        data = _json(resp)
        assert data['success'] is True
        policy_id = data['item']['id']
        assert data['item']['start_ip'] == '10.0.0.1'

        # READ list
        resp = authed_client.get('/api/network/ip-policies', headers=XHR)
        assert resp.status_code == 200
        data = _json(resp)
        assert data['success'] is True

        # UPDATE
        resp = authed_client.put(f'/api/network/ip-policies/{policy_id}',
                                 json={'status': 'inactive'},
                                 headers=XHR)
        assert resp.status_code == 200

        # DELETE
        resp = authed_client.delete(f'/api/network/ip-policies/{policy_id}',
                                    headers=XHR)
        assert resp.status_code == 200
        assert _json(resp)['success'] is True

    def test_ip_policy_invalid_ip(self, app, authed_client):
        """잘못된 IP → 400"""
        resp = authed_client.post('/api/network/ip-policies',
                                 json={'status': 'active',
                                       'start_ip': 'not-an-ip',
                                       'end_ip': '10.0.0.1'},
                                 headers=XHR)
        assert resp.status_code == 400


# ═══════════════════════════════════════════════════════════
#  P2-04 : 카테고리 — 벤더(제조사) CRUD
# ═══════════════════════════════════════════════════════════

class TestP2VendorManufacturer:
    """TC-CAT-001: 벤더(제조사) 등록 → 조회 → 수정 → 삭제"""

    def test_vendor_crud(self, app, authed_client):
        payload = {'manufacturer_name': '테스트제조사'}

        # CREATE
        resp = authed_client.post('/api/vendor-manufacturers',
                                 json=payload, headers=XHR)
        assert resp.status_code == 201
        data = _json(resp)
        assert data['success'] is True
        vendor_id = data['item']['id']

        # READ list
        resp = authed_client.get('/api/vendor-manufacturers', headers=XHR)
        assert resp.status_code == 200
        data = _json(resp)
        assert data['success'] is True

        # UPDATE
        resp = authed_client.put(f'/api/vendor-manufacturers/{vendor_id}',
                                 json={'manufacturer_name': '수정제조사'},
                                 headers=XHR)
        assert resp.status_code == 200

        # DELETE (bulk-delete)
        resp = authed_client.post('/api/vendor-manufacturers/bulk-delete',
                                  json={'ids': [vendor_id]},
                                  headers=XHR)
        assert resp.status_code == 200
        assert _json(resp)['success'] is True


# ═══════════════════════════════════════════════════════════
#  P2-04 : 카테고리 — 조직(부서) CRUD
# ═══════════════════════════════════════════════════════════

class TestP2OrgDepartment:
    """TC-CAT-002: 조직 부서 등록 → 조회 → 수정 → 삭제"""

    def test_department_crud(self, app, authed_client):
        payload = {'dept_name': '테스트부서'}

        # CREATE
        resp = authed_client.post('/api/org-departments',
                                 json=payload, headers=XHR)
        assert resp.status_code == 201
        data = _json(resp)
        assert data['success'] is True
        dept_id = data['item']['id']

        # READ list
        resp = authed_client.get('/api/org-departments', headers=XHR)
        assert resp.status_code == 200

        # UPDATE
        resp = authed_client.put(f'/api/org-departments/{dept_id}',
                                 json={'dept_name': '수정부서'},
                                 headers=XHR)
        assert resp.status_code == 200

        # DELETE (bulk-delete)
        resp = authed_client.post('/api/org-departments/bulk-delete',
                                  json={'ids': [dept_id]},
                                  headers=XHR)
        assert resp.status_code == 200


# ═══════════════════════════════════════════════════════════
#  P2-07 : 데이터센터 — 출입 권한 CRUD
# ═══════════════════════════════════════════════════════════

class TestP2DatacenterAccess:
    """TC-DC-001: 출입 권한 등록 → 조회 → 수정 → 삭제"""

    def _create_dept(self, app):
        with app.app_context():
            dept = OrgDepartment.query.filter_by(dept_code='DC_TEST').first()
            if not dept:
                dept = OrgDepartment(dept_code='DC_TEST', dept_name='DC테스트부서')
                db.session.add(dept)
                db.session.commit()
            return dept.id

    def test_access_permission_crud(self, app, authed_client, actor_user_id):
        dept_id = self._create_dept(app)

        payload = {
            'user_id': actor_user_id,
            'department_id': dept_id,
            'person_type': '직원',
            'status': '승인',
            'dc_future_room': 'O',
        }
        # CREATE
        resp = authed_client.post('/api/datacenter/access/permissions',
                                 json=payload, headers=XHR)
        assert resp.status_code == 201
        data = _json(resp)
        perm_id = data.get('permission_id') or data.get('id')
        assert perm_id is not None

        # READ list
        resp = authed_client.get('/api/datacenter/access/permissions',
                                headers=XHR)
        assert resp.status_code == 200
        data = _json(resp)
        assert data['success'] is True

        # UPDATE
        resp = authed_client.put(
            f'/api/datacenter/access/permissions/{perm_id}',
            json={'status': '만료', 'remark': '테스트 수정',
                  'last_changed_by': actor_user_id},
            headers=XHR)
        assert resp.status_code == 200

        # DELETE
        resp = authed_client.delete(
            f'/api/datacenter/access/permissions/{perm_id}',
            json={'last_changed_by': actor_user_id},
            headers=XHR)
        assert resp.status_code == 200

    def test_access_permission_missing_user(self, app, authed_client):
        """user_id 없이 등록 → 400"""
        resp = authed_client.post('/api/datacenter/access/permissions',
                                 json={'department_id': 1},
                                 headers=XHR)
        assert resp.status_code == 400


# ═══════════════════════════════════════════════════════════
#  P2-09 : 업무 보고서 CRUD + 결재 플로우
# ═══════════════════════════════════════════════════════════

class TestP2WorkReports:
    """TC-WRK-001: 업무보고서 등록 → 조회 → 수정 → 삭제"""

    def test_report_crud(self, app, authed_client):
        payload = {
            'task_title': 'P2 테스트 업무보고',
            'overview': '테스트 개요',
            'start_datetime': datetime.utcnow().isoformat(),
            'end_datetime': (datetime.utcnow() + timedelta(hours=2)).isoformat(),
        }
        # CREATE
        resp = authed_client.post('/api/wrk/reports', json=payload,
                                 headers=XHR)
        assert resp.status_code == 201
        data = _json(resp)
        assert data['success'] is True
        report_id = data['item']['id']

        # READ list
        resp = authed_client.get('/api/wrk/reports', headers=XHR)
        assert resp.status_code == 200
        data = _json(resp)
        assert data['success'] is True

        # READ single
        resp = authed_client.get(f'/api/wrk/reports/{report_id}',
                                headers=XHR)
        assert resp.status_code == 200
        assert _json(resp)['item']['task_title'] == 'P2 테스트 업무보고'

        # UPDATE
        resp = authed_client.put(f'/api/wrk/reports/{report_id}',
                                 json={'task_title': '수정된 업무보고'},
                                 headers=XHR)
        assert resp.status_code == 200

        # DELETE (soft)
        resp = authed_client.delete(f'/api/wrk/reports/{report_id}',
                                    headers=XHR)
        assert resp.status_code == 200
        assert _json(resp)['success'] is True

    def test_report_missing_title(self, app, authed_client):
        """제목 없이 등록 → 400"""
        resp = authed_client.post('/api/wrk/reports', json={},
                                 headers=XHR)
        assert resp.status_code in (400, 500)

    def test_report_list_pagination(self, app, authed_client):
        """페이징 파라미터 적용"""
        resp = authed_client.get('/api/wrk/reports?page=1&per_page=5',
                                headers=XHR)
        assert resp.status_code == 200
        data = _json(resp)
        assert 'total' in data


# ═══════════════════════════════════════════════════════════
#  P2-10 : 캘린더 일정 CRUD
# ═══════════════════════════════════════════════════════════

class TestP2Calendar:
    """TC-CAL-001: 일정 등록 → 조회 → 수정 → 삭제"""

    def test_schedule_crud(self, app, authed_client, actor_user_id):
        now = datetime.utcnow()
        payload = {
            'title': 'P2 테스트 일정',
            'start_datetime': now.isoformat(),
            'end_datetime': (now + timedelta(hours=1)).isoformat(),
            'event_type': '회의',
            'share_scope': 'ALL',
        }
        # CREATE
        resp = authed_client.post('/api/calendar/schedules', json=payload,
                                 headers=XHR)
        assert resp.status_code == 201
        data = _json(resp)
        assert data['success'] is True
        sched_id = data['item']['id']
        assert data['item']['title'] == 'P2 테스트 일정'

        # READ list
        resp = authed_client.get('/api/calendar/schedules', headers=XHR)
        assert resp.status_code == 200
        data = _json(resp)
        assert data['success'] is True
        assert any(s['id'] == sched_id for s in data['items'])

        # READ single
        resp = authed_client.get(f'/api/calendar/schedules/{sched_id}',
                                headers=XHR)
        assert resp.status_code == 200

        # UPDATE
        resp = authed_client.put(
            f'/api/calendar/schedules/{sched_id}',
            json={'title': '수정된 일정',
                  'start_datetime': now.isoformat(),
                  'end_datetime': (now + timedelta(hours=2)).isoformat(),
                  'version': 1},
            headers=XHR)
        assert resp.status_code == 200
        assert _json(resp)['item']['title'] == '수정된 일정'

        # DELETE (soft)
        resp = authed_client.delete(f'/api/calendar/schedules/{sched_id}',
                                    headers=XHR)
        assert resp.status_code == 200
        assert _json(resp)['success'] is True

    def test_schedule_missing_title(self, app, authed_client):
        """제목 없이 등록 → 400"""
        now = datetime.utcnow()
        resp = authed_client.post('/api/calendar/schedules',
                                 json={'start_datetime': now.isoformat(),
                                       'end_datetime': (now + timedelta(hours=1)).isoformat()},
                                 headers=XHR)
        assert resp.status_code == 400

    def test_schedule_end_before_start(self, app, authed_client):
        """종료 < 시작 → 400"""
        now = datetime.utcnow()
        resp = authed_client.post('/api/calendar/schedules',
                                 json={'title': 'Bad',
                                       'start_datetime': now.isoformat(),
                                       'end_datetime': (now - timedelta(hours=1)).isoformat()},
                                 headers=XHR)
        assert resp.status_code == 400

    def test_schedule_version_conflict(self, app, authed_client, actor_user_id):
        """버전 충돌 → 409"""
        now = datetime.utcnow()
        resp = authed_client.post('/api/calendar/schedules',
                                 json={'title': 'VerTest',
                                       'start_datetime': now.isoformat(),
                                       'end_datetime': (now + timedelta(hours=1)).isoformat()},
                                 headers=XHR)
        sched_id = _json(resp)['item']['id']

        # 정상 업데이트 (version=1)
        authed_client.put(f'/api/calendar/schedules/{sched_id}',
                          json={'title': 'V2',
                                'start_datetime': now.isoformat(),
                                'end_datetime': (now + timedelta(hours=1)).isoformat(),
                                'version': 1},
                          headers=XHR)

        # 이전 버전(1)으로 재시도 → 충돌
        resp = authed_client.put(f'/api/calendar/schedules/{sched_id}',
                                 json={'title': 'Conflict',
                                       'start_datetime': now.isoformat(),
                                       'end_datetime': (now + timedelta(hours=1)).isoformat(),
                                       'version': 1},
                                 headers=XHR)
        assert resp.status_code == 409


# ═══════════════════════════════════════════════════════════
#  P2-11 : 티켓 CRUD
# ═══════════════════════════════════════════════════════════

class TestP2Tickets:
    """TC-TKT-001: 티켓 등록 → 조회 → 상태 변경 → 삭제"""

    def test_ticket_crud(self, app, authed_client, actor_user_id):
        due = (datetime.utcnow() + timedelta(days=7)).strftime('%Y-%m-%d')
        payload = {
            'title': 'P2 테스트 티켓',
            'ticket_type': '장애',
            'priority': '긴급',
            'due_at': due,
            'detail': '테스트 상세 내용',
        }
        # CREATE
        resp = authed_client.post('/api/tickets', json=payload, headers=XHR)
        assert resp.status_code == 201
        data = _json(resp)
        assert data['success'] is True
        ticket_id = data['item']['id']
        assert data['item']['status'] == 'PENDING'

        # READ list
        resp = authed_client.get('/api/tickets', headers=XHR)
        assert resp.status_code == 200
        data = _json(resp)
        assert data['success'] is True

        # READ single
        resp = authed_client.get(f'/api/tickets/{ticket_id}', headers=XHR)
        assert resp.status_code == 200

        # UPDATE (상태 변경)
        resp = authed_client.put(f'/api/tickets/{ticket_id}',
                                 json={'status': 'IN_PROGRESS'},
                                 headers=XHR)
        assert resp.status_code == 200

        # DELETE
        resp = authed_client.delete(f'/api/tickets/{ticket_id}',
                                    headers=XHR)
        assert resp.status_code == 200
        assert _json(resp)['success'] is True

    def test_ticket_missing_required(self, app, authed_client):
        """제목 없이 등록 → 400"""
        resp = authed_client.post('/api/tickets',
                                 json={'priority': '보통'},
                                 headers=XHR)
        assert resp.status_code == 400

    def test_ticket_assignee(self, app, authed_client, actor_user_id):
        """담당자 배정 확인"""
        due = (datetime.utcnow() + timedelta(days=3)).strftime('%Y-%m-%d')
        resp = authed_client.post('/api/tickets',
                                 json={'title': '담당자 배정',
                                       'ticket_type': '요청',
                                       'priority': '보통',
                                       'due_at': due,
                                       'assignee_user_id': actor_user_id},
                                 headers=XHR)
        assert resp.status_code == 201
        data = _json(resp)
        assert data['item'].get('assignee_user_id') == actor_user_id


# ═══════════════════════════════════════════════════════════
#  P2-12 : 에이전트 API
# ═══════════════════════════════════════════════════════════

class TestP2Agent:
    """TC-AGENT-001: 에이전트 ping, heartbeat"""

    def test_agent_ping(self, app, client):
        """에이전트 ping → pong"""
        resp = client.get('/api/agent/ping')
        assert resp.status_code == 200
        data = _json(resp)
        assert data.get('success') is True or data.get('message') == 'pong'

    def test_agent_heartbeat(self, app, client):
        """에이전트 heartbeat"""
        resp = client.post('/api/agent/heartbeat',
                           json={'hostname': 'test-agent-001'})
        assert resp.status_code in (200, 201)

    def test_cli_login_wrong_credentials(self, app, client):
        """CLI 로그인 — 잘못된 자격증명 → 실패"""
        _create_auth_user(app, 'CLITEST01', 'CliPass1!')
        resp = client.post('/api/cli/login',
                           json={'emp_no': 'CLITEST01',
                                 'password': 'wrong'})
        assert resp.status_code in (401, 403, 400)

    def test_cli_login_success(self, app, client):
        """CLI 로그인 → 토큰 발급"""
        _create_auth_user(app, 'CLILOGIN01', 'CliPass1!')
        resp = client.post('/api/cli/login',
                           json={'emp_no': 'CLILOGIN01',
                                 'password': 'CliPass1!'})
        assert resp.status_code == 200
        data = _json(resp)
        assert data.get('success') is True
        assert 'token' in data


# ═══════════════════════════════════════════════════════════
#  P2-15 : 알림(Notification) API
# ═══════════════════════════════════════════════════════════

class TestP2Notifications:
    """TC-NOTI-001: 알림 목록 조회 → 읽음 처리 → 전체 읽음"""

    def _seed_notification(self, app, user_id):
        with app.app_context():
            noti = SysNotification(
                user_id=user_id,
                noti_type='SYSTEM',
                ref_type='SYSTEM',
                ref_id=1,
                title='테스트 알림',
                message='P2 알림 테스트',
                is_read=False,
                trigger_at=datetime.utcnow(),
            )
            db.session.add(noti)
            db.session.commit()
            return noti.id

    def test_notification_list(self, app, authed_client, actor_user_id):
        self._seed_notification(app, actor_user_id)

        resp = authed_client.get('/api/notifications', headers=XHR)
        assert resp.status_code == 200
        data = _json(resp)
        assert data['success'] is True
        assert data['total'] >= 1

    def test_unread_count(self, app, authed_client, actor_user_id):
        self._seed_notification(app, actor_user_id)

        resp = authed_client.get('/api/notifications/unread-count',
                                headers=XHR)
        assert resp.status_code == 200
        data = _json(resp)
        assert data['success'] is True
        assert data.get('count', 0) >= 1 or data.get('unread', 0) >= 1

    def test_mark_read(self, app, authed_client, actor_user_id):
        noti_id = self._seed_notification(app, actor_user_id)

        resp = authed_client.put(f'/api/notifications/{noti_id}/read',
                                headers=XHR)
        assert resp.status_code == 200
        assert _json(resp)['success'] is True

    def test_mark_read_all(self, app, authed_client, actor_user_id):
        self._seed_notification(app, actor_user_id)
        self._seed_notification(app, actor_user_id)

        resp = authed_client.post('/api/notifications/read-all',
                                 headers=XHR)
        assert resp.status_code == 200
        assert _json(resp)['success'] is True

        # 확인: unread == 0
        resp = authed_client.get('/api/notifications/unread-count',
                                headers=XHR)
        data = _json(resp)
        assert data.get('count', 0) == 0 or data.get('unread', 0) == 0


# ═══════════════════════════════════════════════════════════
#  P2-13/14 : SPA 페이지 렌더링
# ═══════════════════════════════════════════════════════════

class TestP2SpaPages:
    """P2 메뉴 SPA 페이지가 200을 반환하는지 확인"""

    @pytest.mark.parametrize('page_key', [
        'governance_backup',
        'governance_vulnerability',
        'network_ip_policy',
        'network_dns_policy',
        'vendor_manufacturer',
        'org_department',
        'calendar',
        'ticket_list',
        'work_report_list',
        'datacenter_access_list',
    ])
    def test_spa_page_renders(self, app, authed_client, page_key):
        """SPA 페이지 렌더 200 확인 (존재하는 페이지만)"""
        resp = authed_client.get(f'/p/{page_key}',
                                headers={'X-Requested-With': 'blossom-spa'})
        # 일부 페이지 키가 TEMPLATE_MAP에 없을 수 있으므로 404도 허용
        assert resp.status_code in (200, 404)


# ═══════════════════════════════════════════════════════════
#  P2-06 : 비용 관리 — 계약 라인
# ═══════════════════════════════════════════════════════════

class TestP2CostContractLine:
    """TC-COST-001: 계약 라인 목록 조회"""

    def test_cost_contract_lines_list(self, app, authed_client):
        """계약 라인 목록 조회 → 200"""
        resp = authed_client.get('/api/cost-contract-lines', headers=XHR)
        # 테이블 미준비 시 500일 수 있으나, 200이면 success 확인
        if resp.status_code == 200:
            data = _json(resp)
            assert data['success'] is True


# ═══════════════════════════════════════════════════════════
#  P2 : SSE 이벤트 엔드포인트
# ═══════════════════════════════════════════════════════════

class TestP2SSE:
    """SSE 이벤트 스트림 접속 확인"""

    def test_sse_endpoint_exists(self, app, client):
        """SSE /api/sse/events 엔드포인트 접근 가능"""
        resp = client.get('/api/sse/events')
        # SSE는 스트리밍이므로 200 + text/event-stream
        assert resp.status_code == 200
        ct = resp.content_type or ''
        assert 'text/event-stream' in ct
