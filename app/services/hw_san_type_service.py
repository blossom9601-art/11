import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlparse

from flask import current_app

from app.services import hw_server_type_service
from app.services.hardware_asset_service import usage_counts_by_server_code

logger = logging.getLogger(__name__)

TABLE_NAME = 'hw_san_type'
MANUFACTURER_TABLE = 'biz_vendor_manufacturer'

CREATE_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    san_code TEXT NOT NULL UNIQUE,
    model_name TEXT NOT NULL,
    manufacturer_code TEXT NOT NULL,
    san_type TEXT NOT NULL,
    release_date TEXT,
    eosl_date TEXT,
    san_count INTEGER DEFAULT 0,
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


def _san_type_to_form_factor(raw: str) -> str:
    value = (raw or '').strip()
    lowered = value.lower()
    compact = lowered.replace(' ', '').replace('-', '').replace('_', '')
    if not compact:
        return 'SAN'
    if 'director' in compact or compact in {'dir'} or '디렉터' in value:
        return 'DIRECTOR'
    if 'switch' in compact or compact in {'sw'} or '스위치' in value:
        return 'SWITCH'
    return value.upper()[:20] or 'SAN'


def _sync_hw_server_type_from_san_row(conn: sqlite3.Connection, row: Dict[str, Any], actor: str) -> None:
    """Upsert hw_server_type for a hw_san_type row.

    hardware assets store model as `server_code` and FK it to hw_server_type.
    For SAN assets, we align hw_server_type.server_code with hw_san_type.san_code
    so SAN asset inserts do not fail FK validation.
    """

    conn.execute(hw_server_type_service.CREATE_TABLE_SQL)

    san_code = (row.get('san_code') or '').strip()
    if not san_code:
        return

    model_name = (row.get('model_name') or '').strip()
    manufacturer_code = (row.get('manufacturer_code') or '').strip()
    form_factor = _san_type_to_form_factor(row.get('san_type') or '')

    timestamp = _now()
    actor = (actor or 'system').strip() or 'system'

    existing = conn.execute(
        "SELECT id FROM hw_server_type WHERE server_code = ?",
        (san_code,),
    ).fetchone()
    if existing:
        conn.execute(
            """
            UPDATE hw_server_type
               SET model_name = ?,
                   manufacturer_code = ?,
                   form_factor = ?,
                   is_deleted = 0,
                   updated_at = ?,
                   updated_by = ?
             WHERE server_code = ?
            """,
            (model_name, manufacturer_code, form_factor, timestamp, actor, san_code),
        )
        return

    conn.execute(
        """
        INSERT INTO hw_server_type
            (server_code, model_name, manufacturer_code, form_factor,
             release_date, eosl_date, server_count, remark,
             created_at, created_by, updated_at, updated_by, is_deleted)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0)
        """,
        (
            san_code[:60],
            model_name,
            manufacturer_code,
            form_factor,
            row.get('release_date'),
            row.get('eosl_date'),
            row.get('remark'),
            timestamp,
            actor,
            timestamp,
            actor,
        ),
    )


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        fallback = app.config.get('HW_SAN_TYPE_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'hw_san_type.db')

    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'hw_san_type.db')
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


def _resolve_legacy_project_root_db_path(app=None) -> Optional[str]:
    """Return the pre-fix legacy DB path used by older hw_san_type_service.

    Historically this module resolved sqlite:///dev_blossom.db under the project
    root, not Flask's instance_path. If that legacy file exists, we can migrate
    records into the canonical instance DB to avoid FK mismatches.
    """
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        return None
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return None
    if netloc not in ('', 'localhost'):
        # Legacy behavior didn't support remote sqlite netlocs.
        return None
    relative = path.lstrip('/')
    if not relative:
        return None
    return os.path.abspath(os.path.join(_project_root(app), relative))


