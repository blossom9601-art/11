"""에이전트 업로드 API 테스트"""

import io
import json
import os
import sqlite3
from urllib.parse import urlparse

import pytest


# ── 헬퍼 ──────────────────────────────────────────────────

def _get_db_path(app):
    """conftest 와 동일한 방식으로 SQLite 경로 해석"""
    uri = app.config.get("SQLALCHEMY_DATABASE_URI", "sqlite:///dev_blossom.db")
    parsed = urlparse(uri)
    path = (parsed.path or "").lstrip("/")
    if os.path.isabs(path):
        return path
    root = os.path.abspath(os.path.join(app.root_path, os.pardir))
    return os.path.abspath(os.path.join(root, path))


def _insert_hardware_asset(app, hostname="test-server-01"):
    """테스트용 hardware_asset 레코드 직접 삽입"""
    db_path = _get_db_path(app)
    with sqlite3.connect(db_path) as conn:
        # 테이블 형태 확인 (hardware 또는 hardware_asset)
        tables = [r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()]
        table = "hardware" if "hardware" in tables else "hardware_asset"

        # 컬럼 목록 확인
        cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}

        if "is_disposed" in cols:
            conn.execute(
                f"""
                INSERT INTO {table} (
                    asset_category, asset_type, asset_code, asset_name,
                    system_name, is_deleted, is_disposed, created_at, created_by
                ) VALUES (?, ?, ?, ?, ?, 0, 0, datetime('now'), 'test')
                """,
                ("서버", "server", f"SRV-{hostname}", hostname, hostname),
            )
        else:
            conn.execute(
                f"""
                INSERT INTO {table} (
                    asset_category, asset_type, asset_code, asset_name,
                    system_name, is_deleted, created_at, created_by
                ) VALUES (?, ?, ?, ?, ?, 0, datetime('now'), 'test')
                """,
                ("서버", "server", f"SRV-{hostname}", hostname, hostname),
            )
        conn.commit()
        row = conn.execute(
            f"SELECT id FROM {table} WHERE system_name = ?", (hostname,)
        ).fetchone()
    return row[0]


def _sample_payload(hostname="test-server-01"):
    """에이전트가 생성하는 JSON 페이로드 샘플"""
    return {
        "hostname": hostname,
        "os_type": "Linux",
        "os_version": "Linux-5.15.0",
        "collected_at": "2026-04-06 10:00:00",
        "interfaces": [
            {
                "slot": "0000:03:00.0",
                "port": "",
                "iface": "eth0",
                "serial": "AA:BB:CC:DD:EE:FF",
                "ip_addresses": [
                    {
                        "category": "Primary",
                        "ip_address": "192.168.1.10",
                        "protocol": "IPv4",
                        "status": "활성",
                    }
                ],
                "remark": "",
            }
        ],
        "accounts": [
            {
                "status": "활성",
                "account_type": "관리자",
                "account_name": "root",
                "uid": 0,
                "group_name": "root",
                "gid": 0,
                "login_allowed": True,
                "admin_allowed": True,
                "purpose": "root",
                "remark": "shell=/bin/bash",
            },
            {
                "status": "활성",
                "account_type": "사용자",
                "account_name": "deploy",
                "uid": 1001,
                "group_name": "deploy",
                "gid": 1001,
                "login_allowed": True,
                "admin_allowed": False,
                "purpose": "배포 계정",
                "remark": "shell=/bin/bash",
            },
        ],
        "packages": [
            {
                "package_name": "nginx",
                "version": "1.24.0-1.el9",
                "package_type": "RPM",
                "vendor": "CentOS",
                "installed": "2026-01-15",
                "license": "BSD",
            },
            {
                "package_name": "python3",
                "version": "3.11.5",
                "package_type": "RPM",
                "vendor": "CentOS",
                "installed": "2026-01-10",
                "license": "PSF",
            },
        ],
    }


# ── 테스트 ────────────────────────────────────────────────

