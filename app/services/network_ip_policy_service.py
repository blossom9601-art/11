import ipaddress
import json
import logging
import os
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'network_ip_policy'
LOG_TABLE_NAME = 'network_ip_policy_log'
ADDRESS_TABLE_NAME = 'network_ip_policy_address'
ORDERABLE_COLUMNS = {
    'id': 'id',
    'status': 'status',
    'ip_version': 'ip_version',
    'start_ip': 'start_ip',
    'end_ip': 'end_ip',
    'ip_count': 'ip_count',
    'utilization_rate': 'utilization_rate',
    'created_at': 'created_at',
    'updated_at': 'updated_at',
}
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 500


def _kst_tzinfo():
    """Return a tzinfo for Asia/Seoul (KST), with a safe fallback."""
    try:
        from zoneinfo import ZoneInfo  # type: ignore

        return ZoneInfo('Asia/Seoul')
    except Exception:
        # Fallback for environments without zoneinfo database.
        return timezone(timedelta(hours=9))


def _format_datetime_kst(value: Any) -> str:
    """Format a datetime-ish value as KST `YYYY-MM-DD HH:MM:SS`.

    Notes:
    - network_ip_policy_log.created_at is stored as SQLite text with DEFAULT CURRENT_TIMESTAMP
      which is UTC (`YYYY-MM-DD HH:MM:SS`).
    - We keep storage as-is and convert only for API/UI display.
    """
    if value is None:
        return ''

    dt: Optional[datetime] = None

    if isinstance(value, datetime):
        dt = value
    else:
        s = str(value).strip()
        if not s:
            return ''

        # Common SQLite formats.
        for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M:%S.%f'):
            try:
                dt = datetime.strptime(s, fmt)
                break
            except ValueError:
                dt = None

        # ISO-ish fallback.
        if dt is None:
            try:
                iso = s.replace('Z', '+00:00')
                dt = datetime.fromisoformat(iso)
            except Exception:
                dt = None

    if dt is None:
        return str(value)

    # Treat naive datetimes as UTC for this subsystem.
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    dt_kst = dt.astimezone(_kst_tzinfo())
    return dt_kst.strftime('%Y-%m-%d %H:%M:%S')


def _compute_utilization_percent(assigned_count: int, ip_count: int) -> float:
    """Return utilization as an integer percent stored as float (e.g., 2.0).

    We keep it integer-like so existing frontends using parseInt display correctly.
    """
    try:
        assigned = int(assigned_count or 0)
        total = int(ip_count or 0)
    except (TypeError, ValueError):
        return 0.0
    if total <= 0:
        return 0.0
    pct = (assigned * 100.0) / float(total)
    pct = float(int(round(pct)))
    pct = max(0.0, min(pct, 100.0))
    return pct


def _fetch_assigned_counts(conn: sqlite3.Connection, policy_ids: Sequence[int]) -> Dict[int, int]:
    safe_ids = [int(x) for x in policy_ids if isinstance(x, (int,)) or str(x).isdigit()]
    if not safe_ids:
        return {}
    placeholders = ','.join(['?'] * len(safe_ids))
    rows = conn.execute(
        f"""
        SELECT policy_id, COUNT(1) AS assigned
        FROM {ADDRESS_TABLE_NAME}
        WHERE policy_id IN ({placeholders})
          AND COALESCE(status, '') NOT IN ('', '미사용')
        GROUP BY policy_id
        """,
        tuple(safe_ids),
    ).fetchall()
    out: Dict[int, int] = {int(pid): 0 for pid in safe_ids}
    for r in rows:
        out[int(r['policy_id'])] = int(r['assigned'] or 0)
    return out


