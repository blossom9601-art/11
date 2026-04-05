import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'network_dns_record'
POLICY_TABLE = 'network_dns_policy'

DEFAULT_TTL = 3600
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 500

VALID_STATUSES = {'활성', '예약', '비활성'}
VALID_RECORD_TYPES = {'A', 'AAAA', 'CNAME', 'MX', 'SRV', 'TXT', 'NS', 'PTR'}


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    override = app.config.get('NETWORK_DNS_POLICY_SQLITE_PATH')
    if override:
        return os.path.abspath(override)
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        return os.path.join(app.instance_path, 'network_dns_policy.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'network_dns_policy.db')
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
    try:
        conn.execute('PRAGMA foreign_keys = ON')
    except sqlite3.DatabaseError:
        logger.warning('Could not enable FK enforcement for %s', TABLE_NAME)
    return conn


def _sanitize_int(value: Any, *, allow_none: bool = True) -> Optional[int]:
    if value in (None, ''):
        return None if allow_none else 0
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError('정수 값이 올바르지 않습니다.') from exc


def _sanitize_status(value: Any) -> str:
    s = ('' if value is None else str(value)).strip()
    if not s:
        return ''
    if s not in VALID_STATUSES:
        raise ValueError('상태 값이 올바르지 않습니다.')
    return s


def _sanitize_record_type(value: Any) -> str:
    s = ('' if value is None else str(value)).strip().upper()
    if not s:
        raise ValueError('유형을 선택하세요.')
    if s not in VALID_RECORD_TYPES:
        raise ValueError('유형 값이 올바르지 않습니다.')
    return s


def _sanitize_ttl(value: Any) -> int:
    if value in (None, ''):
        return DEFAULT_TTL
    try:
        n = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError('TTL은 숫자여야 합니다.') from exc
    if n < 0:
        raise ValueError('TTL은 0 이상이어야 합니다.')
    return n


def _sanitize_text(value: Any, *, max_len: int = 500) -> str:
    s = ('' if value is None else str(value)).strip()
    if max_len and len(s) > max_len:
        s = s[:max_len]
    return s


def _compute_fqdn(host_name: str, domain: str) -> str:
    host = (host_name or '').strip()
    dom = (domain or '').strip()
    if not dom:
        return host
    if not host or host == '@':
        return dom
    if host.endswith('.'):
        return host[:-1]
    return f"{host}.{dom}"


def _fetch_policy_domain(conn: sqlite3.Connection, policy_id: int) -> str:
    row = conn.execute(
        f"SELECT domain FROM {POLICY_TABLE} WHERE id = ? AND is_deleted = 0",
        (int(policy_id),),
    ).fetchone()
    if not row:
        raise ValueError('DNS 정책을 찾을 수 없습니다.')
    return (row['domain'] or '').strip()


def _refresh_policy_record_count(conn: sqlite3.Connection, policy_id: int, actor: str) -> None:
    count = conn.execute(
        f"SELECT COUNT(1) FROM {TABLE_NAME} WHERE policy_id = ?",
        (int(policy_id),),
    ).fetchone()[0]
    conn.execute(
        f"UPDATE {POLICY_TABLE} SET record_count = ?, updated_at = ?, updated_by = ? WHERE id = ?",
        (int(count or 0), _now(), (actor or 'system').strip() or 'system', int(policy_id)),
    )


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}
    return {
        'id': row['id'],
        'policy_id': row['policy_id'],
        'status': row['status'] or '',
        'record_type': row['record_type'] or '',
        'host_name': row['host_name'] or '',
        'fqdn': row['fqdn'] or '',
        'ip_address': row['ip_address'] or '',
        'priority': row['priority'],
        'ttl': row['ttl'] if row['ttl'] is not None else DEFAULT_TTL,
        'service_name': row['service_name'] or '',
        'remark': row['remark'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'] or '',
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'] or '',
    }


def init_network_dns_record_table(app=None) -> None:
    app = app or current_app
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                policy_id INTEGER NOT NULL,
                status TEXT,
                record_type TEXT NOT NULL,
                host_name TEXT,
                fqdn TEXT,
                ip_address TEXT,
                priority INTEGER,
                ttl INTEGER NOT NULL DEFAULT {DEFAULT_TTL},
                service_name TEXT,
                remark TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT,
                updated_at TEXT,
                updated_by TEXT,
                FOREIGN KEY (policy_id) REFERENCES {POLICY_TABLE}(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_policy ON {TABLE_NAME}(policy_id)")
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_fqdn ON {TABLE_NAME}(fqdn)")
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_type ON {TABLE_NAME}(record_type)")
        conn.commit()


def list_network_dns_records(
    policy_id: int,
    *,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    app=None,
) -> Dict[str, Any]:
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))
    offset = (page - 1) * page_size
    with _get_connection(app) as conn:
        _fetch_policy_domain(conn, int(policy_id))
        rows = conn.execute(
            f"""
            SELECT * FROM {TABLE_NAME}
            WHERE policy_id = ?
            ORDER BY id DESC
            LIMIT ? OFFSET ?
            """,
            (int(policy_id), page_size, offset),
        ).fetchall()
        total = conn.execute(
            f"SELECT COUNT(1) FROM {TABLE_NAME} WHERE policy_id = ?",
            (int(policy_id),),
        ).fetchone()[0]
    return {
        'items': [_row_to_dict(r) for r in rows],
        'total': int(total or 0),
        'page': page,
        'page_size': page_size,
    }


