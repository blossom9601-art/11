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

TABLE_NAME = 'biz_work_division'


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        fallback = app.config.get('WORK_DIVISION_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'work_division.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'work_division.db')
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


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    try:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1",
            (table_name,),
        ).fetchone()
        return row is not None
    except sqlite3.DatabaseError:
        return False


def _copy_table_if_effectively_empty(*, source_db: str, target_conn: sqlite3.Connection, table_name: str) -> None:
    """Best-effort: copy rows from source_db into target table.

    NOTE: work_division always inserts a default row (e.g. '기타'), so "empty" must
    be interpreted as "no meaningful non-default rows".
    """

    try:
        if not os.path.exists(source_db):
            return
        if not _table_exists(target_conn, table_name):
            return

        meaningful = target_conn.execute(
            f"SELECT 1 FROM {table_name} WHERE is_deleted = 0 AND division_code NOT IN ('기타','내부','대외','DIAG_DIVISION') LIMIT 1"
        ).fetchone()
        if meaningful:
            return

        src = sqlite3.connect(source_db)
        try:
            if not _table_exists(src, table_name):
                return

            src_cols = [r[1] for r in src.execute(f"PRAGMA table_info({table_name})").fetchall()]
            tgt_cols = [r[1] for r in target_conn.execute(f"PRAGMA table_info({table_name})").fetchall()]
            src_cols = [c for c in src_cols if c and c != 'id']
            tgt_cols = [c for c in tgt_cols if c and c != 'id']
            cols = [c for c in src_cols if c in tgt_cols]
            if not cols:
                return

            rows = src.execute(
                f"SELECT {', '.join(cols)} FROM {table_name} WHERE is_deleted = 0"
            ).fetchall()
            if not rows:
                return

            placeholders = ', '.join(['?'] * len(cols))
            target_conn.executemany(
                f"INSERT OR IGNORE INTO {table_name} ({', '.join(cols)}) VALUES ({placeholders})",
                rows,
            )
            target_conn.commit()
        finally:
            src.close()
    except Exception:
        logger.exception('Best-effort migration failed for %s', table_name)


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
    base = re.sub(r'[^A-Za-z0-9]+', '_', (name or 'DIVISION').upper()).strip('_') or 'DIVISION'
    base = base[:40]
    candidate = base
    suffix = 1
    while True:
        exists = conn.execute(
            f"SELECT 1 FROM {TABLE_NAME} WHERE division_code = ?",
            (candidate,)
        ).fetchone()
        if not exists:
            return candidate
        suffix += 1
        candidate = f"{base}_{suffix}"[:60]


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    return {
        'id': row['id'],
        'division_code': row['division_code'],
        'wc_name': row['division_name'],
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


def _fetch_single(division_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT id, division_code, division_name, description, hw_count, sw_count, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {TABLE_NAME} WHERE id = ?",
            (division_id,)
        ).fetchone()
        if not row:
            return None
        item = _row_to_dict(row)
        code = (item.get('division_code') or '').strip()
        if not code:
            item['hw_count'] = 0
            item['sw_count'] = 0
            return item
        hw_counts = counts_by_code(conn, asset_table='hardware', code_column='work_division_code')
        sw_counts = sw_counts_via_hardware(conn, code_column='work_division_code')
        item['hw_count'] = hw_counts.get(code, 0)
        item['sw_count'] = sw_counts.get(code, 0)
        return item


def init_work_division_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    division_code TEXT NOT NULL UNIQUE,
                    division_name TEXT NOT NULL,
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
                f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{TABLE_NAME}_code ON {TABLE_NAME}(division_code)"
            )
            conn.commit()
            logger.info("%s table ready", TABLE_NAME)
    except Exception:
        logger.exception("Failed to initialize %s table", TABLE_NAME)
        raise


def list_work_divisions(app=None, search: Optional[str] = None, include_deleted: bool = False) -> List[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        clauses = ["is_deleted = 0" if not include_deleted else '1=1']
        params: List[Any] = []
        if search:
            like = f"%{search}%"
            clauses.append("(division_name LIKE ? OR division_code LIKE ? OR description LIKE ? OR remark LIKE ?)")
            params.extend([like, like, like, like])
        query = (
            f"SELECT id, division_code, division_name, description, hw_count, sw_count, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {TABLE_NAME} WHERE {' AND '.join(clauses)} ORDER BY id DESC"
        )
        rows = conn.execute(query, params).fetchall()
        hw_counts = counts_by_code(conn, asset_table='hardware', code_column='work_division_code')
        sw_counts = sw_counts_via_hardware(conn, code_column='work_division_code')
        out: List[Dict[str, Any]] = []
        for row in rows:
            item = _row_to_dict(row)
            code = (item.get('division_code') or '').strip()
            if code:
                item['hw_count'] = hw_counts.get(code, 0)
                item['sw_count'] = sw_counts.get(code, 0)
            else:
                item['hw_count'] = 0
                item['sw_count'] = 0
            out.append(item)
        return out


def create_work_division(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    name = (data.get('division_name') or data.get('wc_name') or '').strip()
    if not name:
        raise ValueError('division_name is required')
    description = (data.get('description') or data.get('wc_desc') or '').strip()
    remark = (data.get('remark') or data.get('note') or '').strip()
    hw_count = _sanitize_int(data.get('hw_count'))
    sw_count = _sanitize_int(data.get('sw_count'))
    with _get_connection(app) as conn:
        code = (data.get('division_code') or '').strip() or _generate_unique_code(conn, name)
        timestamp = _now()
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
                (division_code, division_name, description, hw_count, sw_count, remark, created_at, created_by, updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                code,
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


def update_work_division(division_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload: Dict[str, Any] = {}
    if 'division_name' in data or 'wc_name' in data:
        name = (data.get('division_name') or data.get('wc_name') or '').strip()
        if not name:
            raise ValueError('division_name is required')
        payload['division_name'] = name
    if 'description' in data or 'wc_desc' in data:
        payload['description'] = (data.get('description') or data.get('wc_desc') or '').strip()
    if 'remark' in data or 'note' in data:
        payload['remark'] = (data.get('remark') or data.get('note') or '').strip()
    if 'hw_count' in data:
        payload['hw_count'] = _sanitize_int(data.get('hw_count'))
    if 'sw_count' in data:
        payload['sw_count'] = _sanitize_int(data.get('sw_count'))
    updates = []
    params: List[Any] = []
    for column, key in (
        ('division_name', 'division_name'),
        ('description', 'description'),
        ('remark', 'remark'),
        ('hw_count', 'hw_count'),
        ('sw_count', 'sw_count'),
    ):
        if key in payload:
            updates.append(f"{column} = ?")
            params.append(payload[key])
    if not updates:
        return _fetch_single(division_id, app)
    timestamp = _now()
    updates.extend(['updated_at = ?', 'updated_by = ?'])
    params.extend([timestamp, actor, division_id])
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ? AND is_deleted = 0",
            params
        )
        if cur.rowcount == 0:
            return None
        conn.commit()
    return _fetch_single(division_id, app)


def soft_delete_work_divisions(ids: Sequence[Any], actor: str, app=None) -> int:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    safe_ids = [int(i) for i in ids if str(i).isdigit()]
    if not safe_ids:
        return 0
    placeholders = ','.join('?' for _ in safe_ids)
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE id IN ({placeholders})",
            safe_ids,
        )
        conn.commit()
        return cur.rowcount