class TestAgentUpload:

    def test_upload_json_body(self, authed_client, app):
        """JSON body로 에이전트 데이터 업로드"""
        with app.app_context():
            asset_id = _insert_hardware_asset(app, "test-server-01")

        resp = authed_client.post(
            "/api/agent/upload",
            json=_sample_payload("test-server-01"),
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert data["asset_id"] == asset_id
        assert "interfaces" in data["results"]
        assert "accounts" in data["results"]
        assert "packages" in data["results"]

    def test_upload_file(self, authed_client, app):
        """multipart/form-data로 JSON 파일 업로드"""
        with app.app_context():
            _insert_hardware_asset(app, "test-server-02")

        payload = _sample_payload("test-server-02")
        file_data = io.BytesIO(json.dumps(payload, ensure_ascii=False).encode("utf-8"))

        resp = authed_client.post(
            "/api/agent/upload",
            data={"file": (file_data, "test-server-02.json")},
            content_type="multipart/form-data",
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True

    def test_upload_unknown_hostname(self, authed_client, app):
        """존재하지 않는 hostname은 대기열(agent_pending)에 저장"""
        resp = authed_client.post(
            "/api/agent/upload",
            json=_sample_payload("unknown-host"),
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert data.get("pending") is True

    def test_upload_no_payload(self, authed_client):
        """빈 요청은 400"""
        resp = authed_client.post("/api/agent/upload")
        assert resp.status_code == 400

    def test_upload_idempotent_accounts(self, authed_client, app):
        """같은 계정을 두 번 업로드하면 upsert (중복 미발생)"""
        with app.app_context():
            _insert_hardware_asset(app, "test-server-03")

        payload = _sample_payload("test-server-03")

        # 1차 업로드
        resp1 = authed_client.post("/api/agent/upload", json=payload)
        assert resp1.get_json()["success"] is True

        # 2차 업로드 (동일 데이터)
        resp2 = authed_client.post("/api/agent/upload", json=payload)
        data2 = resp2.get_json()
        assert data2["success"] is True
        # 계정은 update 되어야 함 (insert 아님)
        acct_stats = data2["results"]["accounts"]
        assert acct_stats["updated"] == 2
        assert acct_stats["inserted"] == 0

    def test_upload_idempotent_packages(self, authed_client, app):
        """같은 패키지를 두 번 업로드하면 upsert"""
        with app.app_context():
            _insert_hardware_asset(app, "test-server-04")

        payload = _sample_payload("test-server-04")

        authed_client.post("/api/agent/upload", json=payload)
        resp2 = authed_client.post("/api/agent/upload", json=payload)
        data2 = resp2.get_json()
        assert data2["success"] is True
        pkg_stats = data2["results"]["packages"]
        assert pkg_stats["updated"] == 2
        assert pkg_stats["inserted"] == 0

    def test_pending_list(self, authed_client, app):
        """미매칭 업로드 후 대기 목록에 표시"""
        # 미매칭 업로드
        authed_client.post("/api/agent/upload", json=_sample_payload("pending-host-01"))

        resp = authed_client.get("/api/agent/pending")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        hostnames = [r["hostname"] for r in data["rows"]]
        assert "pending-host-01" in hostnames

    def test_link_agent(self, authed_client, app):
        """대기 에이전트를 자산에 연동"""
        with app.app_context():
            _insert_hardware_asset(app, "link-target-srv")

        # 미매칭 업로드 → pending
        authed_client.post("/api/agent/upload", json=_sample_payload("unmatched-agent"))

        # pending 목록에서 ID 조회
        pending_resp = authed_client.get("/api/agent/pending")
        rows = pending_resp.get_json()["rows"]
        pid = [r for r in rows if r["hostname"] == "unmatched-agent"][0]["id"]

        # asset_id 조회
        from app.services.agent_service import _get_connection, _find_asset_by_hostname
        with app.app_context():
            with _get_connection(app) as conn:
                asset = _find_asset_by_hostname(conn, "link-target-srv")
                aid = asset["id"]

        # 연동
        link_resp = authed_client.post("/api/agent/link", json={
            "pending_id": pid,
            "asset_id": aid,
        })
        assert link_resp.status_code == 200
        link_data = link_resp.get_json()
        assert link_data["success"] is True

        # 연동 후 pending에서 사라져야 함
        pending_resp2 = authed_client.get("/api/agent/pending")
        hostnames2 = [r["hostname"] for r in pending_resp2.get_json()["rows"]]
        assert "unmatched-agent" not in hostnames2
