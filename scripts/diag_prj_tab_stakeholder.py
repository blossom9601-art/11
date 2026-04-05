import argparse
import os
import sys
import json
from typing import Any, Dict, Optional

import sqlalchemy as sa

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from app import create_app, db
from app.models import PrjProject, PrjTabStakeholder, UserProfile


def _safe_json_loads(text: Optional[str]) -> Any:
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Diag: prj_tab_stakeholder in dev_blossom.db")
    parser.add_argument("--project-id", type=int, default=0, help="Filter by project_id")
    parser.add_argument("--limit", type=int, default=5, help="How many recent rows to show")
    parser.add_argument(
        "--insert-sample",
        action="store_true",
        help="Insert a sample row into prj_tab_stakeholder for --project-id (for quick verification)",
    )
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        engine = db.engine
        insp = sa.inspect(engine)
        print("db:", str(engine.url))
        print("has_table prj_tab_stakeholder:", bool(insp.has_table("prj_tab_stakeholder")))

        if args.insert_sample:
            if not args.project_id:
                print("error: --insert-sample requires --project-id")
                return 2
            project = PrjProject.query.get(args.project_id)
            if not project or (project.is_deleted or 0):
                print("error: project not found or deleted:", args.project_id)
                return 2
            actor = db.session.query(UserProfile.id).order_by(UserProfile.id.asc()).first()
            actor_user_id = int(actor[0]) if actor else 0
            if not actor_user_id:
                print("error: cannot find any org_user to use as created_by_user_id")
                return 2

            sample_payload: Dict[str, Any] = {
                "stakeholder": {
                    "rows": [
                        {
                            "org": "샘플기관",
                            "dept": "샘플부서",
                            "name": "홍길동",
                            "position": "대리",
                            "role": "Stakeholder",
                            "involve": "I",
                            "remark": "scripts/diag_prj_tab_stakeholder.py",
                        }
                    ]
                }
            }
            row = PrjTabStakeholder(
                project_id=args.project_id,
                payload_json=json.dumps(sample_payload, ensure_ascii=False),
                created_by_user_id=actor_user_id,
            )
            db.session.add(row)
            db.session.commit()
            print("inserted sample row id:", row.id)

        q = PrjTabStakeholder.query
        if args.project_id:
            q = q.filter(PrjTabStakeholder.project_id == args.project_id)

        total = q.count()
        total_active = q.filter(PrjTabStakeholder.is_deleted == 0).count()
        print("rows total:", total)
        print("rows active(is_deleted=0):", total_active)

        limit = max(1, min(int(args.limit or 5), 50))
        rows = q.order_by(PrjTabStakeholder.id.desc()).limit(limit).all()
        if not rows:
            print("recent: <no rows>")
            return 0

        print(f"recent (latest {len(rows)} rows):")
        for r in rows:
            payload = _safe_json_loads(getattr(r, "payload_json", None))
            rows_payload = None
            if isinstance(payload, dict):
                sk = payload.get("stakeholder")
                if isinstance(sk, dict):
                    rows_payload = sk.get("rows")
            print(
                "  - id=",
                r.id,
                "project_id=",
                r.project_id,
                "is_deleted=",
                getattr(r, "is_deleted", None),
                "created_at=",
                getattr(r, "created_at", None),
                "updated_at=",
                getattr(r, "updated_at", None),
                "rows_len=",
                (len(rows_payload) if isinstance(rows_payload, list) else 0),
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
