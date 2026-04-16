import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'cmp_cpu_type'
MANUFACTURER_TABLE = 'biz_vendor_manufacturer'

CREATE_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cpu_code TEXT NOT NULL UNIQUE,
    model_name TEXT NOT NULL,
    spec_summary TEXT,
    manufacturer_code TEXT NOT NULL,
    part_number TEXT,
    cpu_count INTEGER DEFAULT 0,
    reference_core_count INTEGER,
    reference_tpmc REAL,
    remark TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_at TEXT,
    updated_by TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (manufacturer_code)
        REFERENCES {MANUFACTURER_TABLE}(manufacturer_code)
)
"""


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    override = app.config.get('CMP_CPU_TYPE_SQLITE_PATH')
    if override:
        return os.path.abspath(override)
    if not uri.startswith('sqlite'):
        return os.path.join(app.instance_path, 'cmp_cpu_type.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'cmp_cpu_type.db')
    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    # sqlite:///file.db 는 Flask-SQLAlchemy와 동일하게 instance_path 기준으로 해석한다.
    if path.startswith('/') and not path.startswith('//'):
        path = path.lstrip('/')
    if os.path.isabs(path):
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
    try:
        conn.execute('PRAGMA foreign_keys = ON')
    except sqlite3.DatabaseError:
        logger.warning('Could not enable FK enforcement for %s', TABLE_NAME)
    return conn


def _sanitize_int(value: Any) -> int:
    if value in (None, ''):
        return 0
    try:
        parsed = int(value)
        return parsed if parsed >= 0 else 0
    except (TypeError, ValueError):
        return 0


def _normalize_code(seed: str) -> str:
    base = (seed or 'CPU').upper()
    base = re.sub(r'[^A-Z0-9]+', '_', base).strip('_') or 'CPU'
    return base[:60]


def _generate_unique_code(conn: sqlite3.Connection, seed: str) -> str:
    base = _normalize_code(seed)
    candidate = base
    counter = 1
    while True:
        row = conn.execute(
            f"SELECT 1 FROM {TABLE_NAME} WHERE cpu_code = ?",
            (candidate,),
        ).fetchone()
        if not row:
            return candidate
        counter += 1
        suffix = f"_{counter}"
        candidate = (
            base[:60 - len(suffix)] + suffix
            if len(base) + len(suffix) > 60
            else base + suffix
        )
        if counter > 9999:
            raise ValueError('CPU 코드를 생성하지 못했습니다.')


def _assert_unique_code(conn: sqlite3.Connection, code: str, record_id: Optional[int] = None) -> None:
    row = conn.execute(
        f"SELECT id FROM {TABLE_NAME} WHERE cpu_code = ?",
        (code,),
    ).fetchone()
    if row and (record_id is None or row['id'] != record_id):
        raise ValueError('이미 사용 중인 CPU 코드입니다.')


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}
    qty = row['cpu_count'] or 0
    remark = row['remark'] or ''
    manufacturer_name = row['manufacturer_name'] if 'manufacturer_name' in row.keys() else ''
    # TPMC fields (may not exist in older DBs)
    ref_core = None
    ref_tpmc = None
    try:
        ref_core = row['reference_core_count']
    except (IndexError, KeyError):
        pass
    try:
        ref_tpmc = row['reference_tpmc']
    except (IndexError, KeyError):
        pass
    per_core_tpmc = None
    if ref_core and ref_tpmc and ref_core > 0:
        per_core_tpmc = round(ref_tpmc / ref_core, 4)
    return {
        'id': row['id'],
        'cpu_code': row['cpu_code'],
        'model_name': row['model_name'],
        'model': row['model_name'],
        'spec_summary': row['spec_summary'] or '',
        'spec': row['spec_summary'] or '',
        'manufacturer_code': row['manufacturer_code'],
        'manufacturer_name': manufacturer_name or '',
        'vendor': manufacturer_name or '',
        'part_number': row['part_number'] or '',
        'part_no': row['part_number'] or '',
        'cpu_count': qty,
        'qty': qty,
        'reference_core_count': ref_core,
        'reference_tpmc': ref_tpmc,
        'per_core_tpmc': per_core_tpmc,
        'remark': remark,
        'note': remark,
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
    }


def _prepare_payload(data: Dict[str, Any], *, require_all: bool = False) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    mapping = {
        'cpu_code': ['cpu_code', 'code'],
        'model_name': ['model_name', 'model', 'name'],
        'spec_summary': ['spec_summary', 'spec', 'specs', 'specification'],
        'manufacturer_code': ['manufacturer_code', 'vendor_code'],
        'manufacturer_name': ['manufacturer_name', 'vendor', 'manufacturer'],
        'part_number': ['part_number', 'part_no'],
        'cpu_count': ['cpu_count', 'qty', 'count'],
        'reference_core_count': ['reference_core_count', 'ref_core_count', 'core_count'],
        'reference_tpmc': ['reference_tpmc', 'ref_tpmc'],
        'remark': ['remark', 'note', 'description'],
    }
    for column, aliases in mapping.items():
        for alias in aliases:
            if alias in data and data.get(alias) not in (None, ''):
                payload[column] = data[alias]
                break
    if require_all:
        missing = [key for key in ('model_name',) if not payload.get(key)]
        if missing:
            raise ValueError('필수 필드가 누락되었습니다: ' + ', '.join(missing))
        if not payload.get('manufacturer_code') and not payload.get('manufacturer_name'):
            raise ValueError('제조사 정보를 입력하세요.')
    if 'cpu_count' in payload:
        payload['cpu_count'] = _sanitize_int(payload['cpu_count'])
    if 'reference_core_count' in payload:
        payload['reference_core_count'] = _sanitize_int(payload['reference_core_count']) or None
    if 'reference_tpmc' in payload:
        try:
            val = payload['reference_tpmc']
            payload['reference_tpmc'] = float(val) if val not in (None, '') else None
        except (TypeError, ValueError):
            payload['reference_tpmc'] = None
    return payload


def _resolve_manufacturer_code(conn: sqlite3.Connection, payload: Dict[str, Any]) -> str:
    candidate = (payload.get('manufacturer_code') or '').strip()
    if candidate:
        row = conn.execute(
            f"SELECT manufacturer_code FROM {MANUFACTURER_TABLE} WHERE manufacturer_code = ? AND is_deleted = 0",
            (candidate,),
        ).fetchone()
        if not row:
            raise ValueError('등록되지 않은 제조사 코드입니다.')
        return row['manufacturer_code']
    name = (payload.get('manufacturer_name') or '').strip()
    if not name:
        raise ValueError('제조사 정보를 입력하세요.')
    row = conn.execute(
        f"SELECT manufacturer_code FROM {MANUFACTURER_TABLE} WHERE manufacturer_name = ? AND is_deleted = 0",
        (name,),
    ).fetchone()
    if not row:
        row = conn.execute(
            f"SELECT manufacturer_code FROM {MANUFACTURER_TABLE} WHERE manufacturer_code = ? AND is_deleted = 0",
            (name,),
        ).fetchone()
    if not row:
        legacy_name = name
        if '_' in name:
            head, tail = name.rsplit('_', 1)
            if tail.isdigit() and head.strip():
                legacy_name = head.strip()
        if legacy_name != name:
            row = conn.execute(
                f"SELECT manufacturer_code FROM {MANUFACTURER_TABLE} WHERE manufacturer_name = ? AND is_deleted = 0",
                (legacy_name,),
            ).fetchone()
            if not row:
                row = conn.execute(
                    f"SELECT manufacturer_code FROM {MANUFACTURER_TABLE} WHERE manufacturer_code = ? AND is_deleted = 0",
                    (legacy_name,),
                ).fetchone()
    if not row:
        # Legacy data may reference soft-deleted manufacturers; allow resolve as a fallback.
        row = conn.execute(
            f"SELECT manufacturer_code FROM {MANUFACTURER_TABLE} WHERE manufacturer_name = ? ORDER BY is_deleted ASC, id ASC LIMIT 1",
            (name,),
        ).fetchone()
    if not row:
        row = conn.execute(
            f"SELECT manufacturer_code FROM {MANUFACTURER_TABLE} WHERE manufacturer_code = ? ORDER BY is_deleted ASC, id ASC LIMIT 1",
            (name,),
        ).fetchone()
    if not row and legacy_name != name:
        row = conn.execute(
            f"SELECT manufacturer_code FROM {MANUFACTURER_TABLE} WHERE manufacturer_name = ? ORDER BY is_deleted ASC, id ASC LIMIT 1",
            (legacy_name,),
        ).fetchone()
        if not row:
            row = conn.execute(
                f"SELECT manufacturer_code FROM {MANUFACTURER_TABLE} WHERE manufacturer_code = ? ORDER BY is_deleted ASC, id ASC LIMIT 1",
                (legacy_name,),
            ).fetchone()
    if row:
        return row['manufacturer_code']
    raise ValueError('제조사 정보를 찾을 수 없습니다.')


def init_cmp_cpu_type_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(CREATE_TABLE_SQL)
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_code ON {TABLE_NAME}(cpu_code)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_deleted ON {TABLE_NAME}(is_deleted)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_manufacturer ON {TABLE_NAME}(manufacturer_code)"
            )
            # TPMC columns backfill
            try:
                cols = {r[1] for r in conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall()}
                if 'reference_core_count' not in cols:
                    conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN reference_core_count INTEGER")
                if 'reference_tpmc' not in cols:
                    conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN reference_tpmc REAL")
            except Exception:
                logger.debug('TPMC column migration skipped for %s', TABLE_NAME)
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def list_cmp_cpu_types(
    app=None,
    *,
    search: Optional[str] = None,
    include_deleted: bool = False,
    field: Optional[str] = None,
) -> List[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        clauses = ['1=1' if include_deleted else 'c.is_deleted = 0']
        params: List[Any] = []
        if search:
            like = f"%{search}%"
            f = (field or '').strip().lower()
            if f in ('model', 'model_name'):
                clauses.append('c.model_name LIKE ?')
                params.append(like)
            elif f in ('spec', 'spec_summary'):
                clauses.append('c.spec_summary LIKE ?')
                params.append(like)
            elif f in ('vendor', 'manufacturer'):
                clauses.append('(c.manufacturer_code LIKE ? OR m.manufacturer_name LIKE ?)')
                params.extend([like, like])
            else:
                # Backwards compatible: broad search across common columns
                clauses.append('(' + ' OR '.join([
                    'c.cpu_code LIKE ?',
                    'c.model_name LIKE ?',
                    'c.spec_summary LIKE ?',
                    'c.manufacturer_code LIKE ?',
                    'c.part_number LIKE ?',
                    'c.remark LIKE ?',
                    'm.manufacturer_name LIKE ?',
                ]) + ')')
                params.extend([like] * 7)
        query = (
            f"SELECT c.id, c.cpu_code, c.model_name, c.spec_summary, c.manufacturer_code, c.part_number, "
            f"c.cpu_count, c.reference_core_count, c.reference_tpmc, c.remark, "
            f"c.created_at, c.created_by, c.updated_at, c.updated_by, c.is_deleted, "
            f"m.manufacturer_name, "
            f"0 AS usage_count "
            f"FROM {TABLE_NAME} c "
            f"LEFT JOIN {MANUFACTURER_TABLE} m ON m.manufacturer_code = c.manufacturer_code AND m.is_deleted = 0 "
            f"WHERE {' AND '.join(clauses)} ORDER BY c.id DESC"
        )
        rows = conn.execute(query, params).fetchall()
        return [_row_to_dict(row) for row in rows]


def get_cmp_cpu_type(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT c.id, c.cpu_code, c.model_name, c.spec_summary, c.manufacturer_code, c.part_number, "
            f"c.cpu_count, c.reference_core_count, c.reference_tpmc, c.remark, "
            f"c.created_at, c.created_by, c.updated_at, c.updated_by, c.is_deleted, "
            f"m.manufacturer_name "
            f"FROM {TABLE_NAME} c "
            f"LEFT JOIN {MANUFACTURER_TABLE} m ON m.manufacturer_code = c.manufacturer_code AND m.is_deleted = 0 "
            f"WHERE c.id = ?",
            (record_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def create_cmp_cpu_type(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data, require_all=True)
    model_name = payload['model_name'].strip()
    timestamp = _now()
    with _get_connection(app) as conn:
        manufacturer_code = _resolve_manufacturer_code(conn, payload)
        cpu_code = (payload.get('cpu_code') or '').strip()
        if cpu_code:
            _assert_unique_code(conn, cpu_code)
        else:
            cpu_code = _generate_unique_code(conn, model_name)
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
                (cpu_code, model_name, spec_summary, manufacturer_code, part_number,
                 cpu_count, reference_core_count, reference_tpmc, remark,
                 created_at, created_by, updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                cpu_code[:60],
                model_name,
                payload.get('spec_summary'),
                manufacturer_code,
                payload.get('part_number'),
                payload.get('cpu_count', 0),
                payload.get('reference_core_count'),
                payload.get('reference_tpmc'),
                payload.get('remark'),
                timestamp,
                actor,
                timestamp,
                actor,
            ),
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
    return get_cmp_cpu_type(new_id, app)


def update_cmp_cpu_type(record_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data, require_all=False)
    if not payload:
        return get_cmp_cpu_type(record_id, app)
    with _get_connection(app) as conn:
        updates: List[str] = []
        params: List[Any] = []
        if 'cpu_code' in payload:
            code = (payload['cpu_code'] or '').strip()
            if code:
                _assert_unique_code(conn, code, record_id)
                updates.append('cpu_code = ?')
                params.append(code[:60])
            else:
                payload.pop('cpu_code', None)
        if 'manufacturer_code' in payload or 'manufacturer_name' in payload:
            payload['manufacturer_code'] = _resolve_manufacturer_code(conn, payload)
        for column in (
            'model_name',
            'spec_summary',
            'manufacturer_code',
            'part_number',
            'cpu_count',
            'reference_core_count',
            'reference_tpmc',
            'remark',
        ):
            if column in payload:
                value = payload[column]
                if column == 'model_name' and not value:
                    raise ValueError('모델명은 비울 수 없습니다.')
                updates.append(f"{column} = ?")
                params.append(value)
        if not updates:
            return get_cmp_cpu_type(record_id, app)
        timestamp = _now()
        updates.extend(['updated_at = ?', 'updated_by = ?'])
        params.extend([timestamp, actor, record_id])
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ? AND is_deleted = 0",
            params,
        )
        if cur.rowcount == 0:
            return None
        conn.commit()
    return get_cmp_cpu_type(record_id, app)


def soft_delete_cmp_cpu_types(ids: Iterable[Any], actor: str, app=None) -> int:
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
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE id IN ({placeholders})",
            safe_ids,
        )
        conn.commit()
        return cur.rowcount