def get_network_dns_record(policy_id: int, record_id: int, app=None) -> Optional[Dict[str, Any]]:
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ? AND policy_id = ?",
            (int(record_id), int(policy_id)),
        ).fetchone()
        return _row_to_dict(row) if row else None


def create_network_dns_record(policy_id: int, data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    actor = (actor or 'system').strip() or 'system'
    if not data:
        raise ValueError('요청 본문이 비어 있습니다.')

    status = _sanitize_status(data.get('status'))
    record_type = _sanitize_record_type(data.get('record_type') or data.get('recordType'))
    host_name = _sanitize_text(data.get('host_name') or data.get('hostName'), max_len=255)
    ip_address = _sanitize_text(data.get('ip_address') or data.get('ipAddress'), max_len=255)
    priority = _sanitize_int(data.get('priority'))
    ttl = _sanitize_ttl(data.get('ttl'))
    service_name = _sanitize_text(data.get('service_name') or data.get('serviceName'), max_len=255)
    remark = _sanitize_text(data.get('remark') or data.get('note'), max_len=2000)

    with _get_connection(app) as conn:
        domain = _fetch_policy_domain(conn, int(policy_id))
        fqdn = _compute_fqdn(host_name, domain)
        ts = _now()
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
              (policy_id, status, record_type, host_name, fqdn, ip_address, priority, ttl, service_name, remark, created_at, created_by, updated_at, updated_by)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                int(policy_id),
                status or None,
                record_type,
                host_name or None,
                fqdn or None,
                ip_address or None,
                priority,
                ttl,
                service_name or None,
                remark or None,
                ts,
                actor,
                ts,
                actor,
            ),
        )
        record_id = int(cur.lastrowid)
        _refresh_policy_record_count(conn, int(policy_id), actor)
        conn.commit()
        row = conn.execute(f"SELECT * FROM {TABLE_NAME} WHERE id = ?", (record_id,)).fetchone()
        return _row_to_dict(row)


def update_network_dns_record(policy_id: int, record_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    actor = (actor or 'system').strip() or 'system'
    if not data:
        raise ValueError('요청 본문이 비어 있습니다.')

    with _get_connection(app) as conn:
        existing = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ? AND policy_id = ?",
            (int(record_id), int(policy_id)),
        ).fetchone()
        if not existing:
            return None

        domain = _fetch_policy_domain(conn, int(policy_id))

        status = existing['status']
        record_type = existing['record_type']
        host_name = existing['host_name']
        ip_address = existing['ip_address']
        priority = existing['priority']
        ttl = existing['ttl']
        service_name = existing['service_name']
        remark = existing['remark']

        if 'status' in data:
            status = _sanitize_status(data.get('status')) or None
        if 'record_type' in data or 'recordType' in data:
            record_type = _sanitize_record_type(data.get('record_type') or data.get('recordType'))
        if 'host_name' in data or 'hostName' in data:
            host_name = _sanitize_text(data.get('host_name') or data.get('hostName'), max_len=255) or None
        if 'ip_address' in data or 'ipAddress' in data:
            ip_address = _sanitize_text(data.get('ip_address') or data.get('ipAddress'), max_len=255) or None
        if 'priority' in data:
            priority = _sanitize_int(data.get('priority'))
        if 'ttl' in data:
            ttl = _sanitize_ttl(data.get('ttl'))
        if 'service_name' in data or 'serviceName' in data:
            service_name = _sanitize_text(data.get('service_name') or data.get('serviceName'), max_len=255) or None
        if 'remark' in data or 'note' in data:
            remark = _sanitize_text(data.get('remark') or data.get('note'), max_len=2000) or None

        fqdn = _compute_fqdn(host_name or '', domain)
        ts = _now()

        conn.execute(
            f"""
            UPDATE {TABLE_NAME}
            SET status = ?, record_type = ?, host_name = ?, fqdn = ?, ip_address = ?, priority = ?, ttl = ?, service_name = ?, remark = ?,
                updated_at = ?, updated_by = ?
            WHERE id = ? AND policy_id = ?
            """,
            (
                status,
                record_type,
                host_name,
                fqdn or None,
                ip_address,
                priority,
                ttl,
                service_name,
                remark,
                ts,
                actor,
                int(record_id),
                int(policy_id),
            ),
        )
        _refresh_policy_record_count(conn, int(policy_id), actor)
        conn.commit()
        row = conn.execute(f"SELECT * FROM {TABLE_NAME} WHERE id = ?", (int(record_id),)).fetchone()
        return _row_to_dict(row) if row else None


