import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'org_department'


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        fallback = app.config.get('ORG_DEPARTMENT_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'org_department.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'org_department.db')
    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    # Flask-SQLAlchemy treats relative SQLite filenames as relative to the instance folder.
    # Keep org_department_service aligned with that to avoid splitting data across files.
    relative = path.lstrip('/')
    if relative and not os.path.isabs(relative):
        # If it's just a filename (no directory), store in instance_path.
        if os.path.basename(relative) == relative:
            return os.path.abspath(os.path.join(app.instance_path, relative))
        return os.path.abspath(os.path.join(_project_root(app), relative))

    if os.path.isabs(path):
        return os.path.abspath(path)
    return os.path.abspath(os.path.join(app.instance_path, 'org_department.db'))


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


def _sanitize_int(value: Any) -> Optional[int]:
    if value is None or value == '':
        return None
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return None


def _generate_unique_code(conn: sqlite3.Connection, name: str) -> str:
    seed = (name or 'DEPT').upper()
    base = re.sub(r'[^A-Z0-9]+', '_', seed).strip('_') or 'DEPT'
    base = base[:40]
    candidate = base
    suffix = 1
    while True:
        exists = conn.execute(
            f"SELECT 1 FROM {TABLE_NAME} WHERE dept_code = ?",
            (candidate,)
        ).fetchone()
        if not exists:
            return candidate
        suffix += 1
        candidate = f"{base}_{suffix}"[:60]


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    return {
        'id': row['id'],
        'dept_code': row['dept_code'],
        'company_name': row['company_name'] or '',
        'dept_name': row['dept_name'],
        'description': row['description'] or '',
        'manager_name': row['manager_name'] or '',
        'manager_emp_no': row['manager_emp_no'] or '',
        'staff_count': row['member_count'],
        'member_count': row['member_count'],
        'rack_qty': 0,
        'rack_count': 0,
        'hw_qty': row['hw_count'],
        'hw_count': row['hw_count'],
        'sw_qty': row['sw_count'],
        'sw_count': row['sw_count'],
        'line_qty': 0,
        'line_count': 0,
        'note': row['remark'] or '',
        'remark': row['remark'] or '',
        'parent_dept_code': row['parent_dept_code'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
    }


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    try:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
            (name,),
        ).fetchone()
        return bool(row)
    except Exception:
        return False


def _column_exists(conn: sqlite3.Connection, table_name: str, column_name: str) -> bool:
    try:
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        for row in rows:
            if str(row['name']).strip().lower() == column_name.strip().lower():
                return True
    except Exception:
        return False
    return False


def _ensure_company_name_column(conn: sqlite3.Connection) -> None:
    if not _column_exists(conn, TABLE_NAME, 'company_name'):
        conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN company_name TEXT")


def init_org_department_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    dept_code TEXT NOT NULL UNIQUE,
                    company_name TEXT,
                    dept_name TEXT NOT NULL,
                    description TEXT,
                    manager_name TEXT,
                    manager_emp_no TEXT,
                    member_count INTEGER DEFAULT 0,
                    hw_count INTEGER DEFAULT 0,
                    sw_count INTEGER DEFAULT 0,
                    remark TEXT,
                    parent_dept_code TEXT,
                    created_at TEXT NOT NULL,
                    created_by TEXT NOT NULL,
                    updated_at TEXT,
                    updated_by TEXT,
                    is_deleted INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_is_deleted ON {TABLE_NAME}(is_deleted)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_parent ON {TABLE_NAME}(parent_dept_code)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_name ON {TABLE_NAME}(dept_name)"
            )
            _ensure_company_name_column(conn)
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize org_department table')
        raise


