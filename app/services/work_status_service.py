import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import urlparse

from flask import current_app

from app.services.work_asset_counts import counts_by_code, sw_counts_via_hardware

logger = logging.getLogger(__name__)

TABLE_NAME = 'biz_work_status'


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        fallback = app.config.get('WORK_STATUS_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'work_status.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'work_status.db')
    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"

    # Keep sqlite path resolution consistent with Flask-SQLAlchemy:
    # - For sqlite URIs like "sqlite:///dev_blossom.db", Flask resolves the file under instance_path.
    # - Our service layer should point at the same DB so FK lookups match.
    #
    # NOTE: urlparse yields path like "/dev_blossom.db" on Windows for sqlite:///dev_blossom.db.
    # Treat that as a filename, not an absolute filesystem path.
    if os.path.isabs(path):
        normalized = path.replace('\\', '/')
        # Special-case "/<filename>.db" (no other slashes) as instance-relative.
        if normalized.startswith('/') and normalized.count('/') == 1:
            filename = normalized.lstrip('/')
            return os.path.abspath(os.path.join(app.instance_path, filename))
        return os.path.abspath(path)

    relative = path.lstrip('/')
    return os.path.abspath(os.path.join(app.instance_path, relative))


def _ensure_parent_dir(path: str) -> None:
    directory = os.path.dirname(path)
    if directory and not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)


