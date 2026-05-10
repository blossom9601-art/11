"""Lumina 서버 계정 작업(Job) — SQLite 저장, Agent heartbeat로 전달, 결과 보고."""

from __future__ import annotations

import json
import logging
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from itsdangerous import BadSignature, URLSafeSerializer
from flask import current_app

from app.services.agent_cli_service import _init_conn, _now

logger = logging.getLogger(__name__)

PROTO_VERSION = 1

VALID_ACTIONS = frozenset({
    "CREATE_USER",
    "DELETE_USER",
    "LOCK_USER",
    "UNLOCK_USER",
    "CHANGE_PASSWORD",
    "EXPIRE_PASSWORD",
    "ADD_GROUP_MEMBER",
    "REMOVE_GROUP_MEMBER",
    "CHANGE_LOGIN_SHELL",
    "CHANGE_HOME_DIR",
})

USERNAME_RE = re.compile(r"^[a-z_][a-z0-9_-]{0,31}$")
_PW_SALT = "lumina-account-job-pw-v1"


_KST = timezone(timedelta(hours=9))


def _serialize(app) -> URLSafeSerializer:
    sk = app.config.get("SECRET_KEY") or "dev"
    if isinstance(sk, bytes):
        sk = sk.decode("utf-8", errors="replace")
    else:
        sk = str(sk)
    return URLSafeSerializer(sk, salt=_PW_SALT)


