"""Asset account CRUD (tab05-account) stored in the main SQLite DB (dev_blossom.db).

This project uses a mixed persistence approach: some domains use SQLAlchemy models,
others use sqlite3 services pointed at the same SQLite file. tab05-account follows
that sqlite3-service pattern so it can be used across many templates without
introducing new ORM models/migrations.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)


@dataclass
class AssetAccount:
    id: int
    asset_scope: str
    asset_id: int
    system_key: str
    status: str
    account_type: str
    account_name: str
    group_name: str
    user_name: str
    purpose: str
    login_allowed: bool
    remark: str
    created_at: str
    updated_at: Optional[str]

    # Backward-compatible fields (some older templates/API variants still expect them)
    uid: Optional[int]
    gid: Optional[int]
    admin: str
    role: str
    privilege_level: str
    su_allowed: bool
    admin_allowed: bool


ASSET_ACCOUNT_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS asset_account (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_scope   TEXT NOT NULL,
    asset_id      INTEGER NOT NULL,
    system_key    TEXT NOT NULL DEFAULT '',

    status        TEXT,
    account_type  TEXT,
    account_name  TEXT NOT NULL,
    uid           INTEGER,
    group_name    TEXT,
    gid           INTEGER,
    admin         TEXT,

    role          TEXT,
    user_name     TEXT,
    privilege_level TEXT,
    purpose       TEXT,

    login_allowed INTEGER NOT NULL DEFAULT 0,
    su_allowed    INTEGER NOT NULL DEFAULT 0,
    admin_allowed INTEGER NOT NULL DEFAULT 0,
    remark        TEXT,

    created_at    TEXT NOT NULL,
    updated_at    TEXT,
    is_deleted    INTEGER NOT NULL DEFAULT 0
);
"""


def _ensure_asset_account_indexes(conn: sqlite3.Connection) -> None:
    # Create indexes defensively; legacy DBs may not yet have newer columns.
    try:
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_asset_account_scope_id ON asset_account(asset_scope, asset_id)"
        )
    except Exception:
        logger.exception("Failed to ensure idx_asset_account_scope_id")

    try:
        cols_now = {
            str(r["name"]).strip().lower()
            for r in conn.execute("PRAGMA table_info(asset_account)").fetchall()
        }
        if "system_key" in cols_now:
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_asset_account_scope_id_system ON asset_account(asset_scope, asset_id, system_key)"
            )
    except Exception:
        logger.exception("Failed to ensure idx_asset_account_scope_id_system")

_INITIALIZED: set[str] = set()


def _now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_sqlite_db_path(app=None) -> str:
    """Resolve the SQLite filename used by SQLAlchemy (usually dev_blossom.db).

    Mirrors the path resolution behavior used elsewhere in the codebase.
    """

    app = app or current_app
    uri = app.config.get("SQLALCHEMY_DATABASE_URI", "sqlite:///dev_blossom.db")
    if not uri.startswith("sqlite"):
        # If SQLAlchemy isn't pointed at sqlite, keep our data in instance/.
        return os.path.abspath(os.path.join(app.instance_path, "dev_blossom.db"))

    parsed = urlparse(uri)
    path = parsed.path or ""
    netloc = parsed.netloc or ""

    if path in (":memory:", "/:memory:"):
        return os.path.abspath(os.path.join(app.instance_path, "dev_blossom.db"))

    # Handle sqlite:////host/path cases
    if netloc not in ("", "localhost"):
        path = f"//{netloc}{path}"

    # Windows: urlparse('sqlite:///dev_blossom.db').path -> '/dev_blossom.db'
    if os.name == "nt" and path.startswith("/") and not path.startswith("//"):
        # '/C:/...' -> 'C:/...'
        if len(path) >= 4 and path[1].isalpha() and path[2] == ":" and path[3] == "/":
            path = path[1:]

    if os.path.isabs(path):
        return os.path.abspath(path)

    relative = path.lstrip("/")
    instance_candidate = os.path.abspath(os.path.join(app.instance_path, relative))
    project_candidate = os.path.abspath(os.path.join(_project_root(app), relative))
    if os.path.exists(instance_candidate):
        return instance_candidate
    if os.path.exists(project_candidate):
        return project_candidate
    return instance_candidate


def _ensure_parent(path: str) -> None:
    folder = os.path.dirname(path)
    if folder and not os.path.exists(folder):
        os.makedirs(folder, exist_ok=True)