def _refresh_policy_utilization_rates(
    conn: sqlite3.Connection,
    policy_rows: Sequence[sqlite3.Row],
) -> Dict[int, float]:
    """Compute utilization_rate for the given policy rows.

    Returns a map of policy_id -> computed utilization. Updates DB for rows that changed.
    """
    ids = [int(r['id']) for r in policy_rows or [] if r is not None and r['id'] is not None]
    assigned = _fetch_assigned_counts(conn, ids)
    updates: List[Tuple[float, int]] = []
    computed: Dict[int, float] = {}
    for r in policy_rows or []:
        pid = int(r['id'])
        ip_count = int(r['ip_count'] or 0)
        util = _compute_utilization_percent(assigned.get(pid, 0), ip_count)
        computed[pid] = util
        existing = r['utilization_rate'] if r['utilization_rate'] is not None else 0.0
        # Persist only if value actually changed (tolerate minor float representation)
        if float(existing) != float(util):
            updates.append((util, pid))
    if updates:
        conn.executemany(
            f"UPDATE {TABLE_NAME} SET utilization_rate = ?, updated_at = updated_at WHERE id = ?",
            updates,
        )
        conn.commit()
    return computed


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    override = app.config.get('NETWORK_IP_POLICY_SQLITE_PATH')
    if override:
        return os.path.abspath(override)
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):  # default to instance folder when not sqlite
        return os.path.join(app.instance_path, 'network_ip_policy.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'network_ip_policy.db')
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


def _normalize_version(value: Optional[str]) -> str:
    if not value:
        return ''
    token = value.strip().upper()
    if token in {'IPV4', '4'}:
        return 'IPv4'
    if token in {'IPV6', '6'}:
        return 'IPv6'
    if token.startswith('IPV') and len(token) == 4 and token[-1] in {'4', '6'}:
        return f"IPv{token[-1]}"
    return ''


def _sanitize_rate(value: Any) -> float:
    if value is None or value == '':
        return 0.0
    try:
        num = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError('Invalid utilization rate value.') from exc
    num = max(0.0, min(num, 100.0))
    return round(num, 4)


def _calculate_ip_count(start_ip: str, end_ip: str) -> Tuple[int, str]:
    try:
        start = ipaddress.ip_address((start_ip or '').strip())
        end = ipaddress.ip_address((end_ip or '').strip())
    except ValueError as exc:
        raise ValueError('Invalid IP address input.') from exc
    if start.version != end.version:
        raise ValueError('Start and end IP versions must match.')
    if end < start:
        raise ValueError('End IP must be greater than or equal to start IP.')
    diff = int(end) - int(start) + 1
    if diff > 9_223_372_036_854_775_807:
        raise ValueError('IP range is too large to store.')
    return diff, f'IPv{start.version}'


def _generate_policy_code(conn: sqlite3.Connection, start_ip: str, end_ip: str) -> str:
    base_seed = f"IP_{start_ip}_{end_ip}".upper()
    base = re.sub(r'[^A-Z0-9]+', '_', base_seed).strip('_') or 'IP'
    base = base[:48]
    candidate = base
    suffix = 1
    while True:
        exists = conn.execute(
            f"SELECT 1 FROM {TABLE_NAME} WHERE policy_code = ?",
            (candidate,),
        ).fetchone()
        if not exists:
            return candidate
        suffix += 1
        candidate = f"{base}_{suffix}"[:60]


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    start_ip = row['start_ip']
    end_ip = row['end_ip']
    ip_range = ''
    if start_ip and end_ip:
        ip_range = f"{start_ip} ~ {end_ip}"
    description = row['description'] or ''
    utilization = row['utilization_rate'] if row['utilization_rate'] is not None else 0.0
    return {
        'id': row['id'],
        'status': row['status'],
        'ip_version': row['ip_version'],
        'start_ip': start_ip,
        'end_ip': end_ip,
        'ip_count': row['ip_count'],
        'utilization_rate': utilization,
        'allocation_rate': utilization,
        'center_code': row['center_code'] or '',
        'location': row['center_code'] or '',
        'role': row['role'] or '',
        'description': description,
        'note': description,
        'policy_name': row['policy_name'] or '',
        'policy_code': row['policy_code'] or '',
        'created_by': row['created_by'] or '',
        'updated_by': row['updated_by'] or '',
        'created_at': row['created_at'],
        'updated_at': row['updated_at'],
        'ip_range': ip_range,
    }


def _row_to_log_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    diff = None
    raw = row['diff_json']
    if raw:
        try:
            diff = json.loads(raw)
        except Exception:
            diff = None
    return {
        'log_id': row['log_id'],
        'policy_id': row['policy_id'],
        'tab_key': row['tab_key'],
        'entity': row['entity'],
        'entity_id': row['entity_id'],
        'action': row['action'],
        'actor': row['actor'],
        'message': row['message'],
        'reason': (row['reason'] or '') if 'reason' in row.keys() else '',
        'diff': diff,
        'created_at': _format_datetime_kst(row['created_at']),
    }


def update_network_ip_policy_log_reason(
    policy_id: int,
    log_id: int,
    *,
    reason: str,
    app=None,
) -> Optional[Dict[str, Any]]:
    app = app or current_app
    rid = int(log_id)
    pid = int(policy_id)
    reason_text = (reason or '').strip()
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT log_id FROM {LOG_TABLE_NAME} WHERE policy_id = ? AND log_id = ?",
            (pid, rid),
        ).fetchone()
        if not row:
            return None
        conn.execute(
            f"UPDATE {LOG_TABLE_NAME} SET reason = ? WHERE policy_id = ? AND log_id = ?",
            (reason_text, pid, rid),
        )
        conn.commit()
        updated = conn.execute(
            f"SELECT * FROM {LOG_TABLE_NAME} WHERE policy_id = ? AND log_id = ?",
            (pid, rid),
        ).fetchone()
    return _row_to_log_dict(updated)