def ensure_account_job_tables(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS lumina_account_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id TEXT NOT NULL UNIQUE,
            agent_pending_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            target_username TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            password_secret TEXT,
            status TEXT NOT NULL,
            nonce TEXT NOT NULL UNIQUE,
            requested_by TEXT,
            requested_at TEXT,
            approved_by TEXT,
            approved_at TEXT,
            expires_at TEXT NOT NULL,
            result_json TEXT,
            exit_code INTEGER,
            error_code TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_lumina_acct_jobs_agent_status
        ON lumina_account_jobs(agent_pending_id, status)
    """
    )
    conn.commit()


def _expire_stale(conn) -> None:
    n = _now()
    conn.execute(
        """
        UPDATE lumina_account_jobs
        SET status = 'EXPIRED', updated_at = ?, error_code = 'expired'
        WHERE expires_at < ?
          AND status IN ('PENDING_APPROVAL', 'APPROVED')
    """,
        (n, n),
    )


def create_account_job(
    agent_id: int,
    action: str,
    target_username: str,
    payload: Optional[Dict[str, Any]] = None,
    password: Optional[str] = None,
    requested_by: str = "",
    ttl_minutes: int = 60,
    app=None,
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """작업 생성 (PENDING_APPROVAL). 성공 시 (True, '', item)."""
    if action not in VALID_ACTIONS:
        return False, "unsupported_action", None
    u = (target_username or "").strip()
    if not USERNAME_RE.match(u):
        return False, "invalid_username_format", None
    pl = dict(payload or {})
    app = app or current_app
    if action == "CHANGE_PASSWORD":
        p = password or pl.get("password")
        if not p or not isinstance(p, str):
            return False, "password_required", None
        pl = {k: v for k, v in pl.items() if k != "password"}
        try:
            pw_sec = _serialize(app).dumps({"p": p})
        except Exception as e:
            logger.exception("password seal failed: %s", e)
            return False, "internal_error", None
    else:
        pw_sec = None
        pl.pop("password", None)

    conn = _init_conn(app)
    try:
        ensure_account_job_tables(conn)
        row = conn.execute(
            "SELECT id, hostname FROM agent_pending WHERE id = ?",
            (agent_id,),
        ).fetchone()
        if not row:
            return False, "agent_not_found", None

        rid = uuid.uuid4().hex
        nonce = secrets.token_hex(16)
        ts = _now()
        exp = (datetime.now(_KST) + timedelta(minutes=max(5, min(ttl_minutes, 24 * 60)))).strftime(
            "%Y-%m-%d %H:%M:%S"
        )

        conn.execute(
            """
            INSERT INTO lumina_account_jobs (
                request_id, agent_pending_id, action, target_username,
                payload_json, password_secret, status, nonce,
                requested_by, requested_at, expires_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING_APPROVAL', ?, ?, ?, ?, ?, ?)
        """,
            (
                rid,
                agent_id,
                action,
                u,
                json.dumps(pl, ensure_ascii=False),
                pw_sec,
                nonce,
                requested_by or "",
                ts,
                exp,
                ts,
                ts,
            ),
        )
        conn.commit()
        item = {
            "request_id": rid,
            "agent_id": agent_id,
            "hostname": row["hostname"],
            "action": action,
            "target_username": u,
            "status": "PENDING_APPROVAL",
            "nonce": nonce,
            "expires_at": exp,
        }
        return True, "", item
    except Exception as e:
        logger.exception("create_account_job: %s", e)
        conn.rollback()
        return False, "database_error", None
    finally:
        conn.close()


def approve_account_job(request_id: str, approved_by: str, app=None) -> Tuple[bool, str]:
    app = app or current_app
    conn = _init_conn(app)
    try:
        ensure_account_job_tables(conn)
        _expire_stale(conn)
        row = conn.execute(
            "SELECT id, status FROM lumina_account_jobs WHERE request_id = ?",
            (request_id,),
        ).fetchone()
        if not row:
            return False, "not_found"
        if row["status"] != "PENDING_APPROVAL":
            return False, "invalid_status"
        ts = _now()
        conn.execute(
            """
            UPDATE lumina_account_jobs
            SET status = 'APPROVED', approved_by = ?, approved_at = ?, updated_at = ?
            WHERE request_id = ?
        """,
            (approved_by, ts, ts, request_id),
        )
        conn.commit()
        return True, ""
    finally:
        conn.close()


def reject_account_job(request_id: str, rejected_by: str, app=None) -> Tuple[bool, str]:
    app = app or current_app
    conn = _init_conn(app)
    try:
        ensure_account_job_tables(conn)
        row = conn.execute(
            "SELECT status FROM lumina_account_jobs WHERE request_id = ?",
            (request_id,),
        ).fetchone()
        if not row:
            return False, "not_found"
        if row["status"] != "PENDING_APPROVAL":
            return False, "invalid_status"
        ts = _now()
        conn.execute(
            """
            UPDATE lumina_account_jobs
            SET status = 'REJECTED', approved_by = ?, approved_at = ?, updated_at = ?,
                error_code = 'rejected'
            WHERE request_id = ?
        """,
            (rejected_by, ts, ts, request_id),
        )
        conn.commit()
        return True, ""
    finally:
        conn.close()


def get_account_jobs_snapshot_by_request_ids(request_ids: List[str], app=None) -> Dict[str, Dict[str, Any]]:
    """여러 lumina_account_jobs.request_id(= agent job requestId)에 대한 요약 맵."""
    ids = [str(x).strip() for x in (request_ids or []) if str(x).strip()]
    if not ids:
        return {}
    app = app or current_app
    conn = _init_conn(app)
    try:
        ensure_account_job_tables(conn)
        _expire_stale(conn)
        conn.commit()
        placeholders = ",".join("?" * len(ids))
        rows = conn.execute(
            f"""
            SELECT j.request_id, j.status, j.action, j.target_username, j.exit_code, j.error_code,
                   j.updated_at, j.created_at, j.expires_at, j.result_json,
                   a.hostname AS hostname, a.id AS agent_pending_id
            FROM lumina_account_jobs j
            LEFT JOIN agent_pending a ON a.id = j.agent_pending_id
            WHERE j.request_id IN ({placeholders})
            """,
            ids,
        ).fetchall()
        out: Dict[str, Dict[str, Any]] = {}
        for r in rows:
            rid = str(r["request_id"] or "").strip()
            if not rid:
                continue
            rj_raw = r["result_json"]
            rj = {}
            try:
                rj = json.loads(rj_raw or "{}")
            except Exception:
                rj = {}
            tail = ""
            if isinstance(rj, dict):
                tail = (rj.get("stderrTail") or rj.get("stdoutTail") or "") or ""
                if isinstance(tail, str) and len(tail) > 240:
                    tail = tail[:240] + "…"
            out[rid] = {
                "requestId": rid,
                "status": r["status"],
                "action": r["action"],
                "targetUsername": r["target_username"],
                "hostname": r["hostname"] or "",
                "agentPendingId": r["agent_pending_id"],
                "exitCode": r["exit_code"],
                "errorCode": r["error_code"],
                "updatedAt": r["updated_at"],
                "createdAt": r["created_at"],
                "expiresAt": r["expires_at"],
                "resultOk": rj.get("ok") if isinstance(rj, dict) else None,
                "resultTail": tail,
            }
        return out
    finally:
        conn.close()


def list_account_jobs(agent_id: Optional[int] = None, limit: int = 50, app=None) -> List[Dict[str, Any]]:
    app = app or current_app
    conn = _init_conn(app)
    try:
        ensure_account_job_tables(conn)
        _expire_stale(conn)
        conn.commit()
        if agent_id:
            rows = conn.execute(
                """
                SELECT j.*, a.hostname AS hostname
                FROM lumina_account_jobs j
                JOIN agent_pending a ON a.id = j.agent_pending_id
                WHERE j.agent_pending_id = ?
                ORDER BY j.id DESC
                LIMIT ?
            """,
                (agent_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT j.*, a.hostname AS hostname
                FROM lumina_account_jobs j
                JOIN agent_pending a ON a.id = j.agent_pending_id
                ORDER BY j.id DESC
                LIMIT ?
            """,
                (limit,),
            ).fetchall()
        out = []
        for r in rows:
            out.append({
                "id": r["id"],
                "request_id": r["request_id"],
                "agent_pending_id": r["agent_pending_id"],
                "hostname": r["hostname"],
                "action": r["action"],
                "target_username": r["target_username"],
                "status": r["status"],
                "nonce": r["nonce"],
                "expires_at": r["expires_at"],
                "requested_by": r["requested_by"],
                "approved_by": r["approved_by"],
                "exit_code": r["exit_code"],
                "error_code": r["error_code"],
            })
        return out
    finally:
        conn.close()


def claim_account_jobs_for_hostname(hostname: str, limit: int = 3, app=None) -> List[Dict[str, Any]]:
    """APPROVED 작업을 DELIVERED로 바꾸고 Worker용 봉투 목록 반환 (비밀번호 복원)."""
    app = app or current_app
    hn = (hostname or "").strip()
    if not hn:
        return []
    conn = _init_conn(app)
    try:
        ensure_account_job_tables(conn)
        _expire_stale(conn)
        rows = conn.execute(
            """
            SELECT j.* FROM lumina_account_jobs j
            JOIN agent_pending a ON a.id = j.agent_pending_id
            WHERE LOWER(a.hostname) = LOWER(?)
              AND j.status = 'APPROVED'
            ORDER BY j.id ASC
            LIMIT ?
        """,
            (hn, limit),
        ).fetchall()
        envelopes = []
        ts = _now()
        ser = _serialize(app)
        for r in rows:
            pl = json.loads(r["payload_json"] or "{}")
            if r["password_secret"]:
                try:
                    data = ser.loads(r["password_secret"])
                    p = data.get("p")
                    if p:
                        pl = dict(pl)
                        pl["password"] = p
                except BadSignature:
                    logger.warning("bad password secret for job %s", r["request_id"])
            env = {
                "protoVersion": PROTO_VERSION,
                "requestId": r["request_id"],
                "nonce": r["nonce"],
                "action": r["action"],
                "targetUsername": r["target_username"],
                "payload": pl,
            }
            envelopes.append(env)
            conn.execute(
                """
                UPDATE lumina_account_jobs
                SET status = 'DELIVERED', updated_at = ?
                WHERE id = ?
            """,
                (ts, r["id"]),
            )
        conn.commit()
        return envelopes
    finally:
        conn.close()


def complete_account_job(
    request_id: str,
    hostname: str,
    result: Dict[str, Any],
    app=None,
) -> Tuple[bool, str]:
    """Agent가 Worker 실행 후 결과 보고."""
    app = app or current_app
    hn = (hostname or "").strip()
    conn = _init_conn(app)
    try:
        ensure_account_job_tables(conn)
        row = conn.execute(
            """
            SELECT j.id, j.status, a.hostname AS hostname
            FROM lumina_account_jobs j
            JOIN agent_pending a ON a.id = j.agent_pending_id
            WHERE j.request_id = ?
        """,
            (request_id,),
        ).fetchone()
        if not row:
            return False, "not_found"
        if row["hostname"].lower() != hn.lower():
            return False, "hostname_mismatch"
        st = row["status"]
        if st in ("SUCCEEDED", "FAILED"):
            return True, ""
        if st not in ("DELIVERED", "APPROVED"):
            return False, "invalid_status"

        ok = bool(result.get("ok"))
        status = "SUCCEEDED" if ok else "FAILED"
        safe = {k: result.get(k) for k in (
            "protoVersion", "requestId", "ok", "errorCode", "exitCode",
            "stdoutTail", "stderrTail", "beforeState", "afterState",
            "workerVersion",
        )}
        ts = _now()
        conn.execute(
            """
            UPDATE lumina_account_jobs
            SET status = ?, result_json = ?, exit_code = ?, error_code = ?,
                password_secret = NULL, updated_at = ?
            WHERE request_id = ?
        """,
            (
                status,
                json.dumps(safe, ensure_ascii=False),
                result.get("exitCode"),
                result.get("errorCode"),
                ts,
                request_id,
            ),
        )
        conn.commit()
        return True, ""
    except Exception as e:
        logger.exception("complete_account_job: %s", e)
        return False, "database_error"
    finally:
        conn.close()
