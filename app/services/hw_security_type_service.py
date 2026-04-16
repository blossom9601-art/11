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

TABLE_NAME = 'hw_security_type'
MANUFACTURER_TABLE = 'biz_vendor_manufacturer'

CREATE_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    security_code TEXT NOT NULL UNIQUE,
    model_name TEXT NOT NULL,
    manufacturer_code TEXT NOT NULL,
    security_type TEXT NOT NULL,
    release_date TEXT,
    eosl_date TEXT,
    device_count INTEGER DEFAULT 0,
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


def _security_type_to_form_factor(security_type: str) -> str:
    """Map hw_security_type.security_type -> hw_server_type.form_factor.

    Security asset pages filter server models by these short codes.
    """
    raw = (security_type or '').strip()
    if not raw:
        return 'ETC'

    upper = raw.upper()
    # If the value is already one of the expected codes, keep it.
    if upper in {'FW', 'VPN', 'IDS', 'IPS', 'HSM', 'KMS', 'WIPS', 'ETC'}:
        return upper

    lowered = raw.lower()
    if lowered in {'방화벽', 'firewall'}:
        return 'FW'
    if lowered in {'vpn'}:
        return 'VPN'
    if lowered in {'ids', '침입탐지', '침입 탐지', '침입탐지시스템', '침입 탐지 시스템'}:
        return 'IDS'
    if lowered in {'ips', '침입방지', '침입 방지', '침입방지시스템', '침입 방지 시스템'}:
        return 'IPS'
    if lowered in {'hsm'}:
        return 'HSM'
    if lowered in {'kms'}:
        return 'KMS'
    if lowered in {'wips'}:
        return 'WIPS'
    if lowered in {'etc', '기타'}:
        return 'ETC'

    return 'ETC'