def _maybe_migrate_legacy_project_root_data(app=None) -> None:
    """Best-effort: migrate hw_san_type rows from legacy project DB into instance DB."""
    app = app or current_app
    legacy_path = _resolve_legacy_project_root_db_path(app)
    current_path = _resolve_db_path(app)
    if not legacy_path or os.path.abspath(legacy_path) == os.path.abspath(current_path):
        return
    if not os.path.exists(legacy_path):
        return

    try:
        with _get_connection(app) as conn:
            conn.execute(CREATE_TABLE_SQL)
            conn.execute(hw_server_type_service.CREATE_TABLE_SQL)

            has_any = conn.execute(
                f"SELECT 1 FROM {TABLE_NAME} WHERE is_deleted = 0 LIMIT 1"
            ).fetchone()
            if has_any:
                return

            legacy = sqlite3.connect(legacy_path)
            legacy.row_factory = sqlite3.Row
            try:
                legacy_has_table = legacy.execute(
                    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
                    (TABLE_NAME,),
                ).fetchone()
                if not legacy_has_table:
                    return
                rows = legacy.execute(
                    f"SELECT san_code, model_name, manufacturer_code, san_type, release_date, eosl_date, san_count, remark, created_at, created_by, updated_at, updated_by, is_deleted "
                    f"FROM {TABLE_NAME} WHERE is_deleted = 0"
                ).fetchall()
            finally:
                try:
                    legacy.close()
                except Exception:
                    pass

            if not rows:
                return

            timestamp = _now()
            inserted = 0
            for row in rows:
                r = dict(row)
                conn.execute(
                    f"""
                    INSERT OR IGNORE INTO {TABLE_NAME}
                        (san_code, model_name, manufacturer_code, san_type,
                         release_date, eosl_date, san_count, remark,
                         created_at, created_by, updated_at, updated_by, is_deleted)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                    """,
                    (
                        (r.get('san_code') or '').strip(),
                        (r.get('model_name') or '').strip(),
                        (r.get('manufacturer_code') or '').strip(),
                        (r.get('san_type') or '').strip(),
                        r.get('release_date') or None,
                        r.get('eosl_date') or None,
                        int(r.get('san_count') or 0),
                        r.get('remark') or '',
                        r.get('created_at') or timestamp,
                        (r.get('created_by') or 'system').strip() or 'system',
                        r.get('updated_at') or timestamp,
                        (r.get('updated_by') or 'system').strip() or 'system',
                    ),
                )
                inserted += conn.total_changes

            # Ensure hw_server_type is populated for FK satisfaction.
            try:
                new_rows = conn.execute(
                    f"SELECT san_code, model_name, manufacturer_code, san_type, release_date, eosl_date, remark "
                    f"FROM {TABLE_NAME} WHERE is_deleted = 0"
                ).fetchall()
                for row in new_rows:
                    _sync_hw_server_type_from_san_row(conn, dict(row), actor='system')
            except Exception:
                logger.exception('Failed to backfill hw_server_type after legacy migration')

            conn.commit()
            if inserted:
                logger.info('Migrated %s hw_san_type rows from legacy DB %s -> %s', inserted, legacy_path, current_path)
    except Exception:
        logger.exception('Legacy hw_san_type migration failed (non-fatal)')


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
    base = (seed or 'SAN').upper()
    base = re.sub(r'[^A-Z0-9]+', '_', base).strip('_') or 'SAN'
    return base[:60]


