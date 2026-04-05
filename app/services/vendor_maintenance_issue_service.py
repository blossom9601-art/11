"""
Service layer for Vendor Maintenance Issue management.

Tables:
    biz_vendor_maintenance_issue          – issue header
    biz_vendor_maintenance_issue_cause    – 원인분석 (1:1 per issue)
    biz_vendor_maintenance_issue_action   – 조치관리 (1:1 per issue)
    biz_vendor_maintenance_issue_work     – issue ↔ work_group many-to-many
"""

import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

ISSUE_TABLE = 'biz_vendor_maintenance_issue'
CAUSE_TABLE = 'biz_vendor_maintenance_issue_cause'
ACTION_TABLE = 'biz_vendor_maintenance_issue_action'
WORK_TABLE = 'biz_vendor_maintenance_issue_work'
VENDOR_TABLE = 'biz_vendor_maintenance'


# ── helpers ──────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        return os.path.join(app.instance_path, 'dev_blossom.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    if os.path.isabs(path):
        normalized = path.replace('\\', '/')
        if normalized.startswith('/') and normalized.count('/') == 1:
            return os.path.abspath(os.path.join(app.instance_path, normalized.lstrip('/')))
        return os.path.abspath(path)
    return os.path.abspath(os.path.join(app.instance_path, path.lstrip('/')))


def _get_connection(app=None):
    app = app or current_app
    db_path = _resolve_db_path(app)
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    return conn


# ── table init ───────────────────────────────────────────────────────────────

def init_vendor_maintenance_issue_tables(app=None):
    """Create issue + cause + action + work junction tables."""
    app = app or current_app
    with _get_connection(app) as conn:
        # Issue header
        conn.execute(f"""
            CREATE TABLE IF NOT EXISTS {ISSUE_TABLE} (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                vendor_id   INTEGER NOT NULL,
                status      TEXT NOT NULL DEFAULT '분석중',
                content     TEXT,
                issue_type  TEXT,
                impact      TEXT,
                urgency     TEXT,
                remark      TEXT,
                created_at  TEXT NOT NULL,
                created_by  TEXT NOT NULL,
                updated_at  TEXT,
                updated_by  TEXT,
                is_deleted  INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (vendor_id) REFERENCES {VENDOR_TABLE}(id)
            )
        """)
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{ISSUE_TABLE}_vendor ON {ISSUE_TABLE}(vendor_id)")
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{ISSUE_TABLE}_deleted ON {ISSUE_TABLE}(is_deleted)")

        # 원인분석 (1:1)
        conn.execute(f"""
            CREATE TABLE IF NOT EXISTS {CAUSE_TABLE} (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                issue_id      INTEGER NOT NULL UNIQUE,
                occurred_at   TEXT,
                cause         TEXT,
                analysis      TEXT,
                recurrence    TEXT DEFAULT 'X',
                created_at    TEXT NOT NULL,
                created_by    TEXT NOT NULL,
                updated_at    TEXT,
                updated_by    TEXT,
                FOREIGN KEY (issue_id) REFERENCES {ISSUE_TABLE}(id)
            )
        """)

        # 조치관리 (1:1)
        conn.execute(f"""
            CREATE TABLE IF NOT EXISTS {ACTION_TABLE} (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                issue_id        INTEGER NOT NULL UNIQUE,
                action_at       TEXT,
                completed_at    TEXT,
                person          TEXT,
                action_content  TEXT,
                is_temporary    TEXT DEFAULT 'X',
                created_at      TEXT NOT NULL,
                created_by      TEXT NOT NULL,
                updated_at      TEXT,
                updated_by      TEXT,
                FOREIGN KEY (issue_id) REFERENCES {ISSUE_TABLE}(id)
            )
        """)

        # 업무명 다중선택 junction
        conn.execute(f"""
            CREATE TABLE IF NOT EXISTS {WORK_TABLE} (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                issue_id  INTEGER NOT NULL,
                work_name TEXT NOT NULL,
                FOREIGN KEY (issue_id) REFERENCES {ISSUE_TABLE}(id)
            )
        """)
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{WORK_TABLE}_issue ON {WORK_TABLE}(issue_id)")

        conn.commit()


# ── row helpers ──────────────────────────────────────────────────────────────

def _row_to_dict(row) -> dict:
    return dict(row) if row else {}


def _enrich_issue(issue: dict, conn) -> dict:
    """Attach work_names list to issue dict."""
    if not issue:
        return issue
    iid = issue['id']
    wrows = conn.execute(f"SELECT work_name FROM {WORK_TABLE} WHERE issue_id = ? ORDER BY id", (iid,)).fetchall()
    issue['work_names'] = [r['work_name'] for r in wrows]
    return issue


# ── Issue CRUD ───────────────────────────────────────────────────────────────

def list_issues(vendor_id: int, app=None) -> List[dict]:
    app = app or current_app
    with _get_connection(app) as conn:
        rows = conn.execute(f"""
            SELECT * FROM {ISSUE_TABLE}
            WHERE vendor_id = ? AND is_deleted = 0
            ORDER BY id DESC
        """, (vendor_id,)).fetchall()
        return [_enrich_issue(_row_to_dict(r), conn) for r in rows]


def get_issue(issue_id: int, app=None) -> Optional[dict]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(f"SELECT * FROM {ISSUE_TABLE} WHERE id = ? AND is_deleted = 0", (issue_id,)).fetchone()
        return _enrich_issue(_row_to_dict(row), conn) if row else None