def _sync_hw_server_type_from_security_row(conn: sqlite3.Connection, row: Dict[str, Any], actor: str) -> None:
    """Upsert a hw_server_type row for a hw_security_type row.

    We align hw_server_type.server_code with hw_security_type.security_code so
    the hardware_asset.server_code FK is satisfied when saving assets.
    """
    conn.execute(hw_server_type_service.CREATE_TABLE_SQL)

    security_code = (row.get('security_code') or '').strip()
    if not security_code:
        return

    model_name = (row.get('model_name') or '').strip()
    manufacturer_code = (row.get('manufacturer_code') or '').strip()
    form_factor = _security_type_to_form_factor(row.get('security_type') or '')

    timestamp = _now()
    actor = (actor or 'system').strip() or 'system'

    existing = conn.execute(
        "SELECT id FROM hw_server_type WHERE server_code = ?",
        (security_code,),
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
            (model_name, manufacturer_code, form_factor, timestamp, actor, security_code),
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
            security_code[:60],
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
        fallback = app.config.get('HW_SECURITY_TYPE_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'hw_security_type.db')

    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'hw_security_type.db')
    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"

    # Keep sqlite path resolution consistent with Flask-SQLAlchemy and the other hw_* services:
    # - For sqlite URIs like "sqlite:///dev_blossom.db", Flask resolves the file under instance_path.
    # - This service layer must point at the same DB so hw_security_type -> hw_server_type sync and
    #   hardware_asset FK checks happen against the same master data.
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
    base = (seed or 'SECURITY').upper()
    base = re.sub(r'[^A-Z0-9]+', '_', base).strip('_') or 'SECURITY'
    return base[:60]


def _generate_unique_code(conn: sqlite3.Connection, seed: str) -> str:
    base = _normalize_code(seed)
    candidate = base
    counter = 1
    while True:
        row = conn.execute(
            f"SELECT 1 FROM {TABLE_NAME} WHERE security_code = ?",
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
            raise ValueError('고유 보안장비 코드를 생성하지 못했습니다.')


def _assert_unique_code(conn: sqlite3.Connection, code: str, record_id: Optional[int] = None) -> None:
    row = conn.execute(
        f"SELECT id FROM {TABLE_NAME} WHERE security_code = ?",
        (code,),
    ).fetchone()
    if row and (record_id is None or row['id'] != record_id):
        raise ValueError('이미 사용 중인 보안장비 코드입니다.')


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}
    return {
        'id': row['id'],
        'security_code': row['security_code'],
        'model_name': row['model_name'],
        'manufacturer_code': row['manufacturer_code'],
        'security_type': row['security_type'],
        'release_date': row['release_date'] or '',
        'eosl_date': row['eosl_date'] or '',
        'device_count': row['device_count'] or 0,
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
        'security_code': ['security_code', 'code'],
        'model_name': ['model_name', 'model'],
        'manufacturer_code': ['manufacturer_code', 'vendor_code'],
        'manufacturer_name': ['manufacturer_name', 'vendor', 'manufacturer'],
        'security_type': ['security_type', 'hw_type', 'type'],
        'release_date': ['release_date'],
        'eosl_date': ['eosl_date', 'eosl'],
        'device_count': ['device_count', 'qty', 'count'],
        'remark': ['remark', 'note'],
    }
    for column, aliases in mapping.items():
        for alias in aliases:
            if alias in data and data.get(alias) not in (None, ''):
                payload[column] = data[alias]
                break
    if require_all:
        missing = [key for key in ('model_name', 'security_type') if not payload.get(key)]
        if missing:
            raise ValueError('필수 필드가 누락되었습니다: ' + ', '.join(missing))
    if 'device_count' in payload:
        payload['device_count'] = _sanitize_int(payload['device_count'])
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


def init_hw_security_type_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(CREATE_TABLE_SQL)
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_code ON {TABLE_NAME}(security_code)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_deleted ON {TABLE_NAME}(is_deleted)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_manufacturer ON {TABLE_NAME}(manufacturer_code)"
            )

            # One-time migration: earlier versions of this service resolved sqlite:///dev_blossom.db
            # under the project root instead of Flask's instance_path. If both DB files exist, we
            # might have hw_security_type rows stranded in the legacy project-root DB, which then
            # causes hardware_asset FK failures (server_code -> hw_server_type).
            try:
                active_path = _resolve_db_path(app)
                parsed = urlparse(app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db'))
                legacy_rel = (parsed.path or '').lstrip('/')
                legacy_path = os.path.abspath(os.path.join(_project_root(app), legacy_rel or 'dev_blossom.db'))
                if legacy_path != active_path and os.path.exists(legacy_path):
                    legacy = sqlite3.connect(legacy_path)
                    legacy.row_factory = sqlite3.Row
                    try:
                        legacy_has_table = legacy.execute(
                            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
                            (TABLE_NAME,),
                        ).fetchone()
                        if legacy_has_table:
                            legacy_rows = legacy.execute(
                                f"SELECT security_code, model_name, manufacturer_code, security_type, release_date, eosl_date, "
                                f"device_count, remark, created_at, created_by, updated_at, updated_by, is_deleted "
                                f"FROM {TABLE_NAME}"
                            ).fetchall()
                            if legacy_rows:
                                for row in legacy_rows:
                                    data = dict(row)
                                    security_code = (data.get('security_code') or '').strip()
                                    manufacturer_code = (data.get('manufacturer_code') or '').strip()
                                    if not security_code or not manufacturer_code:
                                        continue
                                    # Skip rows that would violate FK in the active DB.
                                    m_exists = conn.execute(
                                        f"SELECT 1 FROM {MANUFACTURER_TABLE} WHERE manufacturer_code = ? LIMIT 1",
                                        (manufacturer_code,),
                                    ).fetchone()
                                    if not m_exists:
                                        continue
                                    conn.execute(
                                        f"""
                                        INSERT OR IGNORE INTO {TABLE_NAME}
                                            (security_code, model_name, manufacturer_code, security_type,
                                             release_date, eosl_date, device_count, remark,
                                             created_at, created_by, updated_at, updated_by, is_deleted)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                        """,
                                        (
                                            security_code[:60],
                                            (data.get('model_name') or '').strip() or security_code,
                                            manufacturer_code,
                                            (data.get('security_type') or '').strip() or 'ETC',
                                            data.get('release_date'),
                                            data.get('eosl_date'),
                                            int(data.get('device_count') or 0),
                                            data.get('remark'),
                                            data.get('created_at') or _now(),
                                            (data.get('created_by') or 'system').strip() or 'system',
                                            data.get('updated_at') or data.get('created_at') or _now(),
                                            (data.get('updated_by') or data.get('created_by') or 'system').strip() or 'system',
                                            int(data.get('is_deleted') or 0),
                                        ),
                                    )
                    finally:
                        try:
                            legacy.close()
                        except Exception:
                            pass
            except Exception:
                logger.exception('Failed to migrate legacy hw_security_type DB data')

            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def list_hw_security_types(app=None, *, search: Optional[str] = None, include_deleted: bool = False) -> List[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        clauses = ['1=1' if include_deleted else 'is_deleted = 0']
        params: List[Any] = []
        if search:
            like = f"%{search}%"
            clauses.append('(' + ' OR '.join([
                'security_code LIKE ?',
                'model_name LIKE ?',
                'manufacturer_code LIKE ?',
                'security_type LIKE ?',
                'remark LIKE ?'
            ]) + ')')
            params.extend([like] * 5)
        query = (
            f"SELECT id, security_code, model_name, manufacturer_code, security_type, release_date, eosl_date, "
            f"device_count, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {TABLE_NAME} WHERE {' AND '.join(clauses)} ORDER BY id DESC"
        )
        rows = conn.execute(query, params).fetchall()
        items = [_row_to_dict(row) for row in rows]

    try:
        counts = usage_counts_by_server_code(app, asset_category="SECURITY", include_deleted=False)
    except Exception:
        logger.exception('Failed to compute hardware_asset usage counts for %s', TABLE_NAME)
        counts = {}

    for item in items:
        code = str(item.get('security_code') or '').strip()
        item['usage_count'] = int(counts.get(code, 0) or 0)
    return items


def get_hw_security_type(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT id, security_code, model_name, manufacturer_code, security_type, release_date, eosl_date, "
            f"device_count, remark, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {TABLE_NAME} WHERE id = ?",
            (record_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def create_hw_security_type(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data, require_all=True)
    model_name = payload['model_name'].strip()
    security_type = payload['security_type'].strip()
    timestamp = _now()
    with _get_connection(app) as conn:
        manufacturer_code = _resolve_manufacturer_code(conn, payload)
        security_code = (payload.get('security_code') or '').strip()
        if security_code:
            _assert_unique_code(conn, security_code)
        else:
            security_code = _generate_unique_code(conn, model_name)
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
                (security_code, model_name, manufacturer_code, security_type, release_date, eosl_date,
                 device_count, remark, created_at, created_by, updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                security_code[:60],
                model_name,
                manufacturer_code,
                security_type,
                payload.get('release_date'),
                payload.get('eosl_date'),
                payload.get('device_count', 0),
                payload.get('remark'),
                timestamp,
                actor,
                timestamp,
                actor,
            ),
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]

        _sync_hw_server_type_from_security_row(
            conn,
            {
                'security_code': security_code,
                'model_name': model_name,
                'manufacturer_code': manufacturer_code,
                'security_type': security_type,
                'release_date': payload.get('release_date'),
                'eosl_date': payload.get('eosl_date'),
                'remark': payload.get('remark'),
            },
            actor,
        )

        conn.commit()
    return get_hw_security_type(new_id, app)


def update_hw_security_type(record_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data, require_all=False)
    if not payload:
        return get_hw_security_type(record_id, app)
    with _get_connection(app) as conn:
        before = conn.execute(
            f"SELECT security_code, model_name, manufacturer_code, security_type, release_date, eosl_date, remark "
            f"FROM {TABLE_NAME} WHERE id = ? AND is_deleted = 0",
            (record_id,),
        ).fetchone()
        updates: List[str] = []
        params: List[Any] = []
        if 'security_code' in payload:
            code = (payload['security_code'] or '').strip()
            if code:
                _assert_unique_code(conn, code, record_id)
                updates.append('security_code = ?')
                params.append(code[:60])
            else:
                payload.pop('security_code', None)
        if 'manufacturer_code' in payload or 'manufacturer_name' in payload:
            payload['manufacturer_code'] = _resolve_manufacturer_code(conn, payload)
        for column in (
            'model_name',
            'manufacturer_code',
            'security_type',
            'release_date',
            'eosl_date',
            'device_count',
            'remark',
        ):
            if column in payload:
                value = payload[column]
                if column in ('model_name', 'security_type') and not value:
                    raise ValueError('필수 필드를 비울 수 없습니다.')
                updates.append(f"{column} = ?")
                params.append(value)
        if not updates:
            return get_hw_security_type(record_id, app)
        timestamp = _now()
        updates.extend(['updated_at = ?', 'updated_by = ?'])
        params.extend([timestamp, actor, record_id])
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ? AND is_deleted = 0",
            params,
        )
        if cur.rowcount == 0:
            return None

        after = conn.execute(
            f"SELECT security_code, model_name, manufacturer_code, security_type, release_date, eosl_date, remark "
            f"FROM {TABLE_NAME} WHERE id = ? AND is_deleted = 0",
            (record_id,),
        ).fetchone()

        try:
            if before and after:
                before_code = (before['security_code'] or '').strip()
                after_code = (after['security_code'] or '').strip()
                if before_code and after_code and before_code != after_code:
                    exists = conn.execute(
                        "SELECT 1 FROM hw_server_type WHERE server_code = ?",
                        (before_code,),
                    ).fetchone()
                    if exists:
                        collision = conn.execute(
                            "SELECT 1 FROM hw_server_type WHERE server_code = ?",
                            (after_code,),
                        ).fetchone()
                        if not collision:
                            conn.execute(
                                "UPDATE hw_server_type SET server_code = ? WHERE server_code = ?",
                                (after_code, before_code),
                            )
        except Exception:
            logger.exception('Failed to migrate hw_server_type server_code on security_code change')

        if after:
            _sync_hw_server_type_from_security_row(conn, dict(after), actor)

        conn.commit()
    return get_hw_security_type(record_id, app)


def soft_delete_hw_security_types(ids: Iterable[Any], actor: str, app=None) -> int:
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
        codes = [r['security_code'] for r in conn.execute(
            f"SELECT security_code FROM {TABLE_NAME} WHERE id IN ({placeholders})", safe_ids
        ).fetchall() if r['security_code']]
        cur = conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE id IN ({placeholders})",
            safe_ids,
        )
        if codes:
            code_ph = ','.join('?' for _ in codes)
            conn.execute(f"DELETE FROM hw_server_type WHERE server_code IN ({code_ph})", codes)
        conn.commit()
        return cur.rowcount