def _compute_dept_counts(conn: sqlite3.Connection, dept_codes: List[str]) -> Dict[str, Dict[str, int]]:
    """Count racks, hardware, software, and lines per dept_code from tables in the same DB."""
    if not dept_codes:
        return {}
    result: Dict[str, Dict[str, int]] = {code: {'rack': 0, 'hw': 0, 'sw': 0, 'line': 0} for code in dept_codes}
    placeholders = ','.join('?' for _ in dept_codes)
    doubled_codes = dept_codes + dept_codes  # for system_dept_code OR service_dept_code

    # Count racks per dept_code (system_dept_code OR service_dept_code, deduplicated)
    if _table_exists(conn, 'org_rack'):
        try:
            rows = conn.execute(
                f"SELECT dept_code, SUM(cnt) AS total FROM ("
                f"  SELECT system_dept_code AS dept_code, COUNT(*) AS cnt FROM org_rack "
                f"  WHERE system_dept_code IN ({placeholders}) AND is_deleted = 0 GROUP BY system_dept_code "
                f"  UNION ALL "
                f"  SELECT service_dept_code AS dept_code, COUNT(*) AS cnt FROM org_rack "
                f"  WHERE service_dept_code IN ({placeholders}) AND is_deleted = 0 "
                f"  AND service_dept_code != system_dept_code GROUP BY service_dept_code"
                f") GROUP BY dept_code",
                doubled_codes,
            ).fetchall()
            for r in rows:
                code = r['dept_code']
                if code in result:
                    result[code]['rack'] = int(r['total'])
        except Exception:
            logger.debug('Failed to count racks per dept', exc_info=True)

    # Count hardware per dept_code
    hw_table = 'hardware' if _table_exists(conn, 'hardware') else ('hardware_asset' if _table_exists(conn, 'hardware_asset') else None)
    if hw_table:
        try:
            rows = conn.execute(
                f"SELECT dept_code, SUM(cnt) AS total FROM ("
                f"  SELECT system_dept_code AS dept_code, COUNT(*) AS cnt FROM {hw_table} "
                f"  WHERE system_dept_code IN ({placeholders}) AND is_deleted = 0 GROUP BY system_dept_code "
                f"  UNION ALL "
                f"  SELECT service_dept_code AS dept_code, COUNT(*) AS cnt FROM {hw_table} "
                f"  WHERE service_dept_code IN ({placeholders}) AND is_deleted = 0 "
                f"  AND service_dept_code != system_dept_code GROUP BY service_dept_code"
                f") GROUP BY dept_code",
                doubled_codes,
            ).fetchall()
            for r in rows:
                code = r['dept_code']
                if code in result:
                    result[code]['hw'] = int(r['total'])
        except Exception:
            logger.debug('Failed to count hardware per dept', exc_info=True)

    # Count software per dept_code (server_software linked via hardware_id)
    if hw_table and _table_exists(conn, 'server_software'):
        try:
            rows = conn.execute(
                f"SELECT dept_code, SUM(cnt) AS total FROM ("
                f"  SELECT h.system_dept_code AS dept_code, COUNT(ss.id) AS cnt "
                f"  FROM {hw_table} h JOIN server_software ss ON ss.hardware_id = h.id "
                f"  WHERE h.system_dept_code IN ({placeholders}) AND h.is_deleted = 0 "
                f"  GROUP BY h.system_dept_code "
                f"  UNION ALL "
                f"  SELECT h.service_dept_code AS dept_code, COUNT(ss.id) AS cnt "
                f"  FROM {hw_table} h JOIN server_software ss ON ss.hardware_id = h.id "
                f"  WHERE h.service_dept_code IN ({placeholders}) AND h.is_deleted = 0 "
                f"  AND h.service_dept_code != h.system_dept_code "
                f"  GROUP BY h.service_dept_code"
                f") GROUP BY dept_code",
                doubled_codes,
            ).fetchall()
            for r in rows:
                code = r['dept_code']
                if code in result:
                    result[code]['sw'] = int(r['total'])
        except Exception:
            logger.debug('Failed to count software per dept', exc_info=True)

    # Count leased lines per dept_code (net_leased_line.device_name -> hardware.asset_name)
    if hw_table and _table_exists(conn, 'net_leased_line'):
        try:
            rows = conn.execute(
                f"SELECT dept_code, SUM(cnt) AS total FROM ("
                f"  SELECT h.system_dept_code AS dept_code, COUNT(DISTINCT ll.id) AS cnt "
                f"  FROM net_leased_line ll "
                f"  JOIN {hw_table} h ON h.asset_name = ll.device_name AND h.is_deleted = 0 "
                f"  WHERE h.system_dept_code IN ({placeholders}) AND ll.is_deleted = 0 "
                f"  AND ll.device_name IS NOT NULL AND ll.device_name != '' "
                f"  GROUP BY h.system_dept_code "
                f"  UNION ALL "
                f"  SELECT h.service_dept_code AS dept_code, COUNT(DISTINCT ll.id) AS cnt "
                f"  FROM net_leased_line ll "
                f"  JOIN {hw_table} h ON h.asset_name = ll.device_name AND h.is_deleted = 0 "
                f"  WHERE h.service_dept_code IN ({placeholders}) AND ll.is_deleted = 0 "
                f"  AND ll.device_name IS NOT NULL AND ll.device_name != '' "
                f"  AND h.service_dept_code != h.system_dept_code "
                f"  GROUP BY h.service_dept_code"
                f") GROUP BY dept_code",
                doubled_codes,
            ).fetchall()
            for r in rows:
                code = r['dept_code']
                if code in result:
                    result[code]['line'] = int(r['total'])
        except Exception:
            logger.debug('Failed to count leased lines per dept', exc_info=True)

    return result