def _get_connection(app=None) -> sqlite3.Connection:
    app = app or current_app
    db_path = _resolve_db_path(app)
    _ensure_parent_dir(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _sanitize_int(value: Any) -> Optional[int]:
    if value is None or value == '':
        return None
    try:
        num = int(value)
        return max(0, num)
    except (TypeError, ValueError):
        return None


def _generate_unique_code(conn: sqlite3.Connection, name: str) -> str:
    base = re.sub(r'[^A-Za-z0-9]+', '_', (name or 'STATUS').upper()).strip('_') or 'STATUS'
    base = base[:40]
    candidate = base
    suffix = 1
    while True:
        exists = conn.execute(
            f"SELECT 1 FROM {TABLE_NAME} WHERE status_code = ?",
            (candidate,)
        ).fetchone()
        if not exists:
            return candidate
        suffix += 1
        candidate = f"{base}_{suffix}"[:60]


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    color = row['status_level'] or ''
    return {
        'id': row['id'],
        'status_code': row['status_code'],
        'status_level': color,
        'wc_color': color,
        'wc_name': row['status_name'],
        'wc_desc': row['description'] or '',
        'hw_count': row['hw_count'],
        'sw_count': row['sw_count'],
        'note': row['remark'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
    }


def _fetch_single(status_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"""
            SELECT id, status_code, status_level, status_name, description, hw_count, sw_count, remark,
                   created_at, created_by, updated_at, updated_by, is_deleted
            FROM {TABLE_NAME}
            WHERE id = ?
            """,
            (status_id,)
        ).fetchone()
        if not row:
            return None
        item = _row_to_dict(row)
        code = (item.get('status_code') or '').strip()
        if not code:
            item['hw_count'] = 0
            item['sw_count'] = 0
            return item
        hw_counts = counts_by_code(conn, asset_table='hardware', code_column='work_status_code')
        sw_counts = sw_counts_via_hardware(conn, code_column='work_status_code')
        item['hw_count'] = hw_counts.get(code, 0)
        item['sw_count'] = sw_counts.get(code, 0)
        return item


def init_work_status_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    status_code TEXT NOT NULL UNIQUE,
                    status_level TEXT,
                    status_name TEXT NOT NULL,
                    description TEXT,
                    hw_count INTEGER DEFAULT 0,
                    sw_count INTEGER DEFAULT 0,
                    remark TEXT,
                    created_at TEXT NOT NULL,
                    created_by TEXT NOT NULL,
                    updated_at TEXT,
                    updated_by TEXT,
                    is_deleted INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_is_deleted ON {TABLE_NAME}(is_deleted)"
            )
            conn.execute(
                f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{TABLE_NAME}_code ON {TABLE_NAME}(status_code)"
            )
            # Always ensure the UI's default codes exist (FK-safe) even if other rows already exist.
            timestamp = _now()
            actor = 'system'
            defaults = [
                ('가동', '', '가동', None),
                ('예비', '', '예비', None),
                ('종료', '', '종료', None),
            ]
            for code, level, name, desc in defaults:
                conn.execute(
                    f"""
                    INSERT OR IGNORE INTO {TABLE_NAME}
                        (status_code, status_level, status_name, description, hw_count, sw_count, remark, created_at, created_by, updated_at, updated_by, is_deleted)
                    VALUES (?, ?, ?, ?, 0, 0, NULL, ?, ?, ?, ?, 0)
                    """,
                    (code, level, name, desc, timestamp, actor, timestamp, actor),
                )
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def list_work_statuses(app=None, search: Optional[str] = None, include_deleted: bool = False) -> List[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        clauses = ["is_deleted = 0" if not include_deleted else '1=1']
        params: List[Any] = []
        if search:
            like = f"%{search}%"
            clauses.append("(status_name LIKE ? OR status_code LIKE ? OR description LIKE ? OR remark LIKE ?)")
            params.extend([like, like, like, like])
        query = (
            f"SELECT id, status_code, status_level, status_name, description, hw_count, sw_count, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {TABLE_NAME} WHERE {' AND '.join(clauses)} ORDER BY id DESC"
        )
        rows = conn.execute(query, params).fetchall()
        hw_counts = counts_by_code(conn, asset_table='hardware', code_column='work_status_code')
        sw_counts = sw_counts_via_hardware(conn, code_column='work_status_code')
        out: List[Dict[str, Any]] = []
        for row in rows:
            item = _row_to_dict(row)
            code = (item.get('status_code') or '').strip()
            if code:
                item['hw_count'] = hw_counts.get(code, 0)
                item['sw_count'] = sw_counts.get(code, 0)
            else:
                item['hw_count'] = 0
                item['sw_count'] = 0
            out.append(item)
        return out


def create_work_status(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    name = (data.get('status_name') or data.get('wc_name') or '').strip()
    if not name:
        raise ValueError('status_name is required')
    description = (data.get('description') or data.get('wc_desc') or '').strip()
    remark = (data.get('remark') or data.get('note') or '').strip()
    hw_count = _sanitize_int(data.get('hw_count'))
    sw_count = _sanitize_int(data.get('sw_count'))
    color = (data.get('status_level') or data.get('wc_color') or '').strip()
    with _get_connection(app) as conn:
        code = (data.get('status_code') or '').strip() or _generate_unique_code(conn, name)
        timestamp = _now()
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
                (status_code, status_level, status_name, description, hw_count, sw_count, remark, created_at, created_by, updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                code,
                color,
                name,
                description,
                hw_count,
                sw_count,
                remark,
                timestamp,
                actor,
                timestamp,
                actor,
            )
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
        return _fetch_single(new_id, app)


def update_work_status(status_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload: Dict[str, Any] = {}
    if 'status_name' in data or 'wc_name' in data:
        name = (data.get('status_name') or data.get('wc_name') or '').strip()
        if not name:
            raise ValueError('status_name is required')
        payload['status_name'] = name
    if 'description' in data or 'wc_desc' in data:
        payload['description'] = (data.get('description') or data.get('wc_desc') or '').strip()
    if 'remark' in data or 'note' in data:
        payload['remark'] = (data.get('remark') or data.get('note') or '').strip()
    if 'hw_count' in data:
        payload['hw_count'] = _sanitize_int(data.get('hw_count'))
    if 'sw_count' in data:
        payload['sw_count'] = _sanitize_int(data.get('sw_count'))
    if 'status_level' in data or 'wc_color' in data:
        payload['status_level'] = (data.get('status_level') or data.get('wc_color') or '').strip()
    updates = []
    params: List[Any] = []
    for column, key in (
        ('status_name', 'status_name'),
        ('description', 'description'),
        ('remark', 'remark'),
        ('hw_count', 'hw_count'),
        ('sw_count', 'sw_count'),
        ('status_level', 'status_level'),
    ):
        if key in payload:
            updates.append(f"{column} = ?")
            params.append(payload[key])
    if not updates:
        return _fetch_single(status_id, app)
    timestamp = _now()
    updates.extend(['updated_at = ?', 'updated_by = ?'])
    params.extend([timestamp, actor, status_id])
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ? AND is_deleted = 0",
            params
        )
        if cur.rowcount == 0:
            return None
        conn.commit()
    return _fetch_single(status_id, app)


def soft_delete_work_statuses(ids: Sequence[Any], actor: str, app=None) -> int:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    safe_ids = [int(i) for i in ids if str(i).isdigit()]
    if not safe_ids:
        return 0
    placeholders = ','.join('?' for _ in safe_ids)
    timestamp = _now()
    with _get_connection(app) as conn:
        params: List[Any] = [timestamp, actor, *safe_ids]
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id IN ({placeholders}) AND is_deleted = 0",
            params
        )
        conn.commit()
        return cur.rowcount
