"""identity_governance 통합 신청 확장 마이그레이션 및 미연동 승인 분기 검증."""

from __future__ import annotations

import os

import pytest

from flask import Flask

from app.services import identity_governance_service as ig


@pytest.fixture()
def ig_app(tmp_path):
    db_path = tmp_path / 'igwf.db'
    app = Flask(__name__)
    app.config['IDENTITY_GOVERNANCE_SQLITE_PATH'] = str(db_path)
    app.instance_path = str(tmp_path)
    os.makedirs(app.instance_path, exist_ok=True)
    ig.init_identity_governance_tables(app)
    yield app


def test_migrate_columns_and_manual_approve_skip_integrated(ig_app: Flask):
    admin_id, user_id = _seed_principals(ig_app)
    payload = {
        'account_name': 'svc_manual',
        'account_type': 'SERVICE',
        'target_owner_id': admin_id,
        'system_type': 'STORAGE',
        'account_id': 'adm01',
        'request_reason': '미연동 스토리지 계정',
        'integration_type': 'NON_INTEGRATED',
        'operation_type': 'ROLE_ADD',
        'manual_system_name': 'NAS-01',
        'access_method': 'WEB',
        'location_detail': 'https://nas.example/admin',
        'manual_guide': '관리자 그룹 읽기 권한 추가',
        'operator_org_user_id': user_id,
    }
    item = ig.create_request(payload, actor='tester', app=ig_app)
    rid = int(item['id'])
    assert item.get('integration_type') == 'NON_INTEGRATED'
    assert item.get('workflow_status') == ig.WORKFLOW_REQUESTED

    ig.approve_request(rid, actor='ops', app=ig_app)
    after = ig.get_request(rid, app=ig_app)
    assert after['status'] == ig.REQUEST_STATUS_PROCESSING
    assert after['workflow_status'] == ig.WORKFLOW_ASSIGNED

    with ig._get_connection(ig_app) as conn:
        n_int = conn.execute(
            f"SELECT COUNT(1) FROM {ig.INTEGRATED_TABLE} WHERE lower(account_name) = lower('svc_manual')",
        ).fetchone()[0]
    assert int(n_int or 0) == 0


def test_integrated_create_requires_agent_for_job_mapped_operation(ig_app: Flask):
    admin_id, _user_id = _seed_principals(ig_app)
    payload = {
        'account_name': 'svc_int',
        'account_type': 'SERVICE',
        'target_owner_id': admin_id,
        'system_type': 'SERVER',
        'account_id': 'testuser',
        'request_reason': '연동 작업 (에이전트 필요)',
        'integration_type': 'INTEGRATED',
        'operation_type': 'CREATE_USER',
    }
    with pytest.raises(ValueError, match='에이전트'):
        ig.create_request(payload, actor='tester', app=ig_app)


def test_integrated_bind_allow_create_without_agent(ig_app: Flask):
    admin_id, _user_id = _seed_principals(ig_app)
    payload = {
        'account_name': 'svc_bind',
        'account_type': 'SERVICE',
        'target_owner_id': admin_id,
        'system_type': 'SERVER',
        'account_id': 'testuser',
        'request_reason': '통합 매핑',
        'integration_type': 'INTEGRATED',
        'operation_type': 'INTEGRATED_ACCOUNT_BIND',
    }
    item = ig.create_request(payload, actor='tester', app=ig_app)
    assert item.get('agent_pending_id') in (None, '')


def _seed_principals(app):
    with ig._get_connection(app) as conn:
        now = ig._now()
        conn.execute(
            f'''INSERT INTO {ig.ADMIN_TABLE} (org_user_id, name, email, department, status, created_at, updated_at)
                VALUES (7001, 'Admin Seed', '', 'HQ', 'ACTIVE', ?, ?)''',
            (now, now),
        )
        aid = int(conn.execute('SELECT last_insert_rowid()').fetchone()[0])
        conn.execute(
            f'''INSERT INTO {ig.USER_TABLE} (org_user_id, name, email, department, status, created_at, updated_at)
                VALUES (9001, 'User Seed', '', 'HQ', 'ACTIVE', ?, ?)''',
            (now, now),
        )
        conn.commit()
    return aid, 9001