def create_issue(vendor_id: int, data: dict, actor: str = 'system', app=None) -> dict:
    app = app or current_app
    now = _now()
    with _get_connection(app) as conn:
        cur = conn.execute(f"""
            INSERT INTO {ISSUE_TABLE}
                (vendor_id, status, content, issue_type, impact, urgency, remark, created_at, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            vendor_id,
            data.get('status', '분석중'),
            data.get('content', ''),
            data.get('issue_type', ''),
            data.get('impact', ''),
            data.get('urgency', ''),
            data.get('remark', ''),
            now, actor,
        ))
        new_id = cur.lastrowid
        # Save work names
        work_names = data.get('work_names', [])
        if isinstance(work_names, str):
            work_names = [w.strip() for w in work_names.split(',') if w.strip()]
        for wn in work_names:
            conn.execute(f"INSERT INTO {WORK_TABLE} (issue_id, work_name) VALUES (?, ?)", (new_id, wn))
        conn.commit()
    return get_issue(new_id, app) or {'id': new_id}


def update_issue(issue_id: int, data: dict, actor: str = 'system', app=None) -> Optional[dict]:
    app = app or current_app
    now = _now()
    fields = []
    vals = []
    for col in ('status', 'content', 'issue_type', 'impact', 'urgency', 'remark'):
        if col in data:
            fields.append(f"{col} = ?")
            vals.append(data[col])
    if fields:
        fields.append("updated_at = ?"); vals.append(now)
        fields.append("updated_by = ?"); vals.append(actor)
        vals.append(issue_id)
        with _get_connection(app) as conn:
            conn.execute(f"UPDATE {ISSUE_TABLE} SET {', '.join(fields)} WHERE id = ? AND is_deleted = 0", vals)
            conn.commit()
    # Update work names if provided
    if 'work_names' in data:
        work_names = data['work_names']
        if isinstance(work_names, str):
            work_names = [w.strip() for w in work_names.split(',') if w.strip()]
        with _get_connection(app) as conn:
            conn.execute(f"DELETE FROM {WORK_TABLE} WHERE issue_id = ?", (issue_id,))
            for wn in work_names:
                conn.execute(f"INSERT INTO {WORK_TABLE} (issue_id, work_name) VALUES (?, ?)", (issue_id, wn))
            conn.commit()
    return get_issue(issue_id, app)


def delete_issue(issue_id: int, actor: str = 'system', app=None) -> bool:
    app = app or current_app
    now = _now()
    with _get_connection(app) as conn:
        conn.execute(f"UPDATE {ISSUE_TABLE} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id = ?",
                     (now, actor, issue_id))
        conn.commit()
    return True


# ── Cause CRUD (원인분석) ────────────────────────────────────────────────────

def get_issue_cause(issue_id: int, app=None) -> Optional[dict]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(f"SELECT * FROM {CAUSE_TABLE} WHERE issue_id = ?", (issue_id,)).fetchone()
        return _row_to_dict(row) if row else None


def upsert_issue_cause(issue_id: int, data: dict, actor: str = 'system', app=None) -> dict:
    app = app or current_app
    now = _now()
    existing = get_issue_cause(issue_id, app)
    cols = ('occurred_at', 'cause', 'analysis', 'recurrence')
    with _get_connection(app) as conn:
        if existing:
            fields = []
            vals = []
            for c in cols:
                if c in data:
                    fields.append(f"{c} = ?"); vals.append(data[c])
            if fields:
                fields.append("updated_at = ?"); vals.append(now)
                fields.append("updated_by = ?"); vals.append(actor)
                vals.append(issue_id)
                conn.execute(f"UPDATE {CAUSE_TABLE} SET {', '.join(fields)} WHERE issue_id = ?", vals)
                conn.commit()
        else:
            conn.execute(f"""
                INSERT INTO {CAUSE_TABLE}
                    (issue_id, occurred_at, cause, analysis, recurrence, created_at, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                issue_id,
                data.get('occurred_at', ''),
                data.get('cause', ''),
                data.get('analysis', ''),
                data.get('recurrence', 'X'),
                now, actor,
            ))
            conn.commit()
    return get_issue_cause(issue_id, app) or {}


# ── Action CRUD (조치관리) ───────────────────────────────────────────────────

def get_issue_action(issue_id: int, app=None) -> Optional[dict]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(f"SELECT * FROM {ACTION_TABLE} WHERE issue_id = ?", (issue_id,)).fetchone()
        return _row_to_dict(row) if row else None


def upsert_issue_action(issue_id: int, data: dict, actor: str = 'system', app=None) -> dict:
    app = app or current_app
    now = _now()
    existing = get_issue_action(issue_id, app)
    cols = ('action_at', 'completed_at', 'person', 'action_content', 'is_temporary')
    with _get_connection(app) as conn:
        if existing:
            fields = []
            vals = []
            for c in cols:
                if c in data:
                    fields.append(f"{c} = ?"); vals.append(data[c])
            if fields:
                fields.append("updated_at = ?"); vals.append(now)
                fields.append("updated_by = ?"); vals.append(actor)
                vals.append(issue_id)
                conn.execute(f"UPDATE {ACTION_TABLE} SET {', '.join(fields)} WHERE issue_id = ?", vals)
                conn.commit()
        else:
            conn.execute(f"""
                INSERT INTO {ACTION_TABLE}
                    (issue_id, action_at, completed_at, person, action_content, is_temporary, created_at, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                issue_id,
                data.get('action_at', ''),
                data.get('completed_at', ''),
                data.get('person', ''),
                data.get('action_content', ''),
                data.get('is_temporary', 'X'),
                now, actor,
            ))
            conn.commit()
    return get_issue_action(issue_id, app) or {}
