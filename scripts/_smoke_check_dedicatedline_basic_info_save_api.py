"""Smoke-check: Dedicated line basic info Save persists + creates log.

This simulates what the UI modal does:
- create leased line
- update leased line via PUT (actor_user_id required)
- verify /logs returns at least one log entry

Run:
  .venv/Scripts/python.exe scripts/_smoke_check_dedicatedline_basic_info_save_api.py
"""

from __future__ import annotations

import os
import sys


# When executed as a file (not a module), Python puts the script folder on sys.path,
# so we need to add the repo root to import the top-level `app` package.
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


def main() -> int:
    from app import create_app
    from app.models import UserProfile, db
    from app.services.network_leased_line_log_service import init_network_leased_line_log_table

    app = create_app("testing")

    with app.app_context():
        db.create_all()

        # Ensure log table exists in this ephemeral testing DB.
        init_network_leased_line_log_table(app)

        actor = UserProfile.query.filter_by(emp_no="ACTOR001").first()
        if not actor:
            actor = UserProfile(
                emp_no="ACTOR001",
                name="Actor Tester",
                department="IT",
                email="actor001@example.com",
            )
            db.session.add(actor)
            db.session.commit()
        actor_user_id = int(actor.id)

    client = app.test_client()
    with client.session_transaction() as sess:
        sess["emp_no"] = "ACTOR001"
        sess["user_profile_id"] = actor_user_id

    # Create a leased line
    create_payload = {
        "line_group": "G_UI",
        "org_name": "ORG-UI",
        "status_code": "ACTIVE",
        "line_no": "LL-UI-001",
        "line_name": "Before Save",
        "actor_user_id": actor_user_id,
    }
    r = client.post("/api/network/leased-lines", json=create_payload)
    assert r.status_code == 201, r.get_json()
    leased_id = r.get_json()["item"]["id"]

    # Logs initially empty
    r0 = client.get(f"/api/network/leased-lines/{leased_id}/logs?page=1&page_size=10")
    assert r0.status_code == 200, r0.get_json()
    before_total = int(r0.get_json().get("total") or 0)

    # Update (this is what the modal should do)
    update_payload = {
        "line_name": "After Save",
        "business_purpose": "Updated by smoke check",
        "actor_user_id": actor_user_id,
    }
    r1 = client.put(f"/api/network/leased-lines/{leased_id}", json=update_payload)
    assert r1.status_code == 200, r1.get_json()
    assert r1.get_json()["item"]["line_name"] == "After Save"

    # Logs should include an entry now
    r2 = client.get(f"/api/network/leased-lines/{leased_id}/logs?page=1&page_size=10")
    assert r2.status_code == 200, r2.get_json()
    data = r2.get_json()
    after_total = int(data.get("total") or 0)

    assert after_total >= before_total + 1, {
        "before_total": before_total,
        "after_total": after_total,
        "items": data.get("items"),
    }

    first = (data.get("items") or [None])[0] or {}
    print("OK  created leased line id:", leased_id)
    print("OK  logs total before:", before_total)
    print("OK  logs total after :", after_total)
    print(
        "OK  latest log summary:",
        {
            "log_id": first.get("log_id"),
            "action": first.get("action"),
            "entity": first.get("entity"),
            "tab_key": first.get("tab_key"),
            "actor": first.get("actor"),
        },
    )

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as e:
        print("FAILED:", e)
        return_code = 1
        raise SystemExit(return_code)
    except Exception as e:
        print("FAILED (unexpected):", repr(e))
        raise
