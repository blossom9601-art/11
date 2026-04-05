"""Smoke check for Task Management (작업관리) work report flow.

Validates that the work report API endpoints are reachable and the core workflow
(REVIEW -> APPROVED -> COMPLETED -> ARCHIVED) works end-to-end using a Flask
test client with a seeded/available UserProfile.

Exit code:
- 0: success
- 1: failure
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def main() -> int:
    try:
        from app import create_app, db
        from app.models import UserProfile
    except Exception as exc:  # pragma: no cover
        print("FAIL: import error:", exc)
        return 1

    app = create_app()
    app.testing = True

    with app.app_context():
        # Resolve an actor profile for session-based auth.
        profile = UserProfile.query.order_by(UserProfile.id.asc()).first()
        if not profile:
            print("FAIL: no UserProfile rows found; seed users first.")
            return 1

        client = app.test_client()
        with client.session_transaction() as sess:
            sess["user_profile_id"] = int(profile.id)

        def ok(resp):
            return resp.status_code, (resp.get_json(silent=True) or {})

        # 1) List endpoint reachable
        st, js = ok(client.get("/api/wrk/reports?view=my&limit=5"))
        assert st == 200, ("list status", st, js)
        assert js.get("success") is True, ("list json", js)

        # 2) Create a report
        payload = {
            "task_title": "[SMOKE] 작업관리 워크플로우",
            "project": "[SMOKE]",
            "start_dt": None,
            "end_dt": None,
            "targets": "[SMOKE]",
            "business": "[SMOKE]",
            "draft_dept": "[SMOKE]",
            "worker": "[SMOKE]",
            "participants": "[SMOKE]",
            "vendor": "[SMOKE]",
            "overview": "[SMOKE]",
            "service": "[SMOKE]",
            "report_result": "",
            # keep payload_json small but present
            "payload_json": json.dumps({"_smoke": True}, ensure_ascii=False),
            "classifications": "서버",
            "worktypes": "점검",
        }
        st, js = ok(client.post("/api/wrk/reports", json=payload))
        assert st in (200, 201), ("create status", st, js)
        assert js.get("success") is True and js.get("item"), ("create json", js)
        report_id = js["item"]["id"]
        print("created report_id=", report_id)

        # 3) Read detail
        st, js = ok(client.get(f"/api/wrk/reports/{report_id}"))
        assert st == 200 and js.get("success") is True, ("detail", st, js)

        # 4) Init approve (REVIEW -> APPROVED or auto-transition)
        st, js = ok(client.post(f"/api/wrk/reports/{report_id}/approve-init", json={"memo": "smoke"}))
        assert st == 200 and js.get("success") is True, ("approve-init", st, js)
        status_after_init = (js.get("item") or {}).get("status")
        print("status after approve-init=", status_after_init)
        assert status_after_init in ("APPROVED", "SCHEDULED", "IN_PROGRESS"), status_after_init

        # 5) Submit result (-> COMPLETED)
        st, js = ok(
            client.post(
                f"/api/wrk/reports/{report_id}/submit-result",
                json={"report_result": "[SMOKE] 결과제출"},
            )
        )
        assert st == 200 and js.get("success") is True, ("submit-result", st, js)
        status_after_result = (js.get("item") or {}).get("status")
        print("status after submit-result=", status_after_result)
        assert status_after_result == "COMPLETED", status_after_result

        # 6) Final approve (COMPLETED -> ARCHIVED)
        st, js = ok(client.post(f"/api/wrk/reports/{report_id}/approve-final", json={"memo": "smoke"}))
        assert st == 200 and js.get("success") is True, ("approve-final", st, js)
        status_after_final = (js.get("item") or {}).get("status")
        print("status after approve-final=", status_after_final)
        assert status_after_final == "ARCHIVED", status_after_final

        # 7) Archived item should be discoverable via list filter
        st, js = ok(client.get("/api/wrk/reports?view=my&status=ARCHIVED&limit=50"))
        assert st == 200 and js.get("success") is True, ("list archived", st, js)
        ids = {it.get("id") for it in (js.get("items") or [])}
        assert report_id in ids, ("archived id missing", report_id, list(ids)[:10])

        print("OK: task management smoke check passed")
        return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print("FAIL:", exc)
        raise SystemExit(1)
