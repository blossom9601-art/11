import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'network_dns_policy'
DNS_TYPE_OPTIONS = [
    'Primary',
    'Secondary',
    'Stub',
    'Forward',
    'Delegated',
    'External',
    'AD-Integrated',
]
MANAGED_BY_OPTIONS = [
    'Internal',
    'External',
    'AD',
    'MSP',
    'Cloud',
]
DEFAULT_TTL = 3600
ORDERABLE_COLUMNS = {
    'id': 'id',
    'status': 'status',
    'domain': 'domain',
    'record_count': 'record_count',
    'recordcount': 'record_count',
    'dns_type': 'dns_type',
    'dnstype': 'dns_type',
    'type': 'dns_type',
    'ttl': 'ttl',
    'managed_by': 'managed_by',
    'managedby': 'managed_by',
    'role': 'role',
    'created_at': 'created_at',
    'updated_at': 'updated_at',
}
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 500


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
    return conn


def _sanitize_priority(value: Any) -> Optional[int]:
    if value is None or value == '':
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError('Priority must be an integer.') from exc


def _sanitize_record_count(value: Any) -> Optional[int]:
    if value is None or value == '':
        return None
    try:
        n = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError('Record count must be an integer.') from exc
    if n < 0:
        raise ValueError('Record count cannot be negative.')
    return n


def _sanitize_dns_type(value: Any) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    if s not in DNS_TYPE_OPTIONS:
        raise ValueError('Type must be one of: ' + ', '.join(DNS_TYPE_OPTIONS))
    return s


def _sanitize_managed_by(value: Any) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    if s not in MANAGED_BY_OPTIONS:
        raise ValueError('Managed-by must be one of: ' + ', '.join(MANAGED_BY_OPTIONS))
    return s


def _sanitize_ttl(value: Any) -> Optional[int]:
    if value is None or value == '':
        return None
    try:
        n = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError('TTL must be an integer.') from exc
    if n < 0:
        raise ValueError('TTL cannot be negative.')
    return n


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    remark = row['remark'] or ''
    ttl = row['ttl'] if 'ttl' in row.keys() else None
    if ttl is None:
        ttl = DEFAULT_TTL
    return {
        'id': row['id'],
        'status': row['status'],
        'domain': row['domain'] or '',
        'record_count': row['record_count'] if 'record_count' in row.keys() else None,
        'dns_type': row['dns_type'] if 'dns_type' in row.keys() else None,
        'ttl': ttl,
        'managed_by': row['managed_by'] if 'managed_by' in row.keys() else None,
        'role': row['role'] if 'role' in row.keys() else '',
        'remark': remark,
        'note': remark,
        'created_at': row['created_at'],
        'created_by': row['created_by'] or '',
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'] or '',
        'is_deleted': row['is_deleted'],
    }


