"""Smoke check: dedicated-line tab14 logs behave like IP logs.

Validates:
- CREATE/UPDATE/DELETE append log rows
- GET /api/network/leased-lines/<id>/logs works
- PUT /api/network/leased-lines/<id>/logs/<log_id>/reason works with session login

This uses Flask test_client (no running server needed).
"""

from __future__ import annotations

import sys
import uuid
from datetime import datetime
from pathlib import Path

# Ensure repo root is on sys.path when running as a script (so `import app` works)
REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app import create_app
from app.models import UserProfile, db


def main() -> int:
    app = create_app()

    with app.app_context():
        client = app.test_client()

        # Ensure we have a real actor row (mirrors other smoke checks).
        unique = uuid.uuid4().hex[:10]
        emp_no = f"SMOKE_LEASED_LOG_{unique}"
        actor = UserProfile(emp_no=emp_no, name="Smoke Actor")
        db.session.add(actor)
        db.session.commit()
        actor_id = int(actor.id)

        # Ensure we look "logged in" for reason-save endpoint.
        with client.session_transaction() as sess:
            sess['emp_no'] = emp_no
            sess['user_id'] = actor_id

        stamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
        line_group = 'SMOKE'
        line_no = f'SMK-{stamp}'

        # CREATE
        res = client.post(
            '/api/network/leased-lines',
            json={
                'line_group': line_group,
                'org_name': 'SmokeOrg',
                'status_code': 'ACTIVE',
                'line_no': line_no,
                'created_by': actor_id,
                'remark': 'created by smoke',
            },
        )
        assert res.status_code in (200, 201), res.get_data(as_text=True)
        body = res.get_json() or {}
        assert body.get('success') is True, body
        item = body.get('item') or {}
        line_id = int(item.get('id'))

        # UPDATE
        res = client.put(
            f'/api/network/leased-lines/{line_id}',
            json={
                'actor_user_id': actor_id,
                'remark': f'updated by smoke {stamp}',
            },
        )
        assert res.status_code == 200, res.get_data(as_text=True)
        body = res.get_json() or {}
        assert body.get('success') is True, body

        # LIST LOGS
        res = client.get(f'/api/network/leased-lines/{line_id}/logs?page=1&page_size=50')
        assert res.status_code == 200, res.get_data(as_text=True)
        logs_body = res.get_json() or {}
        assert logs_body.get('success') is True, logs_body
        logs = logs_body.get('items') or []
        assert len(logs) >= 2, logs

        # SAVE REASON (pick latest log)
        latest = logs[0] or {}
        log_id = int(latest.get('log_id'))
        reason_text = 'smoke reason'
        res = client.put(
            f'/api/network/leased-lines/{line_id}/logs/{log_id}/reason',
            json={'reason': reason_text},
        )
        assert res.status_code == 200, res.get_data(as_text=True)
        reason_body = res.get_json() or {}
        assert reason_body.get('success') is True, reason_body
        saved = (reason_body.get('item') or {}).get('reason')
        assert saved == reason_text, reason_body

        # DELETE
        res = client.delete(
            f'/api/network/leased-lines/{line_id}',
            json={'actor_user_id': actor_id},
        )
        assert res.status_code == 200, res.get_data(as_text=True)
        body = res.get_json() or {}
        assert body.get('success') is True, body

        # LIST LOGS AGAIN (should include DELETE)
        res = client.get(f'/api/network/leased-lines/{line_id}/logs?page=1&page_size=50')
        assert res.status_code == 200, res.get_data(as_text=True)
        logs_body = res.get_json() or {}
        assert logs_body.get('success') is True, logs_body
        logs = logs_body.get('items') or []
        actions = {str(r.get('action') or '').upper() for r in logs}
        assert 'CREATE' in actions and 'UPDATE' in actions and 'DELETE' in actions, actions

        print('OK: dedicated-line tab14 logs smoke check passed')
        print('line_id:', line_id)
        print('actions:', sorted(actions))
        return 0


if __name__ == '__main__':
    raise SystemExit(main())