def _connect(db_path: str) -> sqlite3.Connection:
    _ensure_parent(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_schema(conn: sqlite3.Connection, db_path: str) -> None:
    # NOTE:
    # We keep a small cache to avoid repeated schema checks, but we must not
    # assume the DB is up-to-date forever. In practice, this module can be
    # reloaded/updated while the Flask dev server keeps running. If we skipped
    # evolution based only on `_INITIALIZED`, newly required columns would never
    # be added until the process restarts.
    required_cols = {
        "account_type",
        "role",
        "user_name",
        "privilege_level",
        "purpose",
        "admin_allowed",
        "system_key",
    }

    if db_path in _INITIALIZED:
        try:
            cols_now = {
                str(r["name"]).strip().lower()
                for r in conn.execute("PRAGMA table_info(asset_account)").fetchall()
            }
            if required_cols.issubset(cols_now):
                return
        except Exception:
            # Fall through and attempt to ensure schema again.
            pass

    conn.executescript(ASSET_ACCOUNT_CREATE_TABLE_SQL)
    # Backward compatible schema evolution: existing DBs may already have
    # asset_account without newer columns.
    try:
        cols = {
            str(r["name"]).strip().lower()
            for r in conn.execute("PRAGMA table_info(asset_account)").fetchall()
        }
        additions = [
            ("system_key", "TEXT NOT NULL DEFAULT ''"),
            ("account_type", "TEXT"),
            ("role", "TEXT"),
            ("user_name", "TEXT"),
            ("privilege_level", "TEXT"),
            ("purpose", "TEXT"),
            ("admin_allowed", "INTEGER NOT NULL DEFAULT 0"),
        ]
        for name, coltype in additions:
            if name not in cols:
                conn.execute(f"ALTER TABLE asset_account ADD COLUMN {name} {coltype}")
    except Exception:
        logger.exception("Failed to evolve asset_account schema")

    _ensure_asset_account_indexes(conn)
    conn.commit()
    _INITIALIZED.add(db_path)


def _normalize_system_key(value: Optional[str]) -> str:
    """Normalize system scoping key (typically subtitle hostname).

    Keep it stable and safe for equality filtering.
    """

    raw = "" if value is None else str(value)
    s = raw.strip()
    # Collapse internal whitespace to avoid accidental mismatches.
    s = " ".join(s.split())
    # Keep within a reasonable SQLite TEXT length for indexes.
    if len(s) > 255:
        s = s[:255]
    return s


def _row_to_account(row: sqlite3.Row) -> AssetAccount:
    keys = set(row.keys())
    # New unified columns with fallback to legacy columns.
    account_type = str(row["account_type"] or "") if "account_type" in keys else ""
    role = str(row["role"] or "") if "role" in keys else ""
    if not account_type:
        account_type = role

    admin_allowed = bool(int(row["admin_allowed"] or 0)) if "admin_allowed" in keys else False
    return AssetAccount(
        id=int(row["id"]),
        asset_scope=str(row["asset_scope"]),
        asset_id=int(row["asset_id"]),
        system_key=str(row["system_key"] or "") if "system_key" in keys else "",
        status=str(row["status"] or ""),
        account_type=account_type,
        account_name=str(row["account_name"] or ""),
        group_name=str(row["group_name"] or ""),
        user_name=str(row["user_name"] or "") if "user_name" in keys else "",
        purpose=str(row["purpose"] or "") if "purpose" in keys else "",
        login_allowed=bool(int(row["login_allowed"] or 0)),
        remark=str(row["remark"] or ""),
        created_at=str(row["created_at"]),
        updated_at=(str(row["updated_at"]) if row["updated_at"] is not None else None),

        # Backward-compatible fields
        uid=(int(row["uid"]) if row["uid"] is not None else None),
        gid=(int(row["gid"]) if row["gid"] is not None else None),
        admin=str(row["admin"] or ""),
        role=role,
        privilege_level=str(row["privilege_level"] or "") if "privilege_level" in keys else "",
        su_allowed=bool(int(row["su_allowed"] or 0)),
        admin_allowed=(admin_allowed or bool(int(row["su_allowed"] or 0))),
    )


def list_accounts(*, asset_scope: str, asset_id: int, system_key: str) -> List[Dict[str, Any]]:
    db_path = _resolve_sqlite_db_path()
    system_key2 = _normalize_system_key(system_key)
    with _connect(db_path) as conn:
        _ensure_schema(conn, db_path)
        if not system_key2 or system_key2 == '*':
            rows = conn.execute(
                """
                SELECT *
                FROM asset_account
                WHERE asset_scope = ? AND asset_id = ? AND is_deleted = 0
                ORDER BY id ASC
                """,
                (asset_scope, int(asset_id)),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT *
                FROM asset_account
                WHERE asset_scope = ? AND asset_id = ? AND system_key = ? AND is_deleted = 0
                ORDER BY id ASC
                """,
                (asset_scope, int(asset_id), system_key2),
            ).fetchall()
    return [asdict(_row_to_account(r)) for r in rows]


def create_account(
    *,
    asset_scope: str,
    asset_id: int,
    system_key: str,
    status: str,
    account_type: str = "",
    account_name: str,
    uid: Optional[int],
    group_name: str,
    gid: Optional[int],
    admin: str,
    role: str = "",
    user_name: str = "",
    privilege_level: str = "",
    purpose: str = "",
    login_allowed: bool,
    su_allowed: bool,
    admin_allowed: bool = False,
    remark: str,
) -> Dict[str, Any]:
    db_path = _resolve_sqlite_db_path()
    now = _now()
    system_key2 = _normalize_system_key(system_key)
    with _connect(db_path) as conn:
        _ensure_schema(conn, db_path)
        acct_type = (account_type or role or "")
        role2 = (role or acct_type or "")
        admin_allowed2 = bool(admin_allowed) or bool(su_allowed)
        cur = conn.execute(
            """
            INSERT INTO asset_account(
                            asset_scope, asset_id, system_key, status, account_type, account_name, uid, group_name, gid,
                            admin, role, user_name, privilege_level, purpose,
                            login_allowed, su_allowed, admin_allowed, remark, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                str(asset_scope),
                int(asset_id),
                system_key2,
                (status or ""),
                (acct_type or ""),
                str(account_name),
                (int(uid) if uid is not None else None),
                (group_name or ""),
                (int(gid) if gid is not None else None),
                (admin or ""),
                                (role2 or ""),
                                (user_name or ""),
                                (privilege_level or ""),
                                (purpose or ""),
                (1 if login_allowed else 0),
                (1 if admin_allowed2 else 0),
                (1 if admin_allowed2 else 0),
                (remark or ""),
                now,
            ),
        )
        new_id = int(cur.lastrowid)
        conn.commit()
        row = conn.execute("SELECT * FROM asset_account WHERE id = ?", (new_id,)).fetchone()
    if not row:
        raise RuntimeError("Failed to create asset account")
    return asdict(_row_to_account(row))


def update_account(
    *,
    asset_scope: str,
    asset_id: int,
    account_id: int,
    system_key: str,
    status: str,
    account_type: str = "",
    account_name: str,
    uid: Optional[int],
    group_name: str,
    gid: Optional[int],
    admin: str,
    role: str = "",
    user_name: str = "",
    privilege_level: str = "",
    purpose: str = "",
    login_allowed: bool,
    su_allowed: bool,
    admin_allowed: bool = False,
    remark: str,
) -> Optional[Dict[str, Any]]:
    db_path = _resolve_sqlite_db_path()
    now = _now()
    system_key2 = _normalize_system_key(system_key)
    with _connect(db_path) as conn:
        _ensure_schema(conn, db_path)
        acct_type = (account_type or role or "")
        role2 = (role or acct_type or "")
        admin_allowed2 = bool(admin_allowed) or bool(su_allowed)
        conn.execute(
            """
            UPDATE asset_account
            SET status = ?,
                account_type = ?,
                account_name = ?,
                uid = ?,
                group_name = ?,
                gid = ?,
                admin = ?,
                role = ?,
                user_name = ?,
                privilege_level = ?,
                purpose = ?,
                login_allowed = ?,
                su_allowed = ?,
                admin_allowed = ?,
                remark = ?,
                updated_at = ?
            WHERE id = ? AND asset_scope = ? AND asset_id = ? AND system_key = ? AND is_deleted = 0
            """,
            (
                (status or ""),
                (acct_type or ""),
                str(account_name),
                (int(uid) if uid is not None else None),
                (group_name or ""),
                (int(gid) if gid is not None else None),
                (admin or ""),
                (role2 or ""),
                (user_name or ""),
                (privilege_level or ""),
                (purpose or ""),
                (1 if login_allowed else 0),
                (1 if admin_allowed2 else 0),
                (1 if admin_allowed2 else 0),
                (remark or ""),
                now,
                int(account_id),
                str(asset_scope),
                int(asset_id),
                system_key2,
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM asset_account WHERE id = ? AND asset_scope = ? AND asset_id = ? AND system_key = ? AND is_deleted = 0",
            (int(account_id), str(asset_scope), int(asset_id), system_key2),
        ).fetchone()
    if not row:
        return None
    return asdict(_row_to_account(row))


def delete_account(*, asset_scope: str, asset_id: int, account_id: int, system_key: str) -> bool:
    db_path = _resolve_sqlite_db_path()
    system_key2 = _normalize_system_key(system_key)
    with _connect(db_path) as conn:
        _ensure_schema(conn, db_path)
        cur = conn.execute(
            """
            UPDATE asset_account
            SET is_deleted = 1, updated_at = ?
            WHERE id = ? AND asset_scope = ? AND asset_id = ? AND system_key = ? AND is_deleted = 0
            """,
            (_now(), int(account_id), str(asset_scope), int(asset_id), system_key2),
        )
        conn.commit()
    return (cur.rowcount or 0) > 0