def init_network_dns_policy_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            table_exists = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                (TABLE_NAME,),
            ).fetchone()

            if not table_exists:
                conn.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        status TEXT NOT NULL,
                        domain TEXT NOT NULL,
                        record_count INTEGER,
                        dns_type TEXT,
                        ttl INTEGER NOT NULL DEFAULT {DEFAULT_TTL},
                        managed_by TEXT,
                        role TEXT,
                        remark TEXT,
                        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        created_by TEXT NOT NULL,
                        updated_at TEXT,
                        updated_by TEXT,
                        is_deleted INTEGER NOT NULL DEFAULT 0
                    )
                    """
                )
            else:
                cols = conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall()
                col_names = {c['name'] for c in cols}

                # If legacy schema exists (record_type/value/etc with NOT NULL constraints), rebuild the table.
                legacy_markers = {'record_type', 'host', 'value', 'priority'}
                if col_names.intersection(legacy_markers):
                    old_name = f"{TABLE_NAME}__old"
                    conn.execute(f"ALTER TABLE {TABLE_NAME} RENAME TO {old_name}")
                    conn.execute(
                        f"""
                        CREATE TABLE {TABLE_NAME} (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            status TEXT NOT NULL,
                            domain TEXT NOT NULL,
                            record_count INTEGER,
                            dns_type TEXT,
                            ttl INTEGER NOT NULL DEFAULT {DEFAULT_TTL},
                            managed_by TEXT,
                            role TEXT,
                            remark TEXT,
                            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            created_by TEXT NOT NULL,
                            updated_at TEXT,
                            updated_by TEXT,
                            is_deleted INTEGER NOT NULL DEFAULT 0
                        )
                        """
                    )
                    # Copy forward what we can; new fields default to NULL.
                    conn.execute(
                        f"""
                        INSERT INTO {TABLE_NAME} (
                            id, status, domain, record_count, dns_type, ttl, managed_by, role, remark,
                            created_at, created_by, updated_at, updated_by, is_deleted
                        )
                        SELECT
                            id, status, domain, NULL AS record_count, NULL AS dns_type, {DEFAULT_TTL} AS ttl, NULL AS managed_by, NULL AS role, remark,
                            created_at, created_by, updated_at, updated_by, is_deleted
                        FROM {old_name}
                        """
                    )
                    conn.execute(f"DROP TABLE {old_name}")
                else:
                    # Non-legacy table: ensure new columns exist.
                    if 'record_count' not in col_names:
                        conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN record_count INTEGER")
                    if 'dns_type' not in col_names:
                        conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN dns_type TEXT")
                    if 'ttl' not in col_names:
                        conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN ttl INTEGER")
                        conn.execute(f"UPDATE {TABLE_NAME} SET ttl = {DEFAULT_TTL} WHERE ttl IS NULL")
                    else:
                        conn.execute(f"UPDATE {TABLE_NAME} SET ttl = {DEFAULT_TTL} WHERE ttl IS NULL")
                    if 'managed_by' not in col_names:
                        conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN managed_by TEXT")
                    if 'role' not in col_names:
                        conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN role TEXT")

            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_status ON {TABLE_NAME}(status)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_domain ON {TABLE_NAME}(domain)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_role ON {TABLE_NAME}(role)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_dns_type ON {TABLE_NAME}(dns_type)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_managed_by ON {TABLE_NAME}(managed_by)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_live ON {TABLE_NAME}(is_deleted)"
            )
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def _fetch_raw(policy_id: int, conn: sqlite3.Connection) -> Optional[sqlite3.Row]:
    return conn.execute(
        f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
        (policy_id,),
    ).fetchone()


def get_network_dns_policy(policy_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ? AND is_deleted = 0",
            (policy_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def list_network_dns_policies(
    app=None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    domain: Optional[str] = None,
    dns_type: Optional[str] = None,
    managed_by: Optional[str] = None,
    ttl: Optional[int] = None,
    role: Optional[str] = None,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    order: Optional[str] = None,
    include_deleted: bool = False,
) -> Dict[str, Any]:
    app = app or current_app
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))
    clauses = ['1=1']
    params: List[Any] = []
    if not include_deleted:
        clauses.append('is_deleted = 0')
    if search:
        like = f"%{search.strip()}%"
        clauses.append(
            "(status LIKE ? OR domain LIKE ? OR dns_type LIKE ? OR CAST(ttl AS TEXT) LIKE ? OR managed_by LIKE ? OR role LIKE ? OR remark LIKE ?)"
        )
        params.extend([like] * 7)
    if status:
        clauses.append('status = ?')
        params.append(status.strip())
    if domain:
        clauses.append('domain LIKE ?')
        params.append(f"%{domain.strip()}%")
    if dns_type:
        clauses.append('dns_type = ?')
        params.append(dns_type.strip())
    if managed_by:
        clauses.append('managed_by = ?')
        params.append(managed_by.strip())
    if ttl is not None:
        clauses.append('ttl = ?')
        params.append(int(ttl))
    if role:
        clauses.append('role LIKE ?')
        params.append(f"%{role.strip()}%")
    where_sql = ' AND '.join(clauses)
    order_sql = _resolve_order(order)
    offset = (page - 1) * page_size
    with _get_connection(app) as conn:
        base_params = list(params)
        rows = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE {where_sql} ORDER BY {order_sql} LIMIT ? OFFSET ?",
            (*params, page_size, offset),
        ).fetchall()
        total = conn.execute(
            f"SELECT COUNT(1) FROM {TABLE_NAME} WHERE {where_sql}",
            base_params,
        ).fetchone()[0]
    return {
        'items': [_row_to_dict(row) for row in rows],
        'total': total,
        'page': page,
        'page_size': page_size,
    }


def suggest_network_dns_domains(q: Optional[str] = None, limit: int = 20, app=None) -> List[str]:
    """Return distinct domain suggestions from network_dns_policy."""
    app = app or current_app
    query_text = (q or '').strip()
    lim = int(limit or 20)
    if lim <= 0:
        lim = 20
    lim = min(lim, 100)

    clauses = ["is_deleted = 0", "domain IS NOT NULL", "TRIM(domain) != ''"]
    params: List[Any] = []
    if query_text:
        clauses.append("domain LIKE ?")
        params.append(f"%{query_text}%")
    where_sql = " AND ".join(clauses)
    params.append(lim)

    with _get_connection(app) as conn:
        rows = conn.execute(
            f"SELECT DISTINCT domain FROM {TABLE_NAME} WHERE {where_sql} ORDER BY domain ASC LIMIT ?",
            params,
        ).fetchall()
    out: List[str] = []
    for r in rows:
        try:
            v = r['domain'] if isinstance(r, sqlite3.Row) else r[0]
        except Exception:
            v = None
        if v is None:
            continue
        s = str(v).strip()
        if s:
            out.append(s)
    return out


def _resolve_order(order: Optional[str]) -> str:
    if not order:
        return 'id DESC'
    direction = 'ASC'
    column = order
    if order.startswith('-'):
        direction = 'DESC'
        column = order[1:]
    key = ORDERABLE_COLUMNS.get((column or '').lower())
    if not key:
        return 'id DESC'
    return f"{key} {direction}"


def create_network_dns_policy(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    status = (data.get('status') or '').strip()
    domain_value = (data.get('domain') or '').strip()
    if not status:
        raise ValueError('Status is required.')
    if not domain_value:
        raise ValueError('Domain is required.')
    record_count = _sanitize_record_count(data.get('record_count') or data.get('recordCount'))
    dns_type = _sanitize_dns_type(data.get('dns_type') or data.get('dnsType') or data.get('type'))
    ttl = _sanitize_ttl(data.get('ttl'))
    if ttl is None:
        ttl = DEFAULT_TTL
    managed_by = _sanitize_managed_by(
        data.get('managed_by') or data.get('managedBy') or data.get('owner')
    )
    role = (data.get('role') or '').strip() or None
    remark = (data.get('remark') or data.get('note') or '').strip() or None
    timestamp = _now()
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (status, domain, record_count, dns_type, ttl, managed_by, role, remark, created_at, created_by, updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                status,
                domain_value,
                record_count,
                dns_type,
                ttl,
                managed_by,
                role,
                remark,
                timestamp,
                actor,
                timestamp,
                actor,
            ),
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
        row = _fetch_raw(new_id, conn)
    return _row_to_dict(row)


def update_network_dns_policy(policy_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    if not data:
        return get_network_dns_policy(policy_id, app)
    updates: List[str] = []
    params: List[Any] = []
    with _get_connection(app) as conn:
        existing = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ? AND is_deleted = 0",
            (policy_id,),
        ).fetchone()
        if not existing:
            return None
        if 'status' in data:
            status_val = (data.get('status') or '').strip()
            if not status_val:
                raise ValueError('Status cannot be blank.')
            updates.append('status = ?')
            params.append(status_val)
        if 'domain' in data:
            domain_value = (data.get('domain') or '').strip()
            if not domain_value:
                raise ValueError('Domain cannot be blank.')
            updates.append('domain = ?')
            params.append(domain_value)
        if 'record_count' in data or 'recordCount' in data:
            record_count = _sanitize_record_count(data.get('record_count') or data.get('recordCount'))
            updates.append('record_count = ?')
            params.append(record_count)
        if 'dns_type' in data or 'dnsType' in data or 'type' in data:
            dns_type = _sanitize_dns_type(data.get('dns_type') or data.get('dnsType') or data.get('type'))
            updates.append('dns_type = ?')
            params.append(dns_type)
        if 'ttl' in data:
            ttl_value = _sanitize_ttl(data.get('ttl'))
            if ttl_value is None:
                raise ValueError('TTL cannot be blank.')
            updates.append('ttl = ?')
            params.append(ttl_value)
        if 'managed_by' in data or 'managedBy' in data or 'owner' in data:
            managed_by = _sanitize_managed_by(
                data.get('managed_by') or data.get('managedBy') or data.get('owner')
            )
            updates.append('managed_by = ?')
            params.append(managed_by)
        if 'role' in data:
            role = (data.get('role') or '').strip() or None
            updates.append('role = ?')
            params.append(role)
        if 'remark' in data or 'note' in data:
            remark = (data.get('remark') or data.get('note') or '').strip() or None
            updates.append('remark = ?')
            params.append(remark)
        if not updates:
            return _row_to_dict(existing)
        timestamp = _now()
        updates.extend(['updated_at = ?', 'updated_by = ?'])
        params.extend([timestamp, actor, policy_id])
        conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        conn.commit()
        row = _fetch_raw(policy_id, conn)
        return _row_to_dict(row)


def delete_network_dns_policies(ids: Sequence[Any], actor: str, app=None) -> int:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    safe_ids = [int(i) for i in ids if str(i).isdigit()]
    if not safe_ids:
        return 0
    placeholders = ','.join('?' for _ in safe_ids)
    timestamp = _now()
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id IN ({placeholders}) AND is_deleted = 0",
            [timestamp, actor, *safe_ids],
        )
        conn.commit()
        return cur.rowcount
