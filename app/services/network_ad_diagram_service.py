import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'network_ad_diagram'
AD_TABLE = 'network_ad_policy'
VALID_ENTRY_TYPES = {'DIAGRAM', 'ATTACHMENT', 'REFERENCE'}
DEFAULT_ENTRY_TYPE = 'ATTACHMENT'
ORDER_BY_SQL = 'sort_order ASC, id DESC'


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    override = app.config.get('NETWORK_AD_SQLITE_PATH')
    if override:
        return os.path.abspath(override)

    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        return os.path.join(app.instance_path, 'dev_blossom.db')

    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'dev_blossom.db')
    if netloc and netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    # Flask-SQLAlchemy treats relative SQLite filenames as relative to instance_path.
    relative = path.lstrip('/')
    if relative and not os.path.isabs(relative):
        if os.path.basename(relative) == relative:
            return os.path.abspath(os.path.join(app.instance_path, relative))
        return os.path.abspath(os.path.join(os.path.abspath(os.path.join(app.root_path, os.pardir)), relative))

    if os.path.isabs(path):
        return os.path.abspath(path)
    return os.path.abspath(os.path.join(app.instance_path, 'dev_blossom.db'))


def _legacy_project_db_path(app=None) -> Optional[str]:
    app = app or current_app
    override = app.config.get('NETWORK_AD_SQLITE_PATH')
    if override:
        return None
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        return None
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return None
    if netloc and netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    relative = (path or '').lstrip('/')
    if not relative or os.path.isabs(relative):
        return None
    project_root = os.path.abspath(os.path.join(app.root_path, os.pardir))
    return os.path.abspath(os.path.join(project_root, relative))


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
        logger.warning('Could not enable FK enforcement for %s table', TABLE_NAME)
    return conn


def _normalize_entry_type(value: Optional[str]) -> str:
    if not value:
        return DEFAULT_ENTRY_TYPE
    token = str(value).strip().upper()
    if token in VALID_ENTRY_TYPES:
        return token
    if token in {'DIAGRAMS', 'DIAGRAM_FILE', 'PRIMARY'}:
        return 'DIAGRAM'
    if token in {'FILES', 'ATTACHMENTS'}:
        return 'ATTACHMENT'
    return DEFAULT_ENTRY_TYPE