def init_network_ip_policy_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    status TEXT NOT NULL,
                    ip_version TEXT NOT NULL,
                    start_ip TEXT NOT NULL,
                    end_ip TEXT NOT NULL,
                    ip_count INTEGER NOT NULL,
                    utilization_rate REAL DEFAULT 0,
                    center_code TEXT,
                    role TEXT,
                    description TEXT,
                    policy_name TEXT,
                    policy_code TEXT UNIQUE,
                    created_by TEXT,
                    updated_by TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_status ON {TABLE_NAME}(status)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_version ON {TABLE_NAME}(ip_version)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_center ON {TABLE_NAME}(center_code)"
            )

            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {LOG_TABLE_NAME} (
                    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    policy_id INTEGER NOT NULL,
                    tab_key TEXT NOT NULL,
                    entity TEXT NOT NULL,
                    entity_id INTEGER,
                    action TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    message TEXT,
                    reason TEXT,
                    diff_json TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            # Backfill: older DBs may not have the 'reason' column yet.
            try:
                cols = {r['name'] for r in conn.execute(f"PRAGMA table_info({LOG_TABLE_NAME})").fetchall()}
                if 'reason' not in cols:
                    conn.execute(f"ALTER TABLE {LOG_TABLE_NAME} ADD COLUMN reason TEXT")
            except Exception:
                logger.exception('Failed to ensure %s.reason column', LOG_TABLE_NAME)
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{LOG_TABLE_NAME}_policy ON {LOG_TABLE_NAME}(policy_id)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{LOG_TABLE_NAME}_created ON {LOG_TABLE_NAME}(created_at)"
            )

            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {ADDRESS_TABLE_NAME} (
                    policy_id INTEGER NOT NULL,
                    ip_address TEXT NOT NULL,
                    status TEXT,
                    role TEXT,
                    dns_domain TEXT,
                    system_name TEXT,
                    port TEXT,
                    note TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT,
                    updated_by TEXT,
                    PRIMARY KEY (policy_id, ip_address)
                )
                """
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{ADDRESS_TABLE_NAME}_policy ON {ADDRESS_TABLE_NAME}(policy_id)"
            )
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def _fetch_policy_row(policy_id: int, conn: sqlite3.Connection) -> Optional[sqlite3.Row]:
    return conn.execute(
        f"SELECT id, start_ip, end_ip FROM {TABLE_NAME} WHERE id = ?",
        (int(policy_id),),
    ).fetchone()


def _ip_slice(start_ip: str, end_ip: str, offset: int, limit: int) -> Tuple[List[str], int, str]:
    start = ipaddress.ip_address((start_ip or '').strip())
    end = ipaddress.ip_address((end_ip or '').strip())
    if start.version != end.version:
        raise ValueError('Start and end IP versions must match.')
    if end < start:
        raise ValueError('End IP must be greater than or equal to start IP.')

    total = int(end) - int(start) + 1
    if total < 0:
        total = 0
    if offset >= total:
        return [], total, f'IPv{start.version}'

    cls = type(start)
    end_index = min(int(start) + offset + limit - 1, int(end))
    cur = int(start) + offset
    out: List[str] = []
    while cur <= end_index:
        out.append(str(cls(cur)))
        cur += 1
    return out, total, f'IPv{start.version}'


def list_network_ip_policy_addresses(
    policy_id: int,
    page: int = 1,
    page_size: int = 50,
    app=None,
) -> Dict[str, Any]:
    app = app or current_app
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or 50), 200))
    offset = (page - 1) * page_size

    with _get_connection(app) as conn:
        prow = _fetch_policy_row(policy_id, conn)
        if not prow:
            raise ValueError('대상을 찾을 수 없습니다.')
        ips, total, version = _ip_slice(prow['start_ip'], prow['end_ip'], offset, page_size)

        saved: Dict[str, Dict[str, Any]] = {}
        if ips:
            placeholders = ','.join(['?'] * len(ips))
            rows = conn.execute(
                f"SELECT * FROM {ADDRESS_TABLE_NAME} WHERE policy_id = ? AND ip_address IN ({placeholders})",
                (int(policy_id), *ips),
            ).fetchall()
            for r in rows:
                saved[r['ip_address']] = {
                    'ip_address': r['ip_address'],
                    'status': r['status'] or '',
                    'role': r['role'] or '',
                    'dns_domain': r['dns_domain'] or '',
                    'system_name': r['system_name'] or '',
                    'port': r['port'] or '',
                    'note': r['note'] or '',
                }

        items: List[Dict[str, Any]] = []
        for ip in ips:
            items.append(
                saved.get(
                    ip,
                    {
                        'ip_address': ip,
                        'status': '',
                        'role': '',
                        'dns_domain': '',
                        'system_name': '',
                        'port': '',
                        'note': '',
                    },
                )
            )

    return {
        'items': items,
        'total': int(total or 0),
        'page': page,
        'page_size': page_size,
        'ip_version': version,
    }


def save_network_ip_policy_addresses(
    policy_id: int,
    items: List[Dict[str, Any]],
    actor: str,
    app=None,
) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    allowed_status = {'', '활성', '예약', '미사용', 'DHCP', 'SLAAC'}
    allowed_role = {'', 'Loopback', 'Primary', 'Secondary', 'Anycast', 'VIP', 'VRRP', 'HSRP', 'GLBP', 'CARP'}

    with _get_connection(app) as conn:
        prow = _fetch_policy_row(policy_id, conn)
        if not prow:
            raise ValueError('대상을 찾을 수 없습니다.')
        start = ipaddress.ip_address((prow['start_ip'] or '').strip())
        end = ipaddress.ip_address((prow['end_ip'] or '').strip())
        if end < start:
            raise ValueError('IP 범위가 올바르지 않습니다.')

        def _norm_text(value: Any) -> str:
            return (value or '').strip()

        desired_by_ip: Dict[str, Dict[str, Any]] = {}
        ordered_ips: List[str] = []
        for raw in items or []:
            ip_text = _norm_text(raw.get('ip_address'))
            if not ip_text:
                continue
            try:
                ip_obj = ipaddress.ip_address(ip_text)
            except ValueError as exc:
                raise ValueError('유효하지 않은 IP 주소입니다.') from exc
            if ip_obj.version != start.version:
                raise ValueError('IP 버전이 범위와 일치하지 않습니다.')
            if ip_obj < start or ip_obj > end:
                raise ValueError('IP 주소가 정책 범위를 벗어났습니다.')

            status = _norm_text(raw.get('status'))
            role = _norm_text(raw.get('role'))
            if status not in allowed_status:
                raise ValueError('상태 값이 올바르지 않습니다.')
            if role not in allowed_role:
                raise ValueError('역할 값이 올바르지 않습니다.')

            payload = {
                'status': status,
                'role': role,
                'dns_domain': _norm_text(raw.get('dns_domain')),
                'system_name': _norm_text(raw.get('system_name')),
                'port': _norm_text(raw.get('port')),
                'note': _norm_text(raw.get('note')),
            }
            desired_by_ip[ip_text] = payload
            ordered_ips.append(ip_text)

        existing_by_ip: Dict[str, Dict[str, Any]] = {}
        if desired_by_ip:
            placeholders = ','.join(['?'] * len(desired_by_ip))
            rows = conn.execute(
                f"SELECT ip_address, status, role, dns_domain, system_name, port, note FROM {ADDRESS_TABLE_NAME} WHERE policy_id = ? AND ip_address IN ({placeholders})",
                (int(policy_id), *desired_by_ip.keys()),
            ).fetchall()
            for row in rows:
                existing_by_ip[row['ip_address']] = {
                    'status': (row['status'] or '').strip(),
                    'role': (row['role'] or '').strip(),
                    'dns_domain': (row['dns_domain'] or '').strip(),
                    'system_name': (row['system_name'] or '').strip(),
                    'port': (row['port'] or '').strip(),
                    'note': (row['note'] or '').strip(),
                }

        changed_rows: List[Dict[str, Any]] = []
        updated = 0
        timestamp = _now()
        for ip_text in ordered_ips:
            desired = desired_by_ip[ip_text]
            before = existing_by_ip.get(ip_text)

            before_cmp = before or {
                'status': '',
                'role': '',
                'dns_domain': '',
                'system_name': '',
                'port': '',
                'note': '',
            }
            is_changed = any(before_cmp.get(k, '') != desired.get(k, '') for k in desired.keys())
            if is_changed:
                changed_rows.append(
                    {
                        'ip_address': ip_text,
                        'before': before_cmp,
                        'after': desired,
                    }
                )

            dns_domain = desired['dns_domain'] or None
            system_name = desired['system_name'] or None
            port = desired['port'] or None
            note = desired['note'] or None
            status = desired['status'] or None
            role = desired['role'] or None

            conn.execute(
                f"""
                INSERT INTO {ADDRESS_TABLE_NAME}
                    (policy_id, ip_address, status, role, dns_domain, system_name, port, note, created_at, updated_at, updated_by)
                VALUES
                    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(policy_id, ip_address) DO UPDATE SET
                    status=excluded.status,
                    role=excluded.role,
                    dns_domain=excluded.dns_domain,
                    system_name=excluded.system_name,
                    port=excluded.port,
                    note=excluded.note,
                    updated_at=excluded.updated_at,
                    updated_by=excluded.updated_by
                """,
                (
                    int(policy_id),
                    ip_text,
                    status,
                    role,
                    dns_domain,
                    system_name,
                    port,
                    note,
                    timestamp,
                    timestamp,
                    actor,
                ),
            )
            updated += 1

        # Refresh utilization_rate based on assigned addresses vs policy ip_count.
        try:
            policy_row = conn.execute(
                f"SELECT id, ip_count, utilization_rate FROM {TABLE_NAME} WHERE id = ?",
                (int(policy_id),),
            ).fetchone()
            if policy_row:
                _refresh_policy_utilization_rates(conn, [policy_row])
        except Exception:
            logger.exception('Failed to refresh utilization_rate after saving addresses')

        conn.commit()

    if changed_rows:
        try:
            # UX: show the number of modified fields (columns), not the number of IP rows.
            changed_fields = 0
            for r in changed_rows:
                before = r.get('before') if isinstance(r, dict) else None
                after = r.get('after') if isinstance(r, dict) else None
                if isinstance(before, dict) and isinstance(after, dict):
                    changed_fields += sum(1 for k, v in after.items() if before.get(k, '') != v)
                else:
                    changed_fields += 1
            if changed_fields <= 0:
                changed_fields = len(changed_rows)

            changed_row_count = len(changed_rows)
            first_ip = None
            try:
                first_ip = (changed_rows[0] or {}).get('ip_address')
            except Exception:
                first_ip = None

            if first_ip:
                if changed_row_count == 1:
                    prefix = f"IP {first_ip} 내용 수정"
                else:
                    prefix = f"IP {first_ip} 외 {changed_row_count - 1}개 내용 수정"
            else:
                prefix = 'IP 범위 수정'

            append_network_ip_policy_log(
                policy_id,
                tab_key='gov_ip_policy_ip_range',
                entity='ADDRESS',
                action='UPDATE',
                actor=actor,
                message=f"{prefix} (데이터 {changed_fields}개 수정)",
                diff={
                    'changed': changed_rows,
                    'changed_fields': changed_fields,
                },
                app=app,
            )
        except Exception:
            logger.exception('Failed to append IP range change log')

    return {'updated': updated}


def append_network_ip_policy_log(
    policy_id: int,
    *,
    tab_key: str,
    entity: str,
    entity_id: Optional[int] = None,
    action: str,
    actor: str,
    message: str,
    diff: Optional[Dict[str, Any]] = None,
    app=None,
) -> None:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = json.dumps(diff, ensure_ascii=False) if diff else None
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            INSERT INTO {LOG_TABLE_NAME} (policy_id, tab_key, entity, entity_id, action, actor, message, diff_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                int(policy_id),
                (tab_key or '').strip() or 'gov_ip_policy_detail',
                (entity or 'POLICY').strip() or 'POLICY',
                int(entity_id) if entity_id is not None else None,
                (action or '').strip().upper() or 'UPDATE',
                actor,
                (message or '').strip() or None,
                payload,
            ),
        )
        conn.commit()


def list_network_ip_policy_logs(
    policy_id: int,
    *,
    page: int = 1,
    page_size: int = 50,
    app=None,
) -> Dict[str, Any]:
    app = app or current_app
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or 50), 200))
    offset = (page - 1) * page_size
    with _get_connection(app) as conn:
        rows = conn.execute(
            f"""
            SELECT * FROM {LOG_TABLE_NAME}
            WHERE policy_id = ?
            ORDER BY created_at DESC, log_id DESC
            LIMIT ? OFFSET ?
            """,
            (int(policy_id), page_size, offset),
        ).fetchall()
        total = conn.execute(
            f"SELECT COUNT(1) FROM {LOG_TABLE_NAME} WHERE policy_id = ?",
            (int(policy_id),),
        ).fetchone()[0]
    return {
        'items': [_row_to_log_dict(r) for r in rows],
        'total': int(total or 0),
        'page': page,
        'page_size': page_size,
    }


def _fetch_raw(policy_id: int, conn: sqlite3.Connection) -> Optional[sqlite3.Row]:
    return conn.execute(
        f"SELECT id, status, ip_version, start_ip, end_ip, ip_count, utilization_rate, center_code, role, description, policy_name, policy_code, created_by, updated_by, created_at, updated_at FROM {TABLE_NAME} WHERE id = ?",
        (policy_id,),
    ).fetchone()


def get_network_ip_policy(policy_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = _fetch_raw(policy_id, conn)
        if not row:
            return None
        computed = _refresh_policy_utilization_rates(conn, [row])
        payload = _row_to_dict(row)
        util = computed.get(int(payload.get('id') or policy_id))
        if util is not None:
            payload['utilization_rate'] = util
            payload['allocation_rate'] = util
        return payload


def list_network_ip_policies(
    app=None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    ip_version: Optional[str] = None,
    center_code: Optional[str] = None,
    role: Optional[str] = None,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    order: Optional[str] = None,
) -> Dict[str, Any]:
    app = app or current_app
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))
    clauses = ['1=1']
    params: List[Any] = []
    if search:
        like = f"%{search.strip()}%"
        clauses.append(
            "(status LIKE ? OR ip_version LIKE ? OR start_ip LIKE ? OR end_ip LIKE ? OR role LIKE ? OR description LIKE ? OR center_code LIKE ? OR policy_name LIKE ? OR policy_code LIKE ?)"
        )
        params.extend([like] * 9)
    if status:
        clauses.append('status = ?')
        params.append(status.strip())
    if ip_version:
        clauses.append('ip_version = ?')
        params.append(_normalize_version(ip_version) or ip_version.strip())
    if center_code:
        clauses.append('center_code = ?')
        params.append(center_code.strip())
    if role:
        clauses.append('role = ?')
        params.append(role.strip())
    where_sql = ' AND '.join(clauses)
    order_sql = _resolve_order(order)
    offset = (page - 1) * page_size
    with _get_connection(app) as conn:
        base_params = list(params)
        rows = conn.execute(
            f"SELECT id, status, ip_version, start_ip, end_ip, ip_count, utilization_rate, center_code, role, description, policy_name, policy_code, created_by, updated_by, created_at, updated_at FROM {TABLE_NAME} WHERE {where_sql} ORDER BY {order_sql} LIMIT ? OFFSET ?",
            (*params, page_size, offset),
        ).fetchall()
        computed = _refresh_policy_utilization_rates(conn, rows)
        total = conn.execute(
            f"SELECT COUNT(1) FROM {TABLE_NAME} WHERE {where_sql}",
            base_params,
        ).fetchone()[0]

    items: List[Dict[str, Any]] = []
    for row in rows:
        d = _row_to_dict(row)
        pid = int(row['id'])
        if pid in computed:
            d['utilization_rate'] = computed[pid]
            d['allocation_rate'] = computed[pid]
        items.append(d)
    return {
        'items': items,
        'total': total,
        'page': page,
        'page_size': page_size,
    }


def _resolve_order(order: Optional[str]) -> str:
    if not order:
        return 'id DESC'
    direction = 'ASC'
    column = order
    if order.startswith('-'):
        direction = 'DESC'
        column = order[1:]
    key = ORDERABLE_COLUMNS.get(column.lower()) if column else None
    if not key:
        return 'id DESC'
    return f"{key} {direction}"


def create_network_ip_policy(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    status = (data.get('status') or '').strip()
    if not status:
        raise ValueError('Status is required.')
    start_ip = (data.get('start_ip') or '').strip()
    end_ip = (data.get('end_ip') or '').strip()
    if not start_ip or not end_ip:
        raise ValueError('Both start_ip and end_ip are required.')
    ip_count, inferred_version = _calculate_ip_count(start_ip, end_ip)
    ip_version_value = _normalize_version(data.get('ip_version')) or inferred_version
    if ip_version_value != inferred_version:
        raise ValueError('IP version does not match the provided addresses.')
    utilization_rate = _sanitize_rate(data.get('utilization_rate') or data.get('allocation_rate'))
    center_code = (data.get('center_code') or data.get('location') or '').strip() or None
    role = (data.get('role') or '').strip() or None
    description = (data.get('description') or data.get('note') or '').strip() or None
    policy_name = (data.get('policy_name') or '').strip() or f"{start_ip} ~ {end_ip}"
    requested_code = (data.get('policy_code') or data.get('policyCode') or '').strip().upper() or None
    timestamp = _now()
    with _get_connection(app) as conn:
        policy_code = requested_code or _generate_policy_code(conn, start_ip, end_ip)
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (status, ip_version, start_ip, end_ip, ip_count, utilization_rate, center_code, role, description, policy_name, policy_code, created_by, updated_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                status,
                ip_version_value,
                start_ip,
                end_ip,
                ip_count,
                utilization_rate,
                center_code,
                role,
                description,
                policy_name,
                policy_code,
                actor,
                actor,
                timestamp,
                timestamp,
            ),
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
        row = _fetch_raw(new_id, conn)
    created = _row_to_dict(row)
    try:
        append_network_ip_policy_log(
            int(created.get('id')),
            tab_key='gov_ip_policy_detail',
            entity='POLICY',
            entity_id=int(created.get('id')),
            action='CREATE',
            actor=actor,
            message=f"IP 정책 생성: {created.get('start_ip')} ~ {created.get('end_ip')}",
            diff={'after': created},
            app=app,
        )
    except Exception:
        logger.exception('Failed to append IP policy create log')
    return created


def update_network_ip_policy(policy_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    if not data:
        return get_network_ip_policy(policy_id, app)
    updates: List[str] = []
    params: List[Any] = []
    recalculate = False
    start_ip = (data.get('start_ip') or '').strip() or None
    end_ip = (data.get('end_ip') or '').strip() or None
    desired_version = _normalize_version(data.get('ip_version')) if 'ip_version' in data else None
    with _get_connection(app) as conn:
        existing = _fetch_raw(policy_id, conn)
        if not existing:
            return None
        before = _row_to_dict(existing)
        current_start = existing['start_ip']
        current_end = existing['end_ip']
        current_version = existing['ip_version']
        if start_ip:
            updates.append('start_ip = ?')
            params.append(start_ip)
            current_start = start_ip
            recalculate = True
        if end_ip:
            updates.append('end_ip = ?')
            params.append(end_ip)
            current_end = end_ip
            recalculate = True
        if recalculate:
            ip_count, inferred = _calculate_ip_count(current_start, current_end)
            updates.append('ip_count = ?')
            params.append(ip_count)
            desired = desired_version or inferred
            if desired != inferred:
                raise ValueError('IP version does not match the provided addresses.')
            updates.append('ip_version = ?')
            params.append(desired)
        elif desired_version:
            if desired_version != current_version:
                raise ValueError('Changing ip_version requires updating both start and end IPs.')
        if 'status' in data:
            status_val = (data.get('status') or '').strip()
            if not status_val:
                raise ValueError('Status cannot be blank.')
            updates.append('status = ?')
            params.append(status_val)
        if 'utilization_rate' in data or 'allocation_rate' in data:
            rate = _sanitize_rate(data.get('utilization_rate') if 'utilization_rate' in data else data.get('allocation_rate'))
            updates.append('utilization_rate = ?')
            params.append(rate)
        if 'center_code' in data or 'location' in data:
            center_code = (data.get('center_code') or data.get('location') or '').strip() or None
            updates.append('center_code = ?')
            params.append(center_code)
        if 'role' in data:
            role = (data.get('role') or '').strip() or None
            updates.append('role = ?')
            params.append(role)
        if 'description' in data or 'note' in data:
            description = (data.get('description') or data.get('note') or '').strip() or None
            updates.append('description = ?')
            params.append(description)
        if 'policy_name' in data:
            policy_name = (data.get('policy_name') or '').strip() or None
            updates.append('policy_name = ?')
            params.append(policy_name)
        if 'policy_code' in data:
            code = (data.get('policy_code') or '').strip().upper()
            if not code:
                raise ValueError('policy_code cannot be blank when provided.')
            updates.append('policy_code = ?')
            params.append(code)
        if not updates:
            return _row_to_dict(existing)
        timestamp = _now()
        updates.extend(['updated_at = ?', 'updated_by = ?'])
        params.extend([timestamp, actor, policy_id])
        conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ?",
            params,
        )

        # If the range changed and caller didn't explicitly set the rate, refresh from addresses.
        if recalculate and 'utilization_rate' not in data and 'allocation_rate' not in data:
            try:
                policy_row = conn.execute(
                    f"SELECT id, ip_count, utilization_rate FROM {TABLE_NAME} WHERE id = ?",
                    (int(policy_id),),
                ).fetchone()
                if policy_row:
                    _refresh_policy_utilization_rates(conn, [policy_row])
            except Exception:
                logger.exception('Failed to refresh utilization_rate after policy range update')
        conn.commit()
        row = _fetch_raw(policy_id, conn)
        updated = _row_to_dict(row)
        try:
            keys = [
                'status', 'ip_version', 'start_ip', 'end_ip', 'ip_count',
                'utilization_rate', 'center_code', 'role', 'description',
                'policy_name', 'policy_code'
            ]
            changes: Dict[str, Any] = {}
            for k in keys:
                if before.get(k) != updated.get(k):
                    changes[k] = {'before': before.get(k), 'after': updated.get(k)}
            if changes:
                append_network_ip_policy_log(
                    int(updated.get('id')),
                    tab_key='gov_ip_policy_detail',
                    entity='POLICY',
                    entity_id=int(updated.get('id')),
                    action='UPDATE',
                    actor=actor,
                    message='IP 정책 수정',
                    diff={'changes': changes},
                    app=app,
                )
        except Exception:
            logger.exception('Failed to append IP policy update log')
        return updated


def delete_network_ip_policies(ids: Sequence[Any], actor: str = 'system', app=None) -> int:
    app = app or current_app
    safe_ids = [int(i) for i in ids if str(i).isdigit()]
    if not safe_ids:
        return 0
    placeholders = ','.join('?' for _ in safe_ids)
    with _get_connection(app) as conn:
        existing_rows = conn.execute(
            f"SELECT id, status, ip_version, start_ip, end_ip, ip_count, utilization_rate, center_code, role, description, policy_name, policy_code, created_by, updated_by, created_at, updated_at FROM {TABLE_NAME} WHERE id IN ({placeholders})",
            safe_ids,
        ).fetchall()
        cur = conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE id IN ({placeholders})",
            safe_ids,
        )
        conn.commit()
        deleted = int(cur.rowcount or 0)
    if deleted:
        for r in existing_rows or []:
            try:
                before = _row_to_dict(r)
                append_network_ip_policy_log(
                    int(before.get('id')),
                    tab_key='gov_ip_policy_detail',
                    entity='POLICY',
                    entity_id=int(before.get('id')),
                    action='DELETE',
                    actor=actor,
                    message=f"IP 정책 삭제: {before.get('start_ip')} ~ {before.get('end_ip')}",
                    diff={'before': before},
                    app=app,
                )
            except Exception:
                logger.exception('Failed to append IP policy delete log')
    return deleted
