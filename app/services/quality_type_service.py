import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'cfg_quality_type'

CREATE_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name TEXT NOT NULL DEFAULT '',
    quality_type TEXT NOT NULL DEFAULT '',
    item_name TEXT NOT NULL DEFAULT '',
    metric TEXT NOT NULL DEFAULT '',
    unit TEXT NOT NULL DEFAULT '',
    target_value TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT 'system',
    updated_at TEXT,
    updated_by TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0
)
"""


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not str(uri).startswith('sqlite'):
        return os.path.join(app.instance_path, 'quality_type.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'quality_type.db')
    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    relative = path.lstrip('/')
    if relative and not os.path.isabs(relative):
        if os.path.basename(relative) == relative:
            return os.path.abspath(os.path.join(app.instance_path, relative))
        return os.path.abspath(os.path.join(_project_root(app), relative))
    if os.path.isabs(path):
        return os.path.abspath(path)
    return os.path.abspath(os.path.join(app.instance_path, 'quality_type.db'))


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


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}
    return {
        'id': row['id'],
        'group_name': row['group_name'] or '',
        'quality_type': row['quality_type'] or '',
        'item_name': row['item_name'] or '',
        'metric': row['metric'] or '',
        'unit': row['unit'] or '',
        'target_value': row['target_value'] or '',
        'description': row['description'] or '',
        'sort_order': row['sort_order'] or 0,
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
    }


# ---------------------------------------------------------------------------
# Table init
# ---------------------------------------------------------------------------

def init_quality_type_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(CREATE_TABLE_SQL)
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_deleted ON {TABLE_NAME}(is_deleted)"
            )
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def list_quality_types(
    app=None,
    *,
    search: Optional[str] = None,
    include_deleted: bool = False,
) -> List[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        clauses = ['1=1' if include_deleted else 'is_deleted = 0']
        params: List[Any] = []
        if search:
            like = f"%{search}%"
            clauses.append(
                '(group_name LIKE ? OR quality_type LIKE ? OR item_name LIKE ? '
                'OR metric LIKE ? OR unit LIKE ? OR target_value LIKE ? OR description LIKE ?)'
            )
            params.extend([like] * 7)
        query = (
            f"SELECT * FROM {TABLE_NAME} "
            f"WHERE {' AND '.join(clauses)} "
            f"ORDER BY sort_order ASC, id ASC"
        )
        rows = conn.execute(query, params).fetchall()
        return [_row_to_dict(row) for row in rows]


def get_quality_type(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (record_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def create_quality_type(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    timestamp = _now()

    group_name = (data.get('group_name') or '').strip()
    quality_type = (data.get('quality_type') or '').strip()
    item_name = (data.get('item_name') or '').strip()
    metric = (data.get('metric') or '').strip()
    unit = (data.get('unit') or '').strip()
    target_value = (data.get('target_value') or '').strip()
    description = (data.get('description') or '').strip()
    sort_order = 0
    try:
        sort_order = int(data.get('sort_order', 0))
    except (TypeError, ValueError):
        sort_order = 0

    if not quality_type:
        raise ValueError('품질유형은 필수 입력 항목입니다.')

    with _get_connection(app) as conn:
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
                (group_name, quality_type, item_name, metric, unit, target_value,
                 description, sort_order, created_at, created_by, updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                group_name, quality_type, item_name, metric, unit, target_value,
                description, sort_order, timestamp, actor, timestamp, actor,
            ),
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
    return get_quality_type(new_id, app)


def update_quality_type(record_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    timestamp = _now()

    updates: List[str] = []
    params: List[Any] = []

    field_map = {
        'group_name': 'group_name',
        'quality_type': 'quality_type',
        'item_name': 'item_name',
        'metric': 'metric',
        'unit': 'unit',
        'target_value': 'target_value',
        'description': 'description',
        'sort_order': 'sort_order',
    }

    for json_key, col in field_map.items():
        if json_key in data:
            value = data[json_key]
            if col == 'sort_order':
                try:
                    value = int(value)
                except (TypeError, ValueError):
                    value = 0
            else:
                value = (value or '').strip() if isinstance(value, str) else (value or '')
            updates.append(f"{col} = ?")
            params.append(value)

    if not updates:
        return get_quality_type(record_id, app)

    updates.extend(['updated_at = ?', 'updated_by = ?'])
    params.extend([timestamp, actor, record_id])

    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ? AND is_deleted = 0",
            params,
        )
        if cur.rowcount == 0:
            return None
        conn.commit()
    return get_quality_type(record_id, app)


def soft_delete_quality_types(ids: Iterable[Any], actor: str, app=None) -> int:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    safe_ids: List[int] = []
    for raw in ids:
        try:
            value = int(raw)
        except (TypeError, ValueError):
            continue
        if value >= 0:
            safe_ids.append(value)
    if not safe_ids:
        return 0
    placeholders = ','.join('?' for _ in safe_ids)
    timestamp = _now()
    with _get_connection(app) as conn:
        params: List[Any] = [timestamp, actor, *safe_ids]
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? "
            f"WHERE id IN ({placeholders}) AND is_deleted = 0",
            params,
        )
        conn.commit()
        return cur.rowcount
