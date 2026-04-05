"""
동적 탭 레코드 서비스
- PageTabConfig로 동적 추가된 탭의 데이터를 저장/조회/수정/삭제
- route_key 별로 독립된 데이터 관리
"""
import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'dynamic_tab_records'


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        return os.path.join(app.instance_path, 'dynamic_tab.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'dynamic_tab.db')
    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    if os.path.isabs(path):
        return path
    relative = path.lstrip('/')
    return os.path.abspath(os.path.join(_project_root(app), relative))


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
    return {key: row[key] for key in row.keys()}


# ---------------------------------------------------------------------------
# Table init
# ---------------------------------------------------------------------------
def init_dynamic_tab_record_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    route_key   TEXT    NOT NULL,
                    col_name    TEXT    NOT NULL DEFAULT '',
                    col_code    TEXT    DEFAULT '',
                    col_phone   TEXT    DEFAULT '',
                    col_address TEXT    DEFAULT '',
                    col_count1  INTEGER DEFAULT 0,
                    col_count2  INTEGER DEFAULT 0,
                    col_note    TEXT    DEFAULT '',
                    created_at  TEXT    NOT NULL,
                    created_by  TEXT    NOT NULL DEFAULT '',
                    updated_at  TEXT,
                    updated_by  TEXT,
                    is_deleted  INTEGER NOT NULL DEFAULT 0
                )
            """)
            # 기존 테이블에 새 컬럼 추가 (이미 존재하면 무시)
            for col_def in [
                ('col_code', 'TEXT DEFAULT \"\"'),
                ('col_phone', 'TEXT DEFAULT \"\"'),
            ]:
                try:
                    conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN {col_def[0]} {col_def[1]}")
                except sqlite3.OperationalError:
                    pass  # 이미 존재
            conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_rk ON {TABLE_NAME}(route_key)")
            conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_del ON {TABLE_NAME}(is_deleted)")
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------
def list_records(route_key: str, *, search: Optional[str] = None, app=None) -> List[Dict]:
    with _get_connection(app) as conn:
        clauses = ['route_key = ?', 'is_deleted = 0']
        params: list = [route_key]
        if search:
            like = f"%{search}%"
            clauses.append('(col_name LIKE ? OR col_code LIKE ? OR col_phone LIKE ? OR col_address LIKE ? OR col_note LIKE ?)')
            params.extend([like, like, like, like, like])
        sql = (
            f"SELECT * FROM {TABLE_NAME} "
            f"WHERE {' AND '.join(clauses)} "
            f"ORDER BY id DESC"
        )
        rows = conn.execute(sql, params).fetchall()
        return [_row_to_dict(r) for r in rows]


def get_record(record_id: int, app=None) -> Optional[Dict]:
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ? AND is_deleted = 0",
            (record_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def create_record(route_key: str, data: Dict, actor: str, app=None) -> Dict:
    name = (data.get('name') or data.get('col_name') or '').strip()
    if not name:
        raise ValueError('이름은 필수 항목입니다.')
    code = (data.get('code') or data.get('col_code') or '').strip()
    phone = (data.get('phone') or data.get('col_phone') or '').strip()
    address = (data.get('address') or data.get('col_address') or '').strip()
    count1 = _safe_int(data.get('count1', data.get('col_count1', 0)))
    count2 = _safe_int(data.get('count2', data.get('col_count2', 0)))
    note = (data.get('note') or data.get('col_note') or '').strip()
    now = _now()
    with _get_connection(app) as conn:
        conn.execute(
            f"INSERT INTO {TABLE_NAME} "
            f"(route_key, col_name, col_code, col_phone, col_address, col_count1, col_count2, col_note, created_at, created_by) "
            f"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (route_key, name, code, phone, address, count1, count2, note, now, actor),
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
    return get_record(new_id, app)


def update_record(record_id: int, data: Dict, actor: str, app=None) -> Optional[Dict]:
    updates, params = [], []
    field_map = {
        'name': 'col_name', 'col_name': 'col_name',
        'code': 'col_code', 'col_code': 'col_code',
        'phone': 'col_phone', 'col_phone': 'col_phone',
        'address': 'col_address', 'col_address': 'col_address',
        'count1': 'col_count1', 'col_count1': 'col_count1',
        'count2': 'col_count2', 'col_count2': 'col_count2',
        'note': 'col_note', 'col_note': 'col_note',
    }
    for src, col in field_map.items():
        if src in data:
            val = data[src]
            if col in ('col_count1', 'col_count2'):
                val = _safe_int(val)
            else:
                val = (val or '').strip() if isinstance(val, str) else (val or '')
            updates.append(f"{col} = ?")
            params.append(val)
    if not updates:
        return get_record(record_id, app)
    updates.extend(['updated_at = ?', 'updated_by = ?'])
    params.extend([_now(), actor, record_id])
    with _get_connection(app) as conn:
        conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ? AND is_deleted = 0",
            params,
        )
        conn.commit()
    return get_record(record_id, app)


def soft_delete_records(ids, actor: str, app=None) -> int:
    safe_ids = []
    for x in ids:
        try:
            safe_ids.append(int(x))
        except (TypeError, ValueError):
            continue
    if not safe_ids:
        return 0
    placeholders = ','.join('?' for _ in safe_ids)
    now = _now()
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted=1, updated_at=?, updated_by=? "
            f"WHERE id IN ({placeholders}) AND is_deleted=0",
            [now, actor, *safe_ids],
        )
        conn.commit()
        return cur.rowcount


def _safe_int(v) -> int:
    if v in (None, ''):
        return 0
    try:
        n = int(v)
        return n if n >= 0 else 0
    except (TypeError, ValueError):
        return 0