def _sanitize_int(value: Any, default: int = 0) -> int:
    if value in (None, ''):
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed >= 0 else 0


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    token = str(value).strip().lower()
    return token in {'1', 'true', 'yes', 'y', 'on'}


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}
    return {
        'id': row['id'],
        'ad_id': row['ad_id'],
        'entry_type': row['entry_type'],
        'title': row['title'] or '',
        'kind': row['kind'] or '',
        'description': row['description'] or '',
        'file_name': row['file_name'] or '',
        'file_path': row['file_path'] or '',
        'file_size': row['file_size'] or 0,
        'mime_type': row['mime_type'] or '',
        'is_primary': bool(row['is_primary']),
        'sort_order': row['sort_order'] or 0,
        'upload_token': row['upload_token'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'] or '',
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'] or '',
    }


def init_network_ad_diagram_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ad_id INTEGER NOT NULL,
                    entry_type TEXT NOT NULL DEFAULT 'ATTACHMENT',
                    title TEXT,
                    kind TEXT,
                    description TEXT,
                    file_name TEXT NOT NULL,
                    file_path TEXT,
                    file_size INTEGER DEFAULT 0,
                    mime_type TEXT,
                    is_primary INTEGER NOT NULL DEFAULT 0,
                    sort_order INTEGER DEFAULT 0,
                    upload_token TEXT,
                    created_by TEXT,
                    updated_by TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (ad_id) REFERENCES {AD_TABLE}(ad_id) ON DELETE CASCADE
                )
                """
            )
            conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_ad ON {TABLE_NAME}(ad_id)")
            conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_type ON {TABLE_NAME}(entry_type)")
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)

        # Best-effort: migrate legacy project-root DB rows into the current DB.
        # Avoid ATTACH/DETACH because DETACH can raise "database legacy is locked" during startup.
        try:
            legacy_path = _legacy_project_db_path(app)
            current_path = _resolve_db_path(app)
            if legacy_path and os.path.exists(legacy_path) and os.path.abspath(legacy_path) != os.path.abspath(current_path):
                legacy_conn: Optional[sqlite3.Connection] = None
                try:
                    legacy_conn = sqlite3.connect(legacy_path, timeout=1)
                    legacy_conn.row_factory = sqlite3.Row
                    legacy_conn.execute('PRAGMA query_only = ON')

                    legacy_exists = legacy_conn.execute(
                        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                        (TABLE_NAME,),
                    ).fetchone()
                    if not legacy_exists:
                        return

                    with _get_connection(app) as conn:
                        conn.execute('PRAGMA foreign_keys = OFF')
                        legacy_count = legacy_conn.execute(f"SELECT COUNT(1) FROM {TABLE_NAME}").fetchone()[0]
                        current_count = conn.execute(f"SELECT COUNT(1) FROM {TABLE_NAME}").fetchone()[0]

                        if int(legacy_count or 0) > int(current_count or 0):
                            cols_new = [r[1] for r in conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall() if r and r[1]]
                            cols_old = [r[1] for r in legacy_conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall() if r and r[1]]
                            cols = [c for c in cols_new if c in set(cols_old)]
                            if cols:
                                col_sql = ', '.join(cols)
                                placeholders = ', '.join(['?'] * len(cols))
                                legacy_rows = legacy_conn.execute(f"SELECT {col_sql} FROM {TABLE_NAME}").fetchall()
                                if legacy_rows:
                                    payload = [tuple(row[c] for c in cols) for row in legacy_rows]
                                    conn.executemany(
                                        f"INSERT OR IGNORE INTO {TABLE_NAME} ({col_sql}) VALUES ({placeholders})",
                                        payload,
                                    )

                        conn.execute('PRAGMA foreign_keys = ON')
                        conn.commit()
                finally:
                    if legacy_conn is not None:
                        legacy_conn.close()
        except Exception:
            logger.exception('Legacy migration (AD diagram) failed')
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def _fetch_row(diagram_id: int, conn: sqlite3.Connection) -> Optional[sqlite3.Row]:
    return conn.execute(
        f"SELECT id, ad_id, entry_type, title, kind, description, file_name, file_path, file_size, mime_type, is_primary, sort_order, upload_token, created_at, created_by, updated_at, updated_by FROM {TABLE_NAME} WHERE id = ?",
        (diagram_id,),
    ).fetchone()


def list_network_ad_diagrams(
    ad_id: int,
    *,
    entry_type: Optional[str] = None,
    is_primary: Optional[bool] = None,
    app=None,
) -> List[Dict[str, Any]]:
    if not ad_id:
        return []
    clauses = ['ad_id = ?']
    params: List[Any] = [ad_id]
    if entry_type:
        clauses.append('entry_type = ?')
        params.append(_normalize_entry_type(entry_type))
    if is_primary is not None:
        clauses.append('is_primary = ?')
        params.append(1 if is_primary else 0)
    where_sql = ' AND '.join(clauses)
    with _get_connection(app) as conn:
        rows = conn.execute(
            f"SELECT id, ad_id, entry_type, title, kind, description, file_name, file_path, file_size, mime_type, is_primary, sort_order, upload_token, created_at, created_by, updated_at, updated_by FROM {TABLE_NAME} WHERE {where_sql} ORDER BY {ORDER_BY_SQL}",
            params,
        ).fetchall()
    return [_row_to_dict(row) for row in rows]


def get_network_ad_diagram(diagram_id: int, app=None) -> Optional[Dict[str, Any]]:
    with _get_connection(app) as conn:
        row = _fetch_row(diagram_id, conn)
        return _row_to_dict(row) if row else None


def _ensure_ad_exists(ad_id: int, conn: sqlite3.Connection) -> None:
    exists = conn.execute(
        f"SELECT 1 FROM {AD_TABLE} WHERE ad_id = ?",
        (ad_id,),
    ).fetchone()
    if not exists:
        raise ValueError('AD 대상을 찾을 수 없습니다.')


def _prepare_payload(data: Dict[str, Any]) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}

    ad_id = data.get('ad_id') or data.get('adId')
    try:
        payload['ad_id'] = int(ad_id)
    except (TypeError, ValueError):
        payload['ad_id'] = 0
    if not payload['ad_id']:
        raise ValueError('ad_id is required.')

    entry_type = _normalize_entry_type(data.get('entry_type') or data.get('type'))
    payload['entry_type'] = entry_type

    file_name = (data.get('file_name') or data.get('fileName') or data.get('name') or '').strip()
    if not file_name:
        raise ValueError('파일명을 입력하세요.')
    payload['file_name'] = file_name

    title = (data.get('title') or data.get('label') or file_name).strip()
    payload['title'] = title or file_name

    payload['description'] = (data.get('description') or data.get('desc') or data.get('note') or '').strip() or None
    payload['file_path'] = (data.get('file_path') or data.get('path') or '').strip() or None
    payload['mime_type'] = (data.get('mime_type') or data.get('content_type') or data.get('contentType') or '').strip() or None
    payload['kind'] = (data.get('kind') or data.get('category') or '').strip() or None
    payload['upload_token'] = (data.get('upload_token') or data.get('uploadToken') or data.get('file_token') or data.get('fileToken') or '').strip() or None
    payload['file_size'] = _sanitize_int(data.get('file_size') or data.get('size'), 0)
    payload['sort_order'] = _sanitize_int(data.get('sort_order') or data.get('order'), 0)

    if 'is_primary' in data:
        payload['is_primary'] = 1 if _to_bool(data.get('is_primary')) else 0
    elif entry_type == 'DIAGRAM':
        payload['is_primary'] = 1
    else:
        payload['is_primary'] = 0

    return payload


def create_network_ad_diagram(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    if not data:
        raise ValueError('요청 본문이 비어 있습니다.')

    payload = _prepare_payload(data)
    actor_name = (actor or 'system').strip() or 'system'
    timestamp = _now()
    app = app or current_app

    with _get_connection(app) as conn:
        _ensure_ad_exists(payload['ad_id'], conn)

        if payload['is_primary'] and payload['entry_type'] == 'DIAGRAM':
            conn.execute(
                f"UPDATE {TABLE_NAME} SET is_primary = 0, updated_at = ?, updated_by = ? WHERE ad_id = ? AND entry_type = 'DIAGRAM'",
                (timestamp, actor_name, payload['ad_id']),
            )

        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
              (ad_id, entry_type, title, kind, description, file_name, file_path, file_size, mime_type, is_primary, sort_order, upload_token, created_by, updated_by, created_at, updated_at)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload['ad_id'],
                payload['entry_type'],
                payload['title'],
                payload['kind'],
                payload['description'],
                payload['file_name'],
                payload['file_path'],
                payload['file_size'],
                payload['mime_type'],
                payload['is_primary'],
                payload['sort_order'],
                payload['upload_token'],
                actor_name,
                actor_name,
                timestamp,
                timestamp,
            ),
        )
        diagram_id = int(cur.lastrowid)
        conn.commit()
        row = _fetch_row(diagram_id, conn)
        record = _row_to_dict(row) if row else {}

    try:
        from app.services.network_ad_service import append_network_ad_log

        append_network_ad_log(
            record.get('ad_id') or payload['ad_id'],
            tab_key='gov_ad_policy_file',
            entity='DIAGRAM',
            entity_id=record.get('id') or None,
            action='CREATE',
            actor=actor_name,
            message=f"구성/파일 등록 ({record.get('file_name') or ''})".strip(),
            diff={
                'created': record,
            },
            app=app,
        )
    except Exception:
        logger.exception('Failed to append network AD diagram create log')

    return record


def update_network_ad_diagram(diagram_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    if not data:
        raise ValueError('요청 본문이 비어 있습니다.')

    actor_name = (actor or 'system').strip() or 'system'
    timestamp = _now()
    payload = _prepare_payload(data)

    app = app or current_app
    with _get_connection(app) as conn:
        existing = _fetch_row(diagram_id, conn)
        if not existing:
            return None

        _ensure_ad_exists(payload['ad_id'], conn)

        if payload['is_primary'] and payload['entry_type'] == 'DIAGRAM':
            conn.execute(
                f"UPDATE {TABLE_NAME} SET is_primary = 0, updated_at = ?, updated_by = ? WHERE ad_id = ? AND entry_type = 'DIAGRAM'",
                (timestamp, actor_name, payload['ad_id']),
            )

        conn.execute(
            f"""
            UPDATE {TABLE_NAME}
            SET ad_id = ?, entry_type = ?, title = ?, kind = ?, description = ?, file_name = ?, file_path = ?, file_size = ?, mime_type = ?, is_primary = ?, sort_order = ?, upload_token = ?, updated_by = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                payload['ad_id'],
                payload['entry_type'],
                payload['title'],
                payload['kind'],
                payload['description'],
                payload['file_name'],
                payload['file_path'],
                payload['file_size'],
                payload['mime_type'],
                payload['is_primary'],
                payload['sort_order'],
                payload['upload_token'],
                actor_name,
                timestamp,
                diagram_id,
            ),
        )
        before = _row_to_dict(existing)
        conn.commit()
        row = _fetch_row(diagram_id, conn)
        record = _row_to_dict(row) if row else None

    if record:
        try:
            from app.services.network_ad_service import append_network_ad_log

            changed_fields: Dict[str, Any] = {}
            for key in (
                'entry_type',
                'title',
                'kind',
                'description',
                'file_name',
                'file_path',
                'file_size',
                'mime_type',
                'is_primary',
                'sort_order',
                'upload_token',
            ):
                if before.get(key) != record.get(key):
                    changed_fields[key] = {'before': before.get(key), 'after': record.get(key)}

            if changed_fields:
                append_network_ad_log(
                    record.get('ad_id') or before.get('ad_id') or payload.get('ad_id') or 0,
                    tab_key='gov_ad_policy_file',
                    entity='DIAGRAM',
                    entity_id=record.get('id') or diagram_id,
                    action='UPDATE',
                    actor=actor_name,
                    message=f"구성/파일 수정 ({record.get('file_name') or before.get('file_name') or ''})".strip(),
                    diff={
                        'changed': changed_fields,
                    },
                    app=app,
                )
        except Exception:
            logger.exception('Failed to append network AD diagram update log')

    return record


