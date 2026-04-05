"""SQLite-backed CRUD for hw server authority (tab06-authority).

This mirrors the sqlite3-only approach used by app.services.hardware_asset_service
so that tables are created in the same dev_blossom.db that backs the hardware
assets APIs.
"""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional

from flask import current_app

from app.services import hardware_asset_service

logger = logging.getLogger(__name__)

TABLE_NAME = "hw_server_authority"

_SCHEMA_INITIALIZED = False


def _now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def _ensure_schema(conn: sqlite3.Connection) -> None:
    global _SCHEMA_INITIALIZED
    if _SCHEMA_INITIALIZED:
        return

    hardware_table = getattr(hardware_asset_service, "TABLE_NAME", "hardware")

    sql = f"""
    CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id    INTEGER NOT NULL,
        asset_type  TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'ENABLE',
        type        TEXT NOT NULL,
        target      TEXT NOT NULL,
        action      TEXT NOT NULL,
        command     TEXT,
        options     TEXT,
        expires_at  TEXT,
        remark      TEXT,
        created_at  TEXT NOT NULL,
        created_by  TEXT NOT NULL,
        updated_at  TEXT,
        updated_by  TEXT,
        is_deleted  INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (asset_id) REFERENCES {hardware_table}(id)
    );
    CREATE INDEX IF NOT EXISTS idx_hw_server_authority_asset
        ON {TABLE_NAME}(asset_type, asset_id, is_deleted);
    """

    conn.executescript(sql)

    # If the table already existed (older runtime-created schema), add missing columns.
    try:
        cols = {
            r[1]
            for r in conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall()
        }
    except Exception:
        cols = set()

    def _add_col(name: str, ddl: str) -> None:
        nonlocal cols
        if name in cols:
            return
        try:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN {name} {ddl}")
            cols.add(name)
        except Exception:
            return

    _add_col('status', "TEXT NOT NULL DEFAULT 'ENABLE'")
    _add_col('options', 'TEXT')
    _add_col('expires_at', 'TEXT')

    conn.commit()
    _SCHEMA_INITIALIZED = True


def _coerce_text(value: Any) -> str:
    if value is None:
        return ""
    s = str(value)
    # Remove common zero-width / BOM characters that can sneak in via UI widgets.
    # Keep this conservative: only characters that should never matter semantically.
    try:
        s = (
            s.replace("\u200b", "")  # zero width space
            .replace("\u200c", "")  # zero width non-joiner
            .replace("\u200d", "")  # zero width joiner
            .replace("\ufeff", "")  # BOM
        )
    except Exception:
        pass
    return s.strip()


_ALLOWED_STATUSES = {"ENABLE", "DISABLED"}
_ALLOWED_TYPES = {"sudo", "cron", "at", "ssh"}
_ALLOWED_ACTIONS = {"ALLOW", "DENY"}


def _coerce_upper(value: Any) -> str:
    return _coerce_text(value).upper()


def _normalize_type(value: str) -> str:
    v = _coerce_text(value).lower()
    if v in ("cron.allow", "cron.deny"):
        return "cron"
    if v in ("at.allow", "at.deny"):
        return "at"
    return v


def _normalize_action(value: str) -> str:
    v = _coerce_text(value)
    if not v:
        return ""
    vl = v.lower()

    # Accept common synonyms / localized labels.
    if vl in ("allow", "permit", "accept", "approve"):
        return "ALLOW"
    if vl in ("deny", "block", "reject", "refuse"):
        return "DENY"

    # Korean labels that may appear in legacy UIs.
    if v in ("허용", "승인", "가능", "접근허용"):
        return "ALLOW"
    if v in ("차단", "거부", "불가", "접근차단"):
        return "DENY"

    # Default: uppercase whatever came in.
    return v.upper()


