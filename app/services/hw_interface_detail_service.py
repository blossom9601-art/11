import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'hw_interface_detail'

DEFAULT_PAGE_SIZE = 500
MAX_PAGE_SIZE = 2000


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
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
    path = path.lstrip('/')
    if os.path.isabs(path):
        return path
    return os.path.abspath(os.path.join(_project_root(app), path))


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


def init_hw_interface_detail_table(app=None) -> None:
    app = app or current_app
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                interface_id INTEGER NOT NULL,
                category TEXT NOT NULL DEFAULT 'Primary',
                ip_address TEXT,
                vip_type TEXT,
                protocol TEXT,
                port TEXT,
                pid TEXT,
                service_name TEXT,
                process TEXT,
                status TEXT,
                access_control TEXT,
                description TEXT,
                is_excluded INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT,
                updated_at TEXT,
                updated_by TEXT,
                FOREIGN KEY (interface_id) REFERENCES hw_interface(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_iface ON {TABLE_NAME}(interface_id)"
        )
        # migrate: add pid column for existing tables
        try:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN pid TEXT")
        except Exception:
            pass
        # migrate: add is_excluded column for existing tables
        try:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN is_excluded INTEGER NOT NULL DEFAULT 0")
        except Exception:
            pass
        conn.commit()


def _sanitize_text(value: Any, *, max_len: int = 500) -> str:
    s = ('' if value is None else str(value)).strip()
    if s == '-':
        s = ''
    if max_len and len(s) > max_len:
        s = s[:max_len]
    return s


def _sanitize_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError('정수 값이 올바르지 않습니다.') from exc


VALID_CATEGORIES = ('Primary', 'Secondary', 'VIP')
VALID_VIP_TYPES = ('LB', 'HA', 'Floating', 'DR', 'Service')
VALID_PROTOCOLS = ('TCP', 'UDP', 'ICMP', 'SCTP')
VALID_STATUSES = ('LISTEN', 'CLOSED', 'RESTRICTED', 'FILTERED', 'UNKNOWN')
VALID_ACCESS_CONTROLS = ('ANY', 'INTERNAL', 'PRIVATE', 'VPN', 'MGMT', 'DENY')


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        'id': row['id'],
        'interface_id': row['interface_id'],
        'category': row['category'] or 'Primary',
        'ip_address': row['ip_address'] or '',
        'vip_type': row['vip_type'] or '',
        'protocol': row['protocol'] or '',
        'port': row['port'] or '',
        'pid': row['pid'] or '',
        'service_name': row['service_name'] or '',
        'process': row['process'] or '',
        'status': row['status'] or '',
        'access_control': row['access_control'] or '',
        'description': row['description'] or '',
        'is_excluded': int(row['is_excluded'] or 0),
        'created_at': row['created_at'],
        'created_by': row['created_by'] or '',
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'] or '',
    }


def list_interface_details(
    interface_id: int,
    *,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    app=None,
) -> Dict[str, Any]:
    interface_id = _sanitize_int(interface_id)
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))
    offset = (page - 1) * page_size

    with _get_connection(app) as conn:
        total = conn.execute(
            f"SELECT COUNT(1) FROM {TABLE_NAME} WHERE interface_id = ?",
            (interface_id,),
        ).fetchone()[0]
        rows = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE interface_id = ? ORDER BY id ASC LIMIT ? OFFSET ?",
            (interface_id, page_size, offset),
        ).fetchall()
        return {
            'items': [_row_to_dict(r) for r in rows],
            'page': page,
            'page_size': page_size,
            'total': int(total or 0),
        }