def _generate_unique_code(conn: sqlite3.Connection, seed: str) -> str:
    base = _normalize_code(seed)
    candidate = base
    counter = 1
    while True:
        row = conn.execute(
            f"SELECT 1 FROM {TABLE_NAME} WHERE san_code = ?",
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
            raise ValueError('고유 SAN 코드를 생성하지 못했습니다.')


def _assert_unique_code(conn: sqlite3.Connection, code: str, record_id: Optional[int] = None) -> None:
    row = conn.execute(
        f"SELECT id FROM {TABLE_NAME} WHERE san_code = ?",
        (code,),
    ).fetchone()
    if row and (record_id is None or row['id'] != record_id):
        raise ValueError('이미 사용 중인 SAN 코드입니다.')


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}
    return {
        'id': row['id'],
        'san_code': row['san_code'],
        'model_name': row['model_name'],
        'manufacturer_code': row['manufacturer_code'],
        'san_type': row['san_type'],
        'release_date': row['release_date'] or '',
        'eosl_date': row['eosl_date'] or '',
        'san_count': row['san_count'] or 0,
        'remark': row['remark'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
    }


def _prepare_payload(data: Dict[str, Any], *, require_all: bool = False) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    mapping = {
        'san_code': ['san_code', 'code'],
        'model_name': ['model_name', 'model'],
        'manufacturer_code': ['manufacturer_code', 'vendor_code'],
        'manufacturer_name': ['manufacturer_name', 'vendor', 'manufacturer'],
        'san_type': ['san_type', 'hw_type', 'type'],
        'release_date': ['release_date'],
        'eosl_date': ['eosl_date', 'eosl'],
        'san_count': ['san_count', 'qty'],
        'remark': ['remark', 'note'],
    }
    for column, aliases in mapping.items():
        for alias in aliases:
            if alias in data and data.get(alias) not in (None, ''):
                payload[column] = data[alias]
                break
    if require_all:
        missing = [key for key in ('model_name', 'san_type') if not payload.get(key)]
        if missing:
            raise ValueError('필수 필드가 누락되었습니다: ' + ', '.join(missing))
    if 'san_count' in payload:
        payload['san_count'] = _sanitize_int(payload['san_count'])
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


def init_hw_san_type_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            # Best-effort: if older versions wrote hw_san_type into a project-root DB,
            # migrate that data into the canonical instance DB before we proceed.
            _maybe_migrate_legacy_project_root_data(app)
            conn.execute(CREATE_TABLE_SQL)
            conn.execute(hw_server_type_service.CREATE_TABLE_SQL)
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_code ON {TABLE_NAME}(san_code)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_deleted ON {TABLE_NAME}(is_deleted)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_manufacturer ON {TABLE_NAME}(manufacturer_code)"
            )

            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def list_hw_san_types(app=None, *, search: Optional[str] = None, include_deleted: bool = False) -> List[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        clauses = ['1=1' if include_deleted else 'is_deleted = 0']
        params: List[Any] = []
        if search:
            like = f"%{search}%"
            clauses.append('(' + ' OR '.join([
                'san_code LIKE ?',
                'model_name LIKE ?',
                'manufacturer_code LIKE ?',
                'san_type LIKE ?',
                'remark LIKE ?'
            ]) + ')')
            params.extend([like] * 5)
        query = (
            f"SELECT id, san_code, model_name, manufacturer_code, san_type, release_date, eosl_date, "
            f"san_count, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {TABLE_NAME} WHERE {' AND '.join(clauses)} ORDER BY id DESC"
        )
        rows = conn.execute(query, params).fetchall()
        items = [_row_to_dict(row) for row in rows]

    try:
        counts = usage_counts_by_server_code(app, asset_category="SAN", include_deleted=False)
    except Exception:
        logger.exception('Failed to compute hardware_asset usage counts for %s', TABLE_NAME)
        counts = {}

    for item in items:
        code = str(item.get('san_code') or '').strip()
        item['usage_count'] = int(counts.get(code, 0) or 0)
    return items


def get_hw_san_type(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT id, san_code, model_name, manufacturer_code, san_type, release_date, eosl_date, "
            f"san_count, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {TABLE_NAME} WHERE id = ?",
            (record_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def create_hw_san_type(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data, require_all=True)
    model_name = payload['model_name'].strip()
    san_type = payload['san_type'].strip()
    timestamp = _now()
    with _get_connection(app) as conn:
        manufacturer_code = _resolve_manufacturer_code(conn, payload)
        san_code = (payload.get('san_code') or '').strip()
        if san_code:
            _assert_unique_code(conn, san_code)
        else:
            san_code = _generate_unique_code(conn, model_name)
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
                (san_code, model_name, manufacturer_code, san_type, release_date, eosl_date,
                 san_count, remark, created_at, created_by, updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                san_code[:60],
                model_name,
                manufacturer_code,
                san_type,
                payload.get('release_date'),
                payload.get('eosl_date'),
                payload.get('san_count', 0),
                payload.get('remark'),
                timestamp,
                actor,
                timestamp,
                actor,
            ),
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        _sync_hw_server_type_from_san_row(
            conn,
            {
                'san_code': san_code,
                'model_name': model_name,
                'manufacturer_code': manufacturer_code,
                'san_type': san_type,
                'release_date': payload.get('release_date'),
                'eosl_date': payload.get('eosl_date'),
                'remark': payload.get('remark'),
            },
            actor,
        )
        conn.commit()
    return get_hw_san_type(new_id, app)


def update_hw_san_type(record_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data, require_all=False)
    if not payload:
        return get_hw_san_type(record_id, app)
    with _get_connection(app) as conn:
        before = conn.execute(
            f"SELECT san_code FROM {TABLE_NAME} WHERE id = ?",
            (record_id,),
        ).fetchone()
        before_code = (before['san_code'] if before else '') or ''

        updates: List[str] = []
        params: List[Any] = []
        new_san_code: Optional[str] = None
        if 'san_code' in payload:
            code = (payload['san_code'] or '').strip()
            if code:
                _assert_unique_code(conn, code, record_id)
                updates.append('san_code = ?')
                params.append(code[:60])
                new_san_code = code[:60]
            else:
                payload.pop('san_code', None)
        if 'manufacturer_code' in payload or 'manufacturer_name' in payload:
            payload['manufacturer_code'] = _resolve_manufacturer_code(conn, payload)
        for column in (
            'model_name',
            'manufacturer_code',
            'san_type',
            'release_date',
            'eosl_date',
            'san_count',
            'remark',
        ):
            if column in payload:
                value = payload[column]
                if column in ('model_name', 'san_type') and not value:
                    raise ValueError('필수 필드를 비울 수 없습니다.')
                updates.append(f"{column} = ?")
                params.append(value)
        if not updates:
            return get_hw_san_type(record_id, app)
        timestamp = _now()
        updates.extend(['updated_at = ?', 'updated_by = ?'])
        params.extend([timestamp, actor, record_id])
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ? AND is_deleted = 0",
            params,
        )
        if cur.rowcount == 0:
            return None

        # Best-effort migrate hw_server_type code when san_code changes.
        try:
            old_code = (before_code or '').strip()
            if new_san_code and old_code and new_san_code != old_code:
                exists_old = conn.execute(
                    "SELECT 1 FROM hw_server_type WHERE server_code = ?",
                    (old_code,),
                ).fetchone()
                exists_new = conn.execute(
                    "SELECT 1 FROM hw_server_type WHERE server_code = ?",
                    (new_san_code,),
                ).fetchone()
                if exists_old and not exists_new:
                    conn.execute(
                        "UPDATE hw_server_type SET server_code = ? WHERE server_code = ?",
                        (new_san_code, old_code),
                    )
        except Exception:
            logger.exception('Failed to migrate hw_server_type server_code on san_code change')

        after = conn.execute(
            f"SELECT san_code, model_name, manufacturer_code, san_type, release_date, eosl_date, remark "
            f"FROM {TABLE_NAME} WHERE id = ?",
            (record_id,),
        ).fetchone()
        if after:
            _sync_hw_server_type_from_san_row(conn, dict(after), actor)
        conn.commit()
    return get_hw_san_type(record_id, app)


def soft_delete_hw_san_types(ids: Iterable[Any], actor: str, app=None) -> int:
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
    now = _now()
    with _get_connection(app) as conn:
        codes = [r['san_code'] for r in conn.execute(
            f"SELECT san_code FROM {TABLE_NAME} WHERE id IN ({placeholders})", safe_ids
        ).fetchall() if r['san_code']]
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id IN ({placeholders})",
            [now, actor] + safe_ids,
        )
        if codes:
            code_ph = ','.join('?' for _ in codes)
            conn.execute(f"UPDATE hw_server_type SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE server_code IN ({code_ph})", [now, actor] + codes)
        conn.commit()
        return cur.rowcount
