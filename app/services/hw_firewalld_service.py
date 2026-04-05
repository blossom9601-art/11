import logging
import os
import sqlite3
import ipaddress
from datetime import datetime
from typing import Any, Dict
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

# Bump this when you need to force Flask's debug reloader
# to pick up hotfixes without manual restarts.
TABLE_NAME = 'hw_firewalld'

DEFAULT_PAGE_SIZE = 500
MAX_PAGE_SIZE = 2000

ALLOWED_STATUS = {'ENABLED', 'DISABLED'}
ALLOWED_DIRECTION = {'IN', 'OUT'}
ALLOWED_PROTOCOL = {'TCP', 'UDP', 'ICMP', 'ANY'}
ALLOWED_ACTION = {'ALLOW', 'DENY', 'REJECT', 'DROP'}
ALLOWED_LOG = {'ON', 'OFF'}


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


def init_hw_firewalld_table(app=None) -> None:
    app = app or current_app
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scope_key TEXT NOT NULL,
                asset_id INTEGER NOT NULL,
                priority INTEGER NOT NULL DEFAULT 9999,
                direction TEXT,
                fw_status TEXT,
                policy_name TEXT,
                source TEXT,
                destination TEXT,
                proto TEXT,
                port TEXT,
                action TEXT,
                fw_log TEXT,
                expires_at TEXT,
                remark TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT,
                updated_at TEXT,
                updated_by TEXT
            )
            """
        )
        # Best-effort schema upgrades for environments that created the table earlier.
        try:
            cols = {r['name'] for r in conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall()}
        except Exception:
            cols = set()

        def _add_col(col: str, sql_type: str) -> None:
            if col in cols:
                return
            try:
                conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN {col} {sql_type}")
            except Exception:
                pass

        _add_col('priority', 'INTEGER NOT NULL DEFAULT 9999')
        _add_col('direction', 'TEXT')
        _add_col('destination', 'TEXT')
        _add_col('fw_log', 'TEXT')
        _add_col('expires_at', 'TEXT')

        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_scope_asset ON {TABLE_NAME}(scope_key, asset_id)"
        )
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_scope_asset_priority ON {TABLE_NAME}(scope_key, asset_id, priority, id)"
        )
        conn.commit()


def _sanitize_text(value: Any, *, max_len: int = 5000) -> str:
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


def _sanitize_choice(value: Any, allowed: set, *, field_label: str) -> str:
    s = _sanitize_text(value, max_len=30).upper()
    if not s:
        return ''
    if s not in allowed:
        raise ValueError(f"{field_label} 값이 올바르지 않습니다.")
    return s


def _sanitize_priority(value: Any) -> int:
    s = _sanitize_text(value, max_len=10)
    if not s:
        return 9999
    if not s.isdigit():
        raise ValueError('우선순위는 숫자만 입력 가능합니다.')
    n = int(s)
    if n < 1 or n > 9999:
        raise ValueError('우선순위는 1~9999 범위여야 합니다.')
    return n


def _sanitize_port(value: Any, *, protocol: str) -> str:
    s = _sanitize_text(value, max_len=10)
    if not s:
        if protocol in ('TCP', 'UDP'):
            raise ValueError('포트는 필수입니다. (TCP/UDP)')
        return ''
    if not s.isdigit():
        raise ValueError('포트는 1~65535 숫자만 입력 가능합니다.')
    n = int(s)
    if n < 1 or n > 65535:
        raise ValueError('포트는 1~65535 범위여야 합니다.')
    return str(n)


def _sanitize_date_yyyy_mm_dd(value: Any) -> str:
    s = _sanitize_text(value, max_len=20)
    if not s:
        return ''
    try:
        # Keep as text, but validate format.
        datetime.strptime(s, '%Y-%m-%d')
        return s
    except Exception as exc:
        raise ValueError('만료일 형식이 올바르지 않습니다. (YYYY-MM-DD)') from exc


def _sanitize_ip_spec(value: Any, *, allow_this_host: bool = False) -> str:
    raw = _sanitize_text(value, max_len=1000)
    if not raw:
        return ''
    upper = raw.upper()
    if upper in ('ANY', '*'):
        return 'ANY'
    if allow_this_host and upper in ('THIS_HOST', 'THISHOST', 'LOCALHOST', 'LOCAL', 'SELF'):
        return 'THIS_HOST'

    parts = [p.strip() for p in raw.replace('\n', ',').replace('\t', ',').replace(' ', ',').split(',')]
    parts = [p for p in parts if p]
    if not parts:
        return ''

    normalized = []
    for token in parts:
        t = token.strip()
        if not t:
            continue
        try:
            if '/' in t:
                ipaddress.ip_network(t, strict=False)
                normalized.append(t)
            else:
                ipaddress.ip_address(t)
                normalized.append(t)
        except Exception as exc:
            raise ValueError('IP 형식이 올바르지 않습니다. (ANY, 단일 IP, CIDR, IP 리스트)') from exc
    return ','.join(normalized)


def _row_get(row: sqlite3.Row, key: str, default: Any = '') -> Any:
    try:
        if row is None:
            return default
        keys = row.keys() if hasattr(row, 'keys') else []
        if key in keys:
            v = row[key]
            return default if v is None else v
    except Exception:
        pass
    return default


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        'id': _row_get(row, 'id'),
        'scope_key': _row_get(row, 'scope_key'),
        'asset_id': _row_get(row, 'asset_id'),
        'priority': int(_row_get(row, 'priority', 9999) or 9999),
        'status': _row_get(row, 'fw_status', ''),
        'direction': _row_get(row, 'direction', ''),
        'name': _row_get(row, 'policy_name', ''),
        'source': _row_get(row, 'source', ''),
        'destination': _row_get(row, 'destination', ''),
        'protocol': _row_get(row, 'proto', ''),
        'port': _row_get(row, 'port', ''),
        'action': _row_get(row, 'action', ''),
        'log': _row_get(row, 'fw_log', ''),
        'expires_at': _row_get(row, 'expires_at', ''),
        'remark': _row_get(row, 'remark', ''),
        'created_at': _row_get(row, 'created_at'),
        'created_by': _row_get(row, 'created_by', ''),
        'updated_at': _row_get(row, 'updated_at'),
        'updated_by': _row_get(row, 'updated_by', ''),
    }


def list_hw_firewallds(
    scope_key: str,
    asset_id: int,
    *,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    app=None,
) -> Dict[str, Any]:
    scope_key = _sanitize_text(scope_key, max_len=120)
    if not scope_key:
        raise ValueError('scope_key가 필요합니다.')
    asset_id = _sanitize_int(asset_id)

    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))
    offset = (page - 1) * page_size

    with _get_connection(app) as conn:
        total = conn.execute(
            f"SELECT COUNT(1) FROM {TABLE_NAME} WHERE scope_key = ? AND asset_id = ?",
            (scope_key, asset_id),
        ).fetchone()[0]
        rows = conn.execute(
            f"""
            SELECT * FROM {TABLE_NAME}
            WHERE scope_key = ? AND asset_id = ?
            ORDER BY COALESCE(priority, 9999) ASC, id ASC
            LIMIT ? OFFSET ?
            """,
            (scope_key, asset_id, page_size, offset),
        ).fetchall()
        return {
            'items': [_row_to_dict(r) for r in rows],
            'page': page,
            'page_size': page_size,
            'total': int(total or 0),
        }


def create_hw_firewalld(payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    scope_key = _sanitize_text(payload.get('scope_key'), max_len=120)
    if not scope_key:
        raise ValueError('scope_key가 필요합니다.')
    asset_id = _sanitize_int(payload.get('asset_id'))

    priority = _sanitize_priority(payload.get('priority'))
    status = _sanitize_choice(payload.get('status'), ALLOWED_STATUS, field_label='상태')
    direction = _sanitize_choice(payload.get('direction'), ALLOWED_DIRECTION, field_label='방향')
    if not status:
        raise ValueError('상태는 필수입니다.')
    if not direction:
        raise ValueError('방향은 필수입니다.')
    policy_name = _sanitize_text(payload.get('name'), max_len=200)
    if not policy_name:
        raise ValueError('정책명은 필수입니다.')

    protocol = _sanitize_choice(payload.get('protocol') or payload.get('proto'), ALLOWED_PROTOCOL, field_label='프로토콜')
    if not protocol:
        raise ValueError('프로토콜은 필수입니다.')
    port = _sanitize_port(payload.get('port'), protocol=protocol)

    source_raw = _sanitize_text(payload.get('source'), max_len=1000)
    source = _sanitize_ip_spec(source_raw or 'ANY')

    # Destination rule: IN => THIS_HOST, OUT => user input
    if direction == 'IN':
        destination = 'THIS_HOST'
    else:
        destination_raw = _sanitize_text(payload.get('destination'), max_len=1000)
        destination = _sanitize_ip_spec(destination_raw or '', allow_this_host=True)

    action = _sanitize_choice(payload.get('action'), ALLOWED_ACTION, field_label='동작')
    fw_log = _sanitize_choice(payload.get('log'), ALLOWED_LOG, field_label='로그')
    if not action:
        raise ValueError('동작은 필수입니다.')
    if not fw_log:
        raise ValueError('로그는 필수입니다.')
    expires_at = _sanitize_date_yyyy_mm_dd(payload.get('expires_at'))
    remark = _sanitize_text(payload.get('remark'), max_len=500)

    with _get_connection(app) as conn:
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (
                scope_key, asset_id,
                priority, direction,
                fw_status, policy_name, source, destination, proto, port, action, fw_log, expires_at, remark,
                created_at, created_by
            ) VALUES (
                ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?
            )
            """,
            (
                scope_key,
                asset_id,
                priority,
                direction,
                status,
                policy_name,
                source,
                destination,
                protocol,
                port,
                action,
                fw_log,
                expires_at,
                remark,
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


def update_hw_firewalld(firewalld_id: int, payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    firewalld_id = _sanitize_int(firewalld_id)

    priority = _sanitize_priority(payload.get('priority'))
    status = _sanitize_choice(payload.get('status'), ALLOWED_STATUS, field_label='상태')
    direction = _sanitize_choice(payload.get('direction'), ALLOWED_DIRECTION, field_label='방향')
    if not status:
        raise ValueError('상태는 필수입니다.')
    if not direction:
        raise ValueError('방향은 필수입니다.')
    policy_name = _sanitize_text(payload.get('name'), max_len=200)
    if not policy_name:
        raise ValueError('정책명은 필수입니다.')

    protocol = _sanitize_choice(payload.get('protocol') or payload.get('proto'), ALLOWED_PROTOCOL, field_label='프로토콜')
    if not protocol:
        raise ValueError('프로토콜은 필수입니다.')
    port = _sanitize_port(payload.get('port'), protocol=protocol)

    source_raw = _sanitize_text(payload.get('source'), max_len=1000)
    source = _sanitize_ip_spec(source_raw or 'ANY')
    if direction == 'IN':
        destination = 'THIS_HOST'
    else:
        destination_raw = _sanitize_text(payload.get('destination'), max_len=1000)
        destination = _sanitize_ip_spec(destination_raw or '', allow_this_host=True)

    action = _sanitize_choice(payload.get('action'), ALLOWED_ACTION, field_label='동작')
    fw_log = _sanitize_choice(payload.get('log'), ALLOWED_LOG, field_label='로그')
    if not action:
        raise ValueError('동작은 필수입니다.')
    if not fw_log:
        raise ValueError('로그는 필수입니다.')
    expires_at = _sanitize_date_yyyy_mm_dd(payload.get('expires_at'))
    remark = _sanitize_text(payload.get('remark'), max_len=500)

    with _get_connection(app) as conn:
        existing = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (firewalld_id,),
        ).fetchone()
        if not existing:
            raise ValueError('방화벽 항목을 찾을 수 없습니다.')

        conn.execute(
            f"""
            UPDATE {TABLE_NAME}
            SET priority = ?, direction = ?,
                fw_status = ?, policy_name = ?, source = ?, destination = ?,
                proto = ?, port = ?, action = ?, fw_log = ?, expires_at = ?, remark = ?,
                updated_at = ?, updated_by = ?
            WHERE id = ?
            """,
            (
                priority,
                direction,
                status,
                policy_name,
                source,
                destination,
                protocol,
                port,
                action,
                fw_log,
                expires_at,
                remark,
                _now(),
                (actor or 'system').strip() or 'system',
                firewalld_id,
            ),
        )
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (firewalld_id,),
        ).fetchone()
        conn.commit()
        return _row_to_dict(row)


def get_hw_firewalld(firewalld_id: int, *, app=None):
    """단건 조회 — 변경이력(diff) 기록용."""
    firewalld_id = _sanitize_int(firewalld_id)
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (firewalld_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def delete_hw_firewalld(firewalld_id: int, *, app=None) -> None:
    firewalld_id = _sanitize_int(firewalld_id)

    with _get_connection(app) as conn:
        conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE id = ?",
            (firewalld_id,),
        )
        conn.commit()