def get_interface_detail(detail_id: int, app=None) -> Optional[Dict[str, Any]]:
    detail_id = _sanitize_int(detail_id)
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (detail_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def create_interface_detail(payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    interface_id = _sanitize_int(payload.get('interface_id'))

    category = _sanitize_text(payload.get('category'), max_len=20) or 'Primary'
    if category not in VALID_CATEGORIES:
        category = 'Primary'

    vip_type = _sanitize_text(payload.get('vip_type'), max_len=30)
    if category != 'VIP':
        vip_type = ''
    elif vip_type and vip_type not in VALID_VIP_TYPES:
        vip_type = ''

    protocol = _sanitize_text(payload.get('protocol'), max_len=10)
    if protocol and protocol not in VALID_PROTOCOLS:
        protocol = ''

    status = _sanitize_text(payload.get('status'), max_len=20)
    if status and status not in VALID_STATUSES:
        status = ''

    access_control = _sanitize_text(payload.get('access_control'), max_len=20)
    if access_control and access_control not in VALID_ACCESS_CONTROLS:
        access_control = ''

    with _get_connection(app) as conn:
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (
                interface_id, category, ip_address, vip_type,
                protocol, port, pid, service_name, process,
                status, access_control, description, is_excluded,
                created_at, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                interface_id,
                category,
                _sanitize_text(payload.get('ip_address'), max_len=200),
                vip_type,
                protocol,
                _sanitize_text(payload.get('port'), max_len=100),
                _sanitize_text(payload.get('pid'), max_len=100),
                _sanitize_text(payload.get('service_name'), max_len=200),
                _sanitize_text(payload.get('process'), max_len=200),
                status,
                access_control,
                _sanitize_text(payload.get('description'), max_len=500),
                1 if payload.get('is_excluded') else 0,
                _now(),
                (actor or 'system').strip() or 'system',
            ),
        )
        new_id = int(cur.lastrowid)
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (new_id,),
        ).fetchone()
        conn.commit()
        return _row_to_dict(row)


def update_interface_detail(detail_id: int, payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    detail_id = _sanitize_int(detail_id)

    with _get_connection(app) as conn:
        existing = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (detail_id,),
        ).fetchone()
        if not existing:
            raise ValueError('인터페이스 상세 항목을 찾을 수 없습니다.')

        update_fields = {}

        if 'category' in payload:
            cat = _sanitize_text(payload['category'], max_len=20) or 'Primary'
            if cat not in VALID_CATEGORIES:
                cat = 'Primary'
            update_fields['category'] = cat
        else:
            cat = existing['category'] or 'Primary'

        if 'vip_type' in payload:
            vt = _sanitize_text(payload['vip_type'], max_len=30)
            if cat != 'VIP':
                vt = ''
            elif vt and vt not in VALID_VIP_TYPES:
                vt = ''
            update_fields['vip_type'] = vt

        for key, col, max_len in [
            ('ip_address', 'ip_address', 200),
            ('protocol', 'protocol', 10),
            ('port', 'port', 100),
            ('pid', 'pid', 100),
            ('service_name', 'service_name', 200),
            ('process', 'process', 200),
            ('status', 'status', 20),
            ('access_control', 'access_control', 20),
            ('description', 'description', 500),
        ]:
            if key in payload:
                val = _sanitize_text(payload[key], max_len=max_len)
                if key == 'protocol' and val and val not in VALID_PROTOCOLS:
                    val = ''
                if key == 'status' and val and val not in VALID_STATUSES:
                    val = ''
                if key == 'access_control' and val and val not in VALID_ACCESS_CONTROLS:
                    val = ''
                update_fields[col] = val

        if 'is_excluded' in payload:
            update_fields['is_excluded'] = 1 if payload['is_excluded'] else 0

        if not update_fields:
            return _row_to_dict(existing)

        set_clause = ', '.join(f"{k} = ?" for k in update_fields)
        set_clause += ', updated_at = ?, updated_by = ?'
        params = list(update_fields.values()) + [
            _now(),
            (actor or 'system').strip() or 'system',
            detail_id,
        ]
        conn.execute(
            f"UPDATE {TABLE_NAME} SET {set_clause} WHERE id = ?",
            params,
        )
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (detail_id,),
        ).fetchone()
        conn.commit()
        return _row_to_dict(row)


def delete_interface_detail(detail_id: int, app=None) -> None:
    detail_id = _sanitize_int(detail_id)
    with _get_connection(app) as conn:
        conn.execute(f"DELETE FROM {TABLE_NAME} WHERE id = ?", (detail_id,))
        conn.commit()