def _normalize_status(value: str) -> str:
    v = _coerce_upper(value)
    if not v:
        return "ENABLE"
    if v == "ENABLED":
        return "ENABLE"
    if v == "DISABLE":
        return "DISABLED"
    # Korean labels
    raw = _coerce_text(value)
    if raw in ("활성",):
        return "ENABLE"
    if raw in ("비활성",):
        return "DISABLED"
    return v


def _normalize_expires(value: Any) -> str:
    s = _coerce_text(value)
    return s


def _validate_payload(data: Dict[str, Any]) -> Dict[str, str]:
    status = _normalize_status(data.get("status"))
    rule_type = _normalize_type(data.get("type"))
    target = _coerce_text(data.get("target"))
    action = _normalize_action(data.get("action"))
    command = _coerce_text(data.get("command_scope") if "command_scope" in data else data.get("command"))
    options = _coerce_text(data.get("options"))
    expires_at = _normalize_expires(data.get("expires_at"))
    remark = _coerce_text(data.get("remark"))

    if status not in _ALLOWED_STATUSES:
        raise ValueError("상태(status) 값이 올바르지 않습니다.")

    if not rule_type:
        raise ValueError("구분(type)을 선택하세요.")
    if rule_type not in _ALLOWED_TYPES:
        raise ValueError("구분(type) 값이 올바르지 않습니다.")

    if not target:
        raise ValueError("대상(target)을 입력하세요.")

    if not action:
        raise ValueError("동작(action)을 선택하세요.")
    if action not in _ALLOWED_ACTIONS:
        raise ValueError("동작(action) 값이 올바르지 않습니다.")

    return {
        "status": status,
        "type": rule_type,
        "target": target,
        "action": action,
        "command": command,
        "options": options,
        "expires_at": expires_at,
        "remark": remark,
    }


def list_authorities(*, asset_id: int, asset_type: str, app=None) -> List[Dict[str, Any]]:
    app = app or current_app
    with hardware_asset_service._get_connection(app) as conn:  # noqa: SLF001
        _ensure_schema(conn)
        rows = conn.execute(
            f"""
            SELECT id, asset_id, asset_type, status, type, target, action, command, options, expires_at, remark,
                   created_at, created_by, updated_at, updated_by
              FROM {TABLE_NAME}
             WHERE is_deleted = 0 AND asset_id = ? AND asset_type = ?
             ORDER BY id ASC
            """,
            (asset_id, asset_type),
        ).fetchall()

    items: List[Dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        # Normalize legacy values (cron.allow/deny, allow/deny) for UI.
        d["status"] = _normalize_status(d.get("status"))
        d["type"] = _normalize_type(d.get("type"))
        d["action"] = _normalize_action(d.get("action"))
        # Compatibility aliases
        d["command_scope"] = d.get("command")
        items.append(d)
    return items


def create_authority(
    *,
    asset_id: int,
    asset_type: str,
    data: Dict[str, Any],
    actor: str,
    app=None,
) -> Dict[str, Any]:
    app = app or current_app
    payload = _validate_payload(data)
    now = _now()
    actor = _coerce_text(actor) or "system"

    with hardware_asset_service._get_connection(app) as conn:  # noqa: SLF001
        _ensure_schema(conn)
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (
                asset_id, asset_type, status, type, target, action, command, options, expires_at, remark,
                created_at, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                asset_id,
                asset_type,
                payload["status"],
                payload["type"],
                payload["target"],
                payload["action"],
                payload["command"],
                payload["options"],
                payload["expires_at"],
                payload["remark"],
                now,
                actor,
            ),
        )
        new_id = int(cur.lastrowid)
        conn.commit()

        row = conn.execute(
            f"""
            SELECT id, asset_id, asset_type, status, type, target, action, command, options, expires_at, remark,
                   created_at, created_by, updated_at, updated_by
              FROM {TABLE_NAME}
             WHERE id = ?
            """,
            (new_id,),
        ).fetchone()

    out = dict(row) if row else {"id": new_id, **payload}
    out["status"] = _normalize_status(out.get("status"))
    out["type"] = _normalize_type(out.get("type"))
    out["action"] = _normalize_action(out.get("action"))
    out["command_scope"] = out.get("command")
    return out


