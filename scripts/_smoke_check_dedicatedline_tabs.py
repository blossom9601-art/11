"""Smoke check: Dedicated-line policy tab separation.

Validates that the 5 dedicated-line UI tabs are data-isolated by `line_group`.

This script talks to the Flask app via the Flask test client (no running server needed):
- Creates a temporary actor user in `org_user`.
- Creates 1 leased line per group (MEMBER/CUSTOMER/VAN/PARTNER/INHOUSE).
- Confirms each group's list contains only its own created IDs.
- Bulk-deletes the created rows.

Exit code:
- 0 on success
- 1 on failure
"""

from __future__ import annotations

import sys
import uuid
from pathlib import Path
from typing import Dict, List

# Ensure repo root is on sys.path when running as a script (so `import app` works)
REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app import create_app
from app.models import db, UserProfile


GROUPS: List[str] = ["MEMBER", "CUSTOMER", "VAN", "PARTNER", "INHOUSE"]


def _json(client, method: str, url: str, payload=None):
    kwargs = {}
    if payload is not None:
        kwargs["json"] = payload
    resp = client.open(url, method=method, **kwargs)
    try:
        data = resp.get_json(silent=True)
    except Exception:
        data = None
    return resp.status_code, data


def main() -> int:
    app = create_app()
    app.testing = True

    with app.app_context():
        # Ensure we have an actor in org_user (required by API).
        unique = uuid.uuid4().hex[:10]
        emp_no = f"SMOKE_LEASED_{unique}"
        actor = UserProfile(emp_no=emp_no, name="Smoke Actor")
        db.session.add(actor)
        db.session.commit()
        actor_id = int(actor.id)

        created_ids_by_group: Dict[str, int] = {}

        with app.test_client() as client:
            # Create one row per group
            for group in GROUPS:
                line_no = f"SMOKE-{group}-{uuid.uuid4().hex[:8]}"
                payload = {
                    "line_group": group,
                    "org_name": f"Smoke Org ({group})",
                    "status_code": "운용",
                    "line_no": line_no,
                    "created_by_user_id": actor_id,
                }
                status, data = _json(client, "POST", "/api/network/leased-lines", payload)
                if status != 201 or not data or not data.get("success"):
                    raise RuntimeError(
                        f"POST create failed for {group}: status={status}, data={data}"
                    )
                item = data.get("item") or {}
                created_id = int(item.get("id"))
                created_ids_by_group[group] = created_id

            # Verify each group list contains its own ID and not others
            for group, own_id in created_ids_by_group.items():
                status, data = _json(
                    client,
                    "GET",
                    f"/api/network/leased-lines?line_group={group}",
                )
                if status != 200 or not data or not data.get("success"):
                    raise RuntimeError(
                        f"GET list failed for {group}: status={status}, data={data}"
                    )
                items = data.get("items") or []
                ids = {int(x.get("id")) for x in items if x and x.get("id") is not None}
                if own_id not in ids:
                    raise RuntimeError(
                        f"Isolation check failed: own id missing in group {group}. own_id={own_id}, ids_sample={sorted(list(ids))[:10]}"
                    )
                for other_group, other_id in created_ids_by_group.items():
                    if other_group == group:
                        continue
                    if other_id in ids:
                        raise RuntimeError(
                            f"Isolation check failed: group {group} list contains other group's id. other_group={other_group}, other_id={other_id}"
                        )

            # Bulk-delete all created rows
            all_ids = list(created_ids_by_group.values())
            status, data = _json(
                client,
                "POST",
                "/api/network/leased-lines/bulk-delete",
                {"ids": all_ids, "actor_user_id": actor_id},
            )
            if status != 200 or not data or not data.get("success"):
                raise RuntimeError(
                    f"POST bulk-delete failed: status={status}, data={data}"
                )

            # Spot-check: each deleted row should 404 on GET /<id>
            for group, line_id in created_ids_by_group.items():
                status, data = _json(client, "GET", f"/api/network/leased-lines/{line_id}")
                if status != 404:
                    raise RuntimeError(
                        f"Expected 404 after delete for {group} id={line_id}, got status={status}, data={data}"
                    )

        # Cleanup actor row as well
        db.session.delete(actor)
        db.session.commit()

        print("OK: dedicated-line tab isolation smoke check passed")
        print("Created+deleted IDs:", created_ids_by_group)
        return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print("FAIL:", e)
        return_code = 1
        try:
            # Best-effort rollback
            db.session.rollback()
        except Exception:
            pass
        raise SystemExit(return_code)
