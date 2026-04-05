import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

from app.services.hardware_asset_service import get_hardware_asset
from app.services.hardware_asset_service import _get_connection as _get_hw_asset_connection

logger = logging.getLogger(__name__)

TABLE_NAME = 'hw_interface'

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
        # Fall back to instance db for non-sqlite SQLAlchemy URIs
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


def _column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    try:
        rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
        return any(r[1] == column for r in rows)
    except Exception:
        return False


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, ddl_fragment: str) -> None:
    if _column_exists(conn, table, column):
        return
    conn.execute(f"ALTER TABLE {table} ADD COLUMN {ddl_fragment}")


def _resolve_system_name(asset_id: int, payload: Dict[str, Any], *, app=None) -> str:
    raw = payload.get('system_name')
    if raw is not None:
        return _sanitize_text(raw, max_len=200)
    try:
        asset = get_hardware_asset(asset_id, app)
        if not asset:
            return ''
        return _sanitize_text(asset.get('system_name'), max_len=200)
    except Exception:
        return ''


def init_hw_interface_table(app=None) -> None:
    app = app or current_app
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scope_key TEXT NOT NULL,
                asset_id INTEGER NOT NULL,
                system_name TEXT,
                if_type TEXT,
                slot TEXT,
                port TEXT,
                iface TEXT,
                serial TEXT,
                assign_value TEXT,
                peer_system TEXT,
                peer_port TEXT,
                remark TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT,
                updated_at TEXT,
                updated_by TEXT
            )
            """
        )
        # Migration for existing DBs created before system_name column existed.
        _ensure_column(conn, TABLE_NAME, 'system_name', 'system_name TEXT')
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_scope_asset ON {TABLE_NAME}(scope_key, asset_id)"
        )
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


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        'id': row['id'],
        'scope_key': row['scope_key'],
        'asset_id': row['asset_id'],
        'system_name': (row['system_name'] or '') if 'system_name' in row.keys() else '',
        'type': row['if_type'] or '',
        'slot': row['slot'] or '',
        'port': row['port'] or '',
        'iface': row['iface'] or '',
        'serial': row['serial'] or '',
        'assign': row['assign_value'] or '',
        'peer': row['peer_system'] or '',
        'peer_port': row['peer_port'] or '',
        'remark': row['remark'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'] or '',
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'] or '',
    }


def _resolve_asset_ids_by_work_name(work_name: str, app=None) -> List[int]:
    """hardware 테이블에서 work_name으로 asset_id 목록 조회 (hardware_asset_service DB 사용)."""
    if not work_name:
        return []
    try:
        with _get_hw_asset_connection(app) as conn:
            rows = conn.execute(
                "SELECT id FROM hardware WHERE work_name = ? AND is_deleted = 0",
                (work_name,),
            ).fetchall()
            return [r[0] for r in rows if r[0]]
    except Exception:
        return []


def list_hw_interfaces(
    scope_key: str,
    asset_id: int,
    *,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    work_name: Optional[str] = None,
    app=None,
) -> Dict[str, Any]:
    scope_key = _sanitize_text(scope_key, max_len=120)
    asset_id = _sanitize_int(asset_id)

    # work_name이 제공되면 해당 시스템의 모든 가능한 asset_id를 수집
    all_asset_ids: List[int] = []
    if asset_id:
        all_asset_ids.append(asset_id)
    if work_name:
        resolved = _resolve_asset_ids_by_work_name(work_name, app)
        for rid in resolved:
            if rid not in all_asset_ids:
                all_asset_ids.append(rid)

    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))
    offset = (page - 1) * page_size

    if not all_asset_ids:
        return {'items': [], 'page': page, 'page_size': page_size, 'total': 0}

    with _get_connection(app) as conn:
        placeholders = ','.join('?' for _ in all_asset_ids)
        if scope_key:
            where = f"scope_key = ? AND asset_id IN ({placeholders})"
            params = [scope_key, *all_asset_ids]
        else:
            # peer 포트 조회: asset_id에 연결된 scope_key도 함께 검색하여
            # asset_id 불일치 레코드(데이터 오류)도 포함시킴
            sk_rows = conn.execute(
                f"SELECT DISTINCT scope_key FROM {TABLE_NAME} WHERE asset_id IN ({placeholders})",
                list(all_asset_ids),
            ).fetchall()
            linked_scope_keys = [r[0] for r in sk_rows if r[0]]

            conditions = [f"asset_id IN ({placeholders})"]
            params = list(all_asset_ids)
            if linked_scope_keys:
                sk_ph = ','.join('?' for _ in linked_scope_keys)
                conditions.append(f"scope_key IN ({sk_ph})")
                params.extend(linked_scope_keys)
            if work_name:
                conditions.append("system_name = ?")
                params.append(work_name)
            where = '(' + ' OR '.join(conditions) + ')'

        total = conn.execute(
            f"SELECT COUNT(1) FROM {TABLE_NAME} WHERE {where}", params,
        ).fetchone()[0]
        rows = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE {where} ORDER BY id ASC LIMIT ? OFFSET ?",
            [*params, page_size, offset],
        ).fetchall()
        return {
            'items': [_row_to_dict(r) for r in rows],
            'page': page,
            'page_size': page_size,
            'total': int(total or 0),
        }


def create_hw_interface(payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    scope_key = _sanitize_text(payload.get('scope_key'), max_len=120)
    if not scope_key:
        raise ValueError('scope_key가 필요합니다.')
    asset_id = _sanitize_int(payload.get('asset_id'))

    data = {
        'system_name': _resolve_system_name(asset_id, payload, app=app),
        'if_type': _sanitize_text(payload.get('type'), max_len=120),
        'slot': _sanitize_text(payload.get('slot'), max_len=120),
        'port': _sanitize_text(payload.get('port'), max_len=120),
        'iface': _sanitize_text(payload.get('iface'), max_len=200),
        'serial': _sanitize_text(payload.get('serial'), max_len=200),
        'assign_value': _sanitize_text(payload.get('assign'), max_len=200),
        'peer_system': _sanitize_text(payload.get('peer'), max_len=200),
        'peer_port': _sanitize_text(payload.get('peer_port'), max_len=200),
        'remark': _sanitize_text(payload.get('remark'), max_len=500),
    }

    with _get_connection(app) as conn:
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (
                scope_key, asset_id,
                system_name, if_type, slot, port, iface, serial, assign_value, peer_system, peer_port, remark,
                created_at, created_by
            ) VALUES (
                ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?
            )
            """,
            (
                scope_key,
                asset_id,
                data['system_name'],
                data['if_type'],
                data['slot'],
                data['port'],
                data['iface'],
                data['serial'],
                data['assign_value'],
                data['peer_system'],
                data['peer_port'],
                data['remark'],
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


def update_hw_interface(interface_id: int, payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    interface_id = _sanitize_int(interface_id)

    # Resolve asset_id first (to support deriving system_name without requiring client payload).
    with _get_connection(app) as conn:
        existing = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (interface_id,),
        ).fetchone()
        if not existing:
            raise ValueError('인터페이스 항목을 찾을 수 없습니다.')
        asset_id = int(existing['asset_id'])

    data = {
        'system_name': _resolve_system_name(asset_id, payload, app=app),
        'if_type': _sanitize_text(payload.get('type'), max_len=120) if 'type' in payload else None,
        'slot': _sanitize_text(payload.get('slot'), max_len=120) if 'slot' in payload else None,
        'port': _sanitize_text(payload.get('port'), max_len=120) if 'port' in payload else None,
        'iface': _sanitize_text(payload.get('iface'), max_len=200) if 'iface' in payload else None,
        'serial': _sanitize_text(payload.get('serial'), max_len=200) if 'serial' in payload else None,
        'assign_value': _sanitize_text(payload.get('assign'), max_len=200) if 'assign' in payload else None,
        'peer_system': _sanitize_text(payload.get('peer'), max_len=200) if 'peer' in payload else None,
        'peer_port': _sanitize_text(payload.get('peer_port'), max_len=200) if 'peer_port' in payload else None,
        'remark': _sanitize_text(payload.get('remark'), max_len=500) if 'remark' in payload else None,
    }

    # 부분 업데이트: payload에 포함된 필드만 SET 절에 추가
    update_fields = {}
    update_fields['system_name'] = data['system_name']
    for k, v in data.items():
        if k == 'system_name':
            continue
        if v is not None:
            update_fields[k] = v

    with _get_connection(app) as conn:
        set_clause = ', '.join(f"{k} = ?" for k in update_fields)
        set_clause += ', updated_at = ?, updated_by = ?'
        params = list(update_fields.values()) + [
            _now(),
            (actor or 'system').strip() or 'system',
            interface_id,
        ]
        conn.execute(
            f"UPDATE {TABLE_NAME} SET {set_clause} WHERE id = ?",
            params,
        )
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (interface_id,),
        ).fetchone()
        conn.commit()
        return _row_to_dict(row)