def delete_network_ad_diagrams(ids: Sequence[int], actor: Optional[str] = None, app=None) -> int:
    id_list = [int(x) for x in ids if x]
    if not id_list:
        return 0

    app = app or current_app
    timestamp = _now()
    actor_name = (actor or 'system').strip() or 'system'

    with _get_connection(app) as conn:
        placeholders = ','.join(['?'] * len(id_list))
        before_rows = conn.execute(
            f"SELECT id, ad_id, entry_type, title, kind, description, file_name, file_path, file_size, mime_type, is_primary, sort_order, upload_token, created_at, created_by, updated_at, updated_by FROM {TABLE_NAME} WHERE id IN ({placeholders})",
            id_list,
        ).fetchall()
        cur = conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE id IN ({placeholders})",
            id_list,
        )
        deleted = cur.rowcount or 0
        conn.commit()

    if deleted and before_rows:
        deleted_items = [_row_to_dict(row) for row in before_rows]
        ad_ids = sorted({item.get('ad_id') for item in deleted_items if item.get('ad_id')})
        for ad_id in ad_ids:
            items_for_ad = [item for item in deleted_items if item.get('ad_id') == ad_id]
            try:
                from app.services.network_ad_service import append_network_ad_log

                append_network_ad_log(
                    int(ad_id),
                    tab_key='gov_ad_policy_file',
                    entity='DIAGRAM',
                    action='DELETE',
                    actor=actor_name,
                    message=(
                        f"구성/파일 삭제 ({items_for_ad[0].get('file_name') or ''})".strip()
                        if len(items_for_ad) == 1
                        else f"구성/파일 삭제 ({len(items_for_ad)}건)"
                    ),
                    diff={
                        'deleted': items_for_ad,
                    },
                    app=app,
                )
            except Exception:
                logger.exception('Failed to append network AD diagram delete log')

    try:
        logger.info('%s deleted %s rows at %s', actor_name, deleted, timestamp)
    except Exception:
        pass

    return int(deleted)
