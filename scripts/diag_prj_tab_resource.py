import argparse
import os
import sys
import json
from typing import Any, Dict, Optional

import sqlalchemy as sa

# Ensure project root is on sys.path (when running: python scripts/xxx.py)
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from app import create_app, db
from app.models import PrjProject, PrjTabResource, UserProfile


def _safe_json_loads(text: Optional[str]) -> Any:
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        return None


def _summarize_payload(payload: Any) -> str:
    if payload is None:
        return "<null>"
    if isinstance(payload, dict):
        keys = list(payload.keys())
        head = keys[:20]
        more = "" if len(keys) <= 20 else f" (+{len(keys) - 20} more)"
        return f"dict keys={head}{more}"
    if isinstance(payload, list):
        return f"list len={len(payload)}"
    return f"{type(payload).__name__}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Diag: prj_tab_resource in dev_blossom.db")
    parser.add_argument("--project-id", type=int, default=0, help="Filter by project_id")
    parser.add_argument("--limit", type=int, default=5, help="How many recent rows to show")
    parser.add_argument(
        "--insert-sample",
        action="store_true",
        help="Insert a sample row into prj_tab_resource for --project-id (for quick verification)",
    )
    parser.add_argument(
        "--show-payload",
        action="store_true",
        help="Print full payload JSON for each row (can be large)",
    )
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        engine = db.engine
        insp = sa.inspect(engine)
        print("db:", str(engine.url))
        print("has_table prj_tab_resource:", bool(insp.has_table("prj_tab_resource")))

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
                "raci": {
                    "1.1 | 샘플활동 | 샘플작업": {
                        "type": "샘플유형",
                        "report": "RPT-0001",
                        "A": "홍길동",
                        "C": "김철수, 이영희",
                        "I": "박민수",
                    }
                },
                "_diag": {"inserted_by": "scripts/diag_prj_tab_resource.py"},
            }
            row = PrjTabResource(
                project_id=args.project_id,
                payload_json=json.dumps(sample_payload, ensure_ascii=False),
                created_by_user_id=actor_user_id,
            )
            db.session.add(row)
            db.session.commit()
            print("inserted sample row id:", row.id)

        # Counts
        q = PrjTabResource.query
        if args.project_id:
            q = q.filter(PrjTabResource.project_id == args.project_id)

        total = q.count()
        total_active = q.filter(PrjTabResource.is_deleted == 0).count()
        print("rows total:", total)
        print("rows active(is_deleted=0):", total_active)

        # Per-project counts (top 10)
        try:
            per = (
                db.session.query(PrjTabResource.project_id, sa.func.count(PrjTabResource.id))
                .filter(PrjTabResource.is_deleted == 0)
                .group_by(PrjTabResource.project_id)
                .order_by(sa.func.count(PrjTabResource.id).desc())
                .limit(10)
                .all()
            )
            if per:
                print("top projects (active rows):")
                for pid, cnt in per:
                    print("  - project_id=", pid, "count=", cnt)
        except Exception as e:
            print("warn: per-project counts failed:", repr(e))

        # Recent rows
        limit = max(1, min(int(args.limit or 5), 50))
        rows = (
            q.order_by(PrjTabResource.id.desc())
            .limit(limit)
            .all()
        )

        if not rows:
            print("recent: <no rows>")
            return 0

        print(f"recent (latest {len(rows)} rows):")
        for r in rows:
            payload = _safe_json_loads(getattr(r, "payload_json", None))
            raci = payload.get("raci") if isinstance(payload, dict) else None
            raci_size = len(raci) if isinstance(raci, dict) else (len(raci) if isinstance(raci, list) else 0)

            print(
                "  - id=", r.id,
                "project_id=", r.project_id,
                "is_deleted=", getattr(r, "is_deleted", None),
                "created_at=", getattr(r, "created_at", None),
                "updated_at=", getattr(r, "updated_at", None),
            )
            print("    payload:", _summarize_payload(payload))
            if isinstance(payload, dict):
                print("    has payload.raci:", isinstance(raci, (dict, list)))
                if isinstance(raci, (dict, list)):
                    print("    payload.raci size:", raci_size)

            if args.show_payload:
                try:
                    print("    payload_json:")
                    print(json.dumps(payload, ensure_ascii=False, indent=2))
                except Exception:
                    print("    payload_json: <unserializable>")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