def list_org_departments(app=None, search: Optional[str] = None, include_deleted: bool = False) -> List[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        _ensure_company_name_column(conn)
        clauses = ['1=1']
        params: List[Any] = []
        if not include_deleted:
            clauses.append('is_deleted = 0')
        if search:
            like = f"%{search}%"
            clauses.append("(company_name LIKE ? OR dept_name LIKE ? OR dept_code LIKE ? OR description LIKE ? OR remark LIKE ? OR manager_name LIKE ? OR manager_emp_no LIKE ?)")
            params.extend([like, like, like, like, like, like, like])
        query = (
            f"SELECT id, dept_code, company_name, dept_name, description, manager_name, manager_emp_no, member_count, hw_count, sw_count, remark, parent_dept_code, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {TABLE_NAME} WHERE {' AND '.join(clauses)} ORDER BY id DESC"
        )
        rows = conn.execute(query, params).fetchall()
        items = [_row_to_dict(row) for row in rows]

        # Derive staff_count from org_user when available.
        # Match either FK (department_id) OR free-text department name.
        # Use COUNT(DISTINCT u.id) to avoid double counting when both match.
        if items and _table_exists(conn, 'org_user') and _table_exists(conn, TABLE_NAME):
            try:
                dept_ids = [int(i.get('id') or 0) for i in items if int(i.get('id') or 0) > 0]
                if dept_ids:
                    placeholders = ','.join('?' for _ in dept_ids)
                    rows = conn.execute(
                        f"""
                        SELECT d.id AS dept_id, COUNT(DISTINCT u.id) AS staff_count
                        FROM {TABLE_NAME} d
                        LEFT JOIN org_user u
                          ON (
                            u.department_id = d.id
                            OR lower(trim(u.department)) = lower(trim(d.dept_name))
                          )
                        WHERE d.id IN ({placeholders})
                        GROUP BY d.id
                        """,
                        dept_ids,
                    ).fetchall()
                    counts = {int(r['dept_id']): int(r['staff_count'] or 0) for r in rows}
                    for item in items:
                        dept_id = int(item.get('id') or 0)
                        staff_count = counts.get(dept_id, 0)
                        item['staff_count'] = staff_count
                        item['member_count'] = staff_count
            except Exception:
                logger.exception('Failed to compute org_user staff counts')

    # Override rack/hw/sw counts with dynamic counts from actual asset data
    if items:
        dept_codes = [it['dept_code'] for it in items if it.get('dept_code')]
        if dept_codes:
            try:
                with _get_connection(app) as conn2:
                    asset_counts = _compute_dept_counts(conn2, dept_codes)
                for item in items:
                    dc = item.get('dept_code')
                    if dc and dc in asset_counts:
                        item['rack_qty'] = asset_counts[dc]['rack']
                        item['rack_count'] = asset_counts[dc]['rack']
                        item['hw_qty'] = asset_counts[dc]['hw']
                        item['hw_count'] = asset_counts[dc]['hw']
                        item['sw_qty'] = asset_counts[dc]['sw']
                        item['sw_count'] = asset_counts[dc]['sw']
                        item['line_qty'] = asset_counts[dc]['line']
                        item['line_count'] = asset_counts[dc]['line']
            except Exception:
                logger.debug('Failed to compute dynamic dept counts', exc_info=True)

    return items


def _fetch_single(dept_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        _ensure_company_name_column(conn)
        row = conn.execute(
            f"SELECT id, dept_code, company_name, dept_name, description, manager_name, manager_emp_no, member_count, hw_count, sw_count, remark, parent_dept_code, created_at, created_by, updated_at, updated_by, is_deleted FROM {TABLE_NAME} WHERE id = ?",
            (dept_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def create_org_department(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    company_name = (data.get('company_name') or data.get('company') or '').strip()
    if not company_name:
        raise ValueError('company_name is required')
    name = (data.get('dept_name') or '').strip()
    if not name:
        raise ValueError('dept_name is required')
    description = (data.get('description') or '').strip()
    manager_name = (data.get('manager_name') or '').strip()
    manager_emp_no = (data.get('manager_emp_no') or '').strip()
    parent_dept_code = (data.get('parent_dept_code') or '').strip() or None
    member_count = _sanitize_int(data.get('member_count') or data.get('staff_count'))
    hw_count = _sanitize_int(data.get('hw_count') or data.get('hw_qty'))
    sw_count = _sanitize_int(data.get('sw_count') or data.get('sw_qty'))
    remark = (data.get('remark') or data.get('note') or '').strip()
    with _get_connection(app) as conn:
        _ensure_company_name_column(conn)
        dept_code = (data.get('dept_code') or '').strip() or _generate_unique_code(conn, name)
        timestamp = _now()
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
                (dept_code, company_name, dept_name, description, manager_name, manager_emp_no, member_count, hw_count, sw_count, remark, parent_dept_code, created_at, created_by, updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                dept_code,
                company_name,
                name,
                description or None,
                manager_name or None,
                manager_emp_no or None,
                member_count if member_count is not None else 0,
                hw_count if hw_count is not None else 0,
                sw_count if sw_count is not None else 0,
                remark or None,
                parent_dept_code,
                timestamp,
                actor,
                timestamp,
                actor,
            ),
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
    return _fetch_single(new_id, app)


def update_org_department(dept_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    updates: List[str] = []
    params: List[Any] = []
    if 'company_name' in data or 'company' in data:
        company_name = (data.get('company_name') or data.get('company') or '').strip()
        if not company_name:
            raise ValueError('company_name is required')
        updates.append('company_name = ?')
        params.append(company_name)
    if 'dept_code' in data:
        code = (data.get('dept_code') or '').strip()
        if not code:
            raise ValueError('dept_code cannot be empty')
        updates.append('dept_code = ?')
        params.append(code)
    if 'dept_name' in data:
        name = (data.get('dept_name') or '').strip()
        if not name:
            raise ValueError('dept_name is required')
        updates.append('dept_name = ?')
        params.append(name)
    if 'description' in data:
        desc = (data.get('description') or '').strip()
        updates.append('description = ?')
        params.append(desc or None)
    if 'manager_name' in data:
        manager_name = (data.get('manager_name') or '').strip()
        updates.append('manager_name = ?')
        params.append(manager_name or None)
    if 'manager_emp_no' in data:
        manager_emp_no = (data.get('manager_emp_no') or '').strip()
        updates.append('manager_emp_no = ?')
        params.append(manager_emp_no or None)
    if 'member_count' in data or 'staff_count' in data:
        member_count = _sanitize_int(data.get('member_count') if 'member_count' in data else data.get('staff_count'))
        updates.append('member_count = ?')
        params.append(member_count if member_count is not None else 0)
    if 'hw_count' in data or 'hw_qty' in data:
        hw_count = _sanitize_int(data.get('hw_count') if 'hw_count' in data else data.get('hw_qty'))
        updates.append('hw_count = ?')
        params.append(hw_count if hw_count is not None else 0)
    if 'sw_count' in data or 'sw_qty' in data:
        sw_count = _sanitize_int(data.get('sw_count') if 'sw_count' in data else data.get('sw_qty'))
        updates.append('sw_count = ?')
        params.append(sw_count if sw_count is not None else 0)
    if 'remark' in data or 'note' in data:
        remark = (data.get('remark') or data.get('note') or '').strip()
        updates.append('remark = ?')
        params.append(remark or None)
    if 'parent_dept_code' in data:
        parent_dept_code = (data.get('parent_dept_code') or '').strip()
        updates.append('parent_dept_code = ?')
        params.append(parent_dept_code or None)
    if not updates:
        return _fetch_single(dept_id, app)
    timestamp = _now()
    updates.extend(['updated_at = ?', 'updated_by = ?'])
    params.extend([timestamp, actor, dept_id])
    with _get_connection(app) as conn:
        _ensure_company_name_column(conn)
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ? AND is_deleted = 0",
            params,
        )
        if cur.rowcount == 0:
            return None
        conn.commit()
    return _fetch_single(dept_id, app)


def soft_delete_org_departments(ids: Sequence[Any], actor: str, app=None) -> int:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    safe_ids = [int(i) for i in ids if str(i).isdigit()]
    if not safe_ids:
        return 0
    placeholders = ','.join('?' for _ in safe_ids)
    now = _now()
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id IN ({placeholders})",
            [now, actor] + safe_ids,
        )
        conn.commit()
        return cur.rowcount
