"""Lumina central account job API (SQLite) — heartbeat claim + result + CLI."""

from datetime import datetime

from app.models import AuthUser, UserProfile, db
from app.services.account_job_service import (
    approve_account_job,
    create_account_job,
    list_account_jobs,
)
from app.services.agent_service import _ensure_tables, _get_connection


def _seed_agent_pending(app, hostname="acct-job-host-01"):
    conn = _get_connection(app)
    _ensure_tables(conn)
    ts = "2026-04-06 10:00:00"
    conn.execute(
        """
        INSERT INTO agent_pending (
            hostname, ip_address, os_type, os_version, payload, received_at
        ) VALUES (?, ?, ?, ?, ?, ?)
    """,
        (hostname, "192.168.55.1", "Linux", "test", "{}", ts),
    )
    conn.commit()
    aid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    return int(aid)


class TestAccountJobFlow:
    def test_create_approve_heartbeat_claim_complete(self, app, client):
        hostname = "acct-job-host-01"
        with app.app_context():
            aid = _seed_agent_pending(app, hostname)
            ok, err, item = create_account_job(
                aid, "LOCK_USER", "demouser", payload={}, app=app,
            )
            assert ok is True, err
            rid = item["request_id"]
            ok2, err2 = approve_account_job(rid, "admin-tester", app=app)
            assert ok2 is True, err2

        resp = client.post("/api/agent/heartbeat", json={"hostname": hostname})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data.get("success") is True
        jobs = data.get("account_jobs") or []
        assert len(jobs) == 1
        assert jobs[0]["requestId"] == rid
        assert jobs[0]["action"] == "LOCK_USER"

        resp2 = client.post(
            "/api/agent/account-jobs/result",
            json={
                "hostname": hostname,
                "requestId": rid,
                "ok": True,
                "exitCode": 0,
                "errorCode": None,
            },
        )
        assert resp2.status_code == 200

        with app.app_context():
            rows = list_account_jobs(agent_id=aid, limit=5, app=app)
            row = next((r for r in rows if r["request_id"] == rid), None)
            assert row is not None
            assert row["status"] == "SUCCEEDED"

        resp3 = client.post("/api/agent/heartbeat", json={"hostname": hostname})
        data3 = resp3.get_json()
        assert (data3.get("account_jobs") or []) == []

    def test_create_invalid_username(self, app):
        with app.app_context():
            aid = _seed_agent_pending(app, "other-host")
            ok, err, _ = create_account_job(
                aid, "LOCK_USER", "BAD USER", payload={}, app=app,
            )
            assert ok is False
            assert err == "invalid_username_format"


def _cli_token(client, emp_no, password):
    r = client.post("/api/cli/login", json={"emp_no": emp_no, "password": password})
    assert r.status_code == 200
    return r.get_json()["token"]


def _create_cli_admin(app):
    with app.app_context():
        emp = "CLIACCTADM"
        if not AuthUser.query.filter_by(emp_no=emp).first():
            au = AuthUser(
                emp_no=emp, role="admin", status="active",
                last_terms_accepted_at=datetime.utcnow(),
            )
            au.set_password("CliAcct1!")
            db.session.add(au)
            db.session.flush()
            if not UserProfile.query.filter_by(emp_no=emp).first():
                db.session.add(UserProfile(
                    emp_no=emp, name="CLI Acct", department="IT",
                    email="%s@test.com" % emp, allowed_ip="*",
                ))
            db.session.commit()
        return emp, "CliAcct1!"


class TestAccountJobCLI:
    def test_cli_create_and_list(self, app, client):
        _create_cli_admin(app)
        hostname = "acct-cli-host-01"
        with app.app_context():
            aid = _seed_agent_pending(app, hostname)
        token = _cli_token(client, "CLIACCTADM", "CliAcct1!")
        h = {"Authorization": "Bearer %s" % token}

        r = client.post(
            "/api/cli/account-jobs",
            json={
                "agent_id": aid,
                "action": "UNLOCK_USER",
                "target_username": "demouser",
                "payload": {},
            },
            headers=h,
        )
        assert r.status_code == 200
        rid = r.get_json()["item"]["request_id"]

        r2 = client.get("/api/cli/account-jobs", headers=h)
        assert r2.status_code == 200
        rows = r2.get_json()["rows"]
        assert any(x["request_id"] == rid for x in rows)

        r3 = client.post("/api/cli/account-jobs/%s/approve" % rid, headers=h)
        assert r3.status_code == 200