def update_network_dns_record_with_before(
    policy_id: int,
    record_id: int,
    data: Dict[str, Any],
    actor: str,
    app=None,
) -> Optional[Dict[str, Dict[str, Any]]]:
    """Update a DNS record and return both before/after snapshots.

    This avoids cross-connection inconsistencies that can make logs look like
    multiple fields changed when only one did.
    """
    actor = (actor or 'system').strip() or 'system'
    if not data:
        raise ValueError('요청 본문이 비어 있습니다.')

    with _get_connection(app) as conn:
        existing = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ? AND policy_id = ?",
            (int(record_id), int(policy_id)),
        ).fetchone()
        if not existing:
            return None

        before = _row_to_dict(existing)
        domain = _fetch_policy_domain(conn, int(policy_id))

        status = existing['status']
        record_type = existing['record_type']
        host_name = existing['host_name']
        ip_address = existing['ip_address']
        priority = existing['priority']
        ttl = existing['ttl']
        service_name = existing['service_name']
        remark = existing['remark']

        if 'status' in data:
            status = _sanitize_status(data.get('status')) or None
        if 'record_type' in data or 'recordType' in data:
            record_type = _sanitize_record_type(data.get('record_type') or data.get('recordType'))
        if 'host_name' in data or 'hostName' in data:
            host_name = _sanitize_text(data.get('host_name') or data.get('hostName'), max_len=255) or None
        if 'ip_address' in data or 'ipAddress' in data:
            ip_address = _sanitize_text(data.get('ip_address') or data.get('ipAddress'), max_len=255) or None
        if 'priority' in data:
            priority = _sanitize_int(data.get('priority'))
        if 'ttl' in data:
            ttl = _sanitize_ttl(data.get('ttl'))
        if 'service_name' in data or 'serviceName' in data:
            service_name = _sanitize_text(data.get('service_name') or data.get('serviceName'), max_len=255) or None
        if 'remark' in data or 'note' in data:
            remark = _sanitize_text(data.get('remark') or data.get('note'), max_len=2000) or None

        fqdn = _compute_fqdn(host_name or '', domain)
        ts = _now()

        conn.execute(
            f"""
            UPDATE {TABLE_NAME}
            SET status = ?, record_type = ?, host_name = ?, fqdn = ?, ip_address = ?, priority = ?, ttl = ?, service_name = ?, remark = ?,
                updated_at = ?, updated_by = ?
            WHERE id = ? AND policy_id = ?
            """,
            (
                status,
                record_type,
                host_name,
                fqdn or None,
                ip_address,
                priority,
                ttl,
                service_name,
                remark,
                ts,
                actor,
                int(record_id),
                int(policy_id),
            ),
        )
        _refresh_policy_record_count(conn, int(policy_id), actor)
        conn.commit()

        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ? AND policy_id = ?",
            (int(record_id), int(policy_id)),
        ).fetchone()
        after = _row_to_dict(row) if row else {}
        return {'before': before, 'after': after}


def delete_network_dns_record(policy_id: int, record_id: int, actor: str, app=None) -> int:
    actor = (actor or 'system').strip() or 'system'
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE id = ? AND policy_id = ?",
            (int(record_id), int(policy_id)),
        )
        _refresh_policy_record_count(conn, int(policy_id), actor)
        conn.commit()
        return int(cur.rowcount or 0)


def delete_network_dns_records(policy_id: int, ids: Sequence[Any], actor: str, app=None) -> int:
    actor = (actor or 'system').strip() or 'system'
    safe_ids = [int(i) for i in ids if str(i).isdigit()]
    if not safe_ids:
        return 0
    placeholders = ','.join('?' for _ in safe_ids)
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE policy_id = ? AND id IN ({placeholders})",
            [int(policy_id), *safe_ids],
        )
        _refresh_policy_record_count(conn, int(policy_id), actor)
        conn.commit()
        return int(cur.rowcount or 0)


def lookup_dns_records_by_ips(
    ip_list: List[str],
    *,
    app=None,
) -> Dict[str, Dict[str, str]]:
    """Return {ip: {fqdn, record_type, domain}} from DNS records matching given IPs."""
    if not ip_list:
        return {}

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
        placeholders = ','.join('?' for _ in clean_ips)
        sql = f"""
            SELECT r.ip_address, r.fqdn, r.record_type, r.host_name, p.domain
            FROM {TABLE_NAME} r
            LEFT JOIN {POLICY_TABLE} p ON p.id = r.policy_id AND p.is_deleted = 0
            WHERE TRIM(r.ip_address) IN ({placeholders})
        """
        rows = conn.execute(sql, clean_ips).fetchall()

    result: Dict[str, Dict[str, str]] = {}
    for row in rows:
        ip = str(row['ip_address'] or '').strip()
        if not ip:
            continue
        if ip in result:
            continue
        fqdn = str(row['fqdn'] or '').strip()
        if not fqdn:
            host = str(row['host_name'] or '').strip()
            domain = str(row['domain'] or '').strip()
            fqdn = _compute_fqdn(host, domain)
        result[ip] = {
            'fqdn': fqdn,
            'record_type': str(row['record_type'] or '').strip(),
            'domain': str(row['domain'] or '').strip(),
        }
    return result