def get_hw_interface(interface_id: int, *, app=None) -> Optional[Dict[str, Any]]:
    """단건 조회 — 변경이력(diff) 기록용."""
    interface_id = _sanitize_int(interface_id)
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (interface_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def delete_hw_interface(interface_id: int, *, app=None) -> None:
    interface_id = _sanitize_int(interface_id)
    with _get_connection(app) as conn:
        conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE id = ?",
            (interface_id,),
        )
        conn.commit()


def lookup_interfaces_by_ips(
    ip_list: List[str],
    *,
    app=None,
) -> Dict[str, Dict[str, str]]:
    """Return {ip: {system_name, port}} by scanning hw_interface.assign_value.

    assign_value may contain comma-separated IPs like '10.1.1.1, 10.1.1.2'.
    """
    if not ip_list:
        return {}

    # Deduplicate and sanitise
    clean_ips: List[str] = []
    seen: set = set()
    for raw in ip_list:
        ip = str(raw or '').strip()
        if not ip or ip in seen:
            continue
        seen.add(ip)
        clean_ips.append(ip)

    if not clean_ips:
        return {}

    with _get_connection(app) as conn:
        # Build LIKE conditions for each IP
        like_clauses = []
        params: List[str] = []
        for ip in clean_ips:
            like_clauses.append("hi.assign_value LIKE ?")
            params.append(f"%{ip}%")

        where = " OR ".join(like_clauses)
        sql = f"""
            SELECT hi.asset_id, hi.system_name, hi.port, hi.assign_value
            FROM {TABLE_NAME} hi
            WHERE ({where})
        """
        rows = conn.execute(sql, params).fetchall()

    # Resolve parent asset info via get_hardware_asset (avoids cross-table naming issues).
    asset_cache: Dict[int, Dict[str, str]] = {}

    def _get_asset_info(asset_id: int) -> Dict[str, str]:
        if asset_id in asset_cache:
            return asset_cache[asset_id]
        info: Dict[str, str] = {'system_name': '', 'work_name': ''}
        try:
            asset = get_hardware_asset(asset_id, app)
            if asset:
                info['system_name'] = str(asset.get('system_name') or '').strip()
                info['work_name'] = str(asset.get('work_name') or '').strip()
        except Exception:
            pass
        asset_cache[asset_id] = info
        return info

    # Build mapping: for each IP, find which row's assign_value contains it
    result: Dict[str, Dict[str, str]] = {}
    for row in rows:
        assign_raw = str(row['assign_value'] or '')
        assigned_ips = [s.strip() for s in assign_raw.split(',') if s.strip()]
        aid = row['asset_id']
        parent = _get_asset_info(aid) if aid else {'system_name': '', 'work_name': ''}
        sys_name = parent['system_name'] or str(row['system_name'] or '').strip()
        work_name = parent['work_name']
        port_val = str(row['port'] or '').strip()
        for aip in assigned_ips:
            if aip in seen and aip not in result:
                result[aip] = {
                    'system_name': sys_name,
                    'work_name': work_name,
                    'port': port_val,
                }
    return result
