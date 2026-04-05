"""Diagnostic: verify prj_tab_cost API persists to instance DB.

Runs a Flask test_client request with a seeded session user_profile_id.
This avoids needing a browser login while still exercising the HTTP handlers.

Usage:
  .venv/Scripts/python.exe scripts/diag_prj_tab_cost_http.py

Optional:
  --project-id <id>   Use existing project id (default: create/choose first)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import sqlalchemy as sa

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import create_app, db
from app.models import OrgDepartment, PrjProject, PrjTabCost, UserProfile


def _pick_user() -> UserProfile:
    user = UserProfile.query.order_by(UserProfile.id.asc()).first()
    if not user:
        raise RuntimeError('No org_user/UserProfile rows found; cannot seed session')
    return user


def _pick_dept() -> OrgDepartment:
    dept = OrgDepartment.query.order_by(OrgDepartment.id.asc()).first()
    if not dept:
        raise RuntimeError('No org_department rows found; cannot create prj_project')
    return dept


def _ensure_project(*, project_id: int | None) -> PrjProject:
    if project_id:
        p = PrjProject.query.get(int(project_id))
        if not p:
            raise RuntimeError(f'Project not found: {project_id}')
        return p

    p = PrjProject.query.filter(PrjProject.is_deleted == 0).order_by(PrjProject.id.asc()).first()
    if p:
        return p

    user = _pick_user()
    dept = _pick_dept()
    p = PrjProject(
        project_name='DIAG TAB74 COST',
        project_type='DIAG',
        owner_dept_id=dept.id,
        manager_user_id=user.id,
        status='완료',
        budget_amount=123_000,
        created_by_user_id=user.id,
    )
    db.session.add(p)
    db.session.commit()
    return p


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--project-id', type=int, default=None)
    args = ap.parse_args()

    app = create_app()
    with app.app_context():
        insp = sa.inspect(db.engine)
        for tbl in ('prj_project', 'prj_tab_cost'):
            if not insp.has_table(tbl):
                raise RuntimeError(f'Missing table {tbl}; run flask db upgrade')

        user = _pick_user()
        project = _ensure_project(project_id=args.project_id)

        with app.test_client() as client:
            with client.session_transaction() as sess:
                # API expects one of these to exist; user_profile_id is the cleanest.
                sess['user_profile_id'] = user.id

            eva_key = 'WBS-1 | Activity-A | Task-A | Owner-A'
            payload = {
                'payload': {
                    'eva_map': {
                        eva_key: {'pv': 1000, 'ev': 400, 'ac': 250},
                    }
                }
            }

            url = f'/api/prj/projects/{project.id}/tabs/cost'
            r = client.post(url, data=json.dumps(payload), content_type='application/json')
            print('POST', url, '->', r.status_code)
            try:
                data = r.get_json()
            except Exception:
                data = None
            print('POST json:', json.dumps(data, ensure_ascii=False, indent=2) if data else r.data[:500])
            if not data or not data.get('success'):
                raise RuntimeError('POST failed')

            r2 = client.get(url)
            print('GET', url, '->', r2.status_code)
            data2 = r2.get_json()
            print('GET json:', json.dumps(data2, ensure_ascii=False, indent=2) if data2 else r2.data[:500])
            if not data2 or not data2.get('success'):
                raise RuntimeError('GET failed')

        # Verify DB row exists
        rows = (
            PrjTabCost.query.filter(PrjTabCost.project_id == project.id, PrjTabCost.is_deleted == 0)
            .order_by(PrjTabCost.id.asc())
            .all()
        )
        print('DB prj_tab_cost rows:', len(rows))
        if not rows:
            raise RuntimeError('No prj_tab_cost rows found after POST')

        try:
            last_payload = json.loads(rows[-1].payload_json)
        except Exception:
            last_payload = None
        print('DB latest payload keys:', list((last_payload or {}).keys()) if isinstance(last_payload, dict) else None)
        if not (isinstance(last_payload, dict) and 'eva_map' in last_payload):
            raise RuntimeError('DB payload missing eva_map')

        print('OK: prj_tab_cost API persisted to DB (project_id=%s, user_profile_id=%s)' % (project.id, user.id))
        return 0


if __name__ == '__main__':
    raise SystemExit(main())