def update_authority(
    *,
    authority_id: int,
    asset_id: int,
    asset_type: str,
    data: Dict[str, Any],
    actor: str,
    app=None,
) -> Optional[Dict[str, Any]]:
    app = app or current_app
    payload = _validate_payload(data)
    now = _now()
    actor = _coerce_text(actor) or "system"

    with hardware_asset_service._get_connection(app) as conn:  # noqa: SLF001
        _ensure_schema(conn)

        row = conn.execute(
            f"""
            SELECT id
              FROM {TABLE_NAME}
             WHERE id = ? AND is_deleted = 0 AND asset_id = ? AND asset_type = ?
            """,
            (authority_id, asset_id, asset_type),
        ).fetchone()
        if not row:
            return None

        conn.execute(
            f"""
            UPDATE {TABLE_NAME}
               SET status = ?, type = ?, target = ?, action = ?, command = ?, options = ?, expires_at = ?, remark = ?,
                   updated_at = ?, updated_by = ?
             WHERE id = ?
            """,
            (
                payload["status"],
                payload["type"],
                payload["target"],
                payload["action"],
                payload["command"],
                payload["options"],
                payload["expires_at"],
                payload["remark"],
                now,
                actor,
                authority_id,
            ),
        )
        conn.commit()

        updated = conn.execute(
            f"""
            SELECT id, asset_id, asset_type, status, type, target, action, command, options, expires_at, remark,
                   created_at, created_by, updated_at, updated_by
              FROM {TABLE_NAME}
             WHERE id = ?
            """,
            (authority_id,),
        ).fetchone()

    if not updated:
        return None
    out = dict(updated)
    out["status"] = _normalize_status(out.get("status"))
    out["type"] = _normalize_type(out.get("type"))
    out["action"] = _normalize_action(out.get("action"))
    out["command_scope"] = out.get("command")
    return out


def get_authority(
    *,
    authority_id: int,
    asset_id: int,
    asset_type: str,
    app=None,
) -> Optional[Dict[str, Any]]:
    """단건 조회 (변경이력 old_data 캡처용)."""
    app = app or current_app
    with hardware_asset_service._get_connection(app) as conn:  # noqa: SLF001
        _ensure_schema(conn)
        row = conn.execute(
            f"""
            SELECT id, asset_id, asset_type, status, type, target, action, command, options, expires_at, remark,
                   created_at, created_by, updated_at, updated_by
              FROM {TABLE_NAME}
             WHERE id = ? AND is_deleted = 0 AND asset_id = ? AND asset_type = ?
            """,
            (authority_id, asset_id, asset_type),
        ).fetchone()
    if not row:
        return None
    out = dict(row)
    out["status"] = _normalize_status(out.get("status"))
    out["type"] = _normalize_type(out.get("type"))
    out["action"] = _normalize_action(out.get("action"))
    out["command_scope"] = out.get("command")
    return out


def delete_authority(
    *,
    authority_id: int,
    asset_id: int,
    asset_type: str,
    actor: str,
    app=None,
) -> bool:
    app = app or current_app
    now = _now()
    actor = _coerce_text(actor) or "system"

    with hardware_asset_service._get_connection(app) as conn:  # noqa: SLF001
        _ensure_schema(conn)
        cur = conn.execute(
            f"""
            UPDATE {TABLE_NAME}
               SET is_deleted = 1, updated_at = ?, updated_by = ?
             WHERE id = ? AND is_deleted = 0 AND asset_id = ? AND asset_type = ?
            """,
            (now, actor, authority_id, asset_id, asset_type),
        )
        conn.commit()
        return (cur.rowcount or 0) > 0
