import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'org_center'


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        fallback = app.config.get('ORG_CENTER_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'org_center.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'org_center.db')
    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    # sqlite:///file.db -> path='/file.db' (single leading / = relative)
    # sqlite:////abs.db  -> path='//abs.db' (double leading / = absolute)
    if path.startswith('/') and not path.startswith('//'):
        path = path.lstrip('/')
    if os.path.isabs(path):
        return os.path.abspath(path)
    # Keep relative SQLite filenames aligned with Flask-SQLAlchemy, which
    # resolves "sqlite:///filename.db" under instance_path.
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
    return conn


def _sanitize_int(value: Any) -> Optional[int]:
    if value is None or value == '':
        return None
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return None


def _sanitize_float(value: Any) -> Optional[float]:
    if value is None or value == '':
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _generate_unique_code(conn: sqlite3.Connection, name: str) -> str:
    seed = (name or 'CENTER').upper()
    base = re.sub(r'[^A-Z0-9]+', '_', seed).strip('_') or 'CENTER'
    base = base[:40]
    candidate = base
    suffix = 1
    while True:
        exists = conn.execute(
            f"SELECT 1 FROM {TABLE_NAME} WHERE center_code = ?",
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
        'center_code': row['center_code'],
        'center_name': row['center_name'],
        'location': row['location'] or '',
        'usage': row['usage'] or '',
        'seismic': row['seismic_rating'],
        'seismic_rating': row['seismic_rating'],
        'rack_qty': row['rack_qty'],
        'rack_count': row['rack_qty'],
        'hw_qty': row['hw_qty'],
        'hw_count': row['hw_qty'],
        'sw_qty': row['sw_qty'],
        'sw_count': row['sw_qty'],
        'line_qty': row['line_qty'],
        'line_count': row['line_qty'],
        'note': row['note'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
    }


def init_org_center_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    center_code TEXT NOT NULL UNIQUE,
                    center_name TEXT NOT NULL,
                    location TEXT,
                    usage TEXT,
                    seismic_rating REAL,
                    rack_qty INTEGER DEFAULT 0,
                    hw_qty INTEGER DEFAULT 0,
                    sw_qty INTEGER DEFAULT 0,
                    line_qty INTEGER DEFAULT 0,
                    note TEXT,
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
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_name ON {TABLE_NAME}(center_name)"
            )
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize org_center table')
        raise


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    try:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
            (name,),
        ).fetchone()
        return bool(row)
    except Exception:
        return False


def _compute_center_counts(conn: sqlite3.Connection, center_codes: List[str]) -> Dict[str, Dict[str, int]]:
    """Count racks, hardware, software, and lines per center_code from tables in the same DB."""
    if not center_codes:
        return {}
    result: Dict[str, Dict[str, int]] = {code: {'rack': 0, 'hw': 0, 'sw': 0, 'line': 0} for code in center_codes}
    placeholders = ','.join('?' for _ in center_codes)

    # Count racks per center_code
    if _table_exists(conn, 'org_rack'):
        try:
            rows = conn.execute(
                f"SELECT center_code, COUNT(*) AS cnt FROM org_rack "
                f"WHERE center_code IN ({placeholders}) AND is_deleted = 0 "
                f"GROUP BY center_code",
                center_codes,
            ).fetchall()
            for r in rows:
                code = r['center_code']
                if code in result:
                    result[code]['rack'] = int(r['cnt'])
        except Exception:
            logger.debug('Failed to count racks per center', exc_info=True)

    # Count hardware per center_code
    hw_table = 'hardware' if _table_exists(conn, 'hardware') else ('hardware_asset' if _table_exists(conn, 'hardware_asset') else None)
    if hw_table:
        try:
            rows = conn.execute(
                f"SELECT center_code, COUNT(*) AS cnt FROM {hw_table} "
                f"WHERE center_code IN ({placeholders}) AND is_deleted = 0 "
                f"GROUP BY center_code",
                center_codes,
            ).fetchall()
            for r in rows:
                code = r['center_code']
                if code in result:
                    result[code]['hw'] = int(r['cnt'])
        except Exception:
            logger.debug('Failed to count hardware per center', exc_info=True)

    # Count software per center_code (server_software linked via hardware_id)
    if hw_table and _table_exists(conn, 'server_software'):
        try:
            rows = conn.execute(
                f"SELECT h.center_code, COUNT(ss.id) AS cnt "
                f"FROM {hw_table} h "
                f"JOIN server_software ss ON ss.hardware_id = h.id "
                f"WHERE h.center_code IN ({placeholders}) AND h.is_deleted = 0 "
                f"GROUP BY h.center_code",
                center_codes,
            ).fetchall()
            for r in rows:
                code = r['center_code']
                if code in result:
                    result[code]['sw'] = int(r['cnt'])
        except Exception:
            logger.debug('Failed to count software per center', exc_info=True)

    # Count leased lines per center_code (net_leased_line.device_name -> hardware.asset_name)
    if hw_table and _table_exists(conn, 'net_leased_line'):
        try:
            rows = conn.execute(
                f"SELECT h.center_code, COUNT(DISTINCT ll.id) AS cnt "
                f"FROM net_leased_line ll "
                f"JOIN {hw_table} h ON h.asset_name = ll.device_name AND h.is_deleted = 0 "
                f"WHERE h.center_code IN ({placeholders}) AND ll.is_deleted = 0 "
                f"AND ll.device_name IS NOT NULL AND ll.device_name != '' "
                f"GROUP BY h.center_code",
                center_codes,
            ).fetchall()
            for r in rows:
                code = r['center_code']
                if code in result:
                    result[code]['line'] = int(r['cnt'])
        except Exception:
            logger.debug('Failed to count leased lines per center', exc_info=True)

    return result


def list_org_centers(app=None, search: Optional[str] = None, include_deleted: bool = False) -> List[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        clauses = ['1=1']
        params: List[Any] = []
        if not include_deleted:
            clauses.append('is_deleted = 0')
        if search:
            like = f"%{search}%"
            clauses.append("(center_name LIKE ? OR center_code LIKE ? OR location LIKE ? OR usage LIKE ? OR note LIKE ?)")
            params.extend([like, like, like, like, like])
        query = (
            f"SELECT id, center_code, center_name, location, usage, seismic_rating, rack_qty, hw_qty, sw_qty, line_qty, note, created_at, created_by, updated_at, updated_by, is_deleted "
            f"FROM {TABLE_NAME} WHERE {' AND '.join(clauses)} ORDER BY id DESC"
        )
        rows = conn.execute(query, params).fetchall()
        items = [_row_to_dict(row) for row in rows]

        # Override rack_qty / hw_qty with dynamic counts from actual asset data
        if items:
            center_codes = [it['center_code'] for it in items if it.get('center_code')]
            if center_codes:
                try:
                    counts = _compute_center_counts(conn, center_codes)
                    for item in items:
                        cc = item.get('center_code')
                        if cc and cc in counts:
                            item['rack_qty'] = counts[cc]['rack']
                            item['rack_count'] = counts[cc]['rack']
                            item['hw_qty'] = counts[cc]['hw']
                            item['hw_count'] = counts[cc]['hw']
                            item['sw_qty'] = counts[cc]['sw']
                            item['sw_count'] = counts[cc]['sw']
                            item['line_qty'] = counts[cc]['line']
                            item['line_count'] = counts[cc]['line']
                except Exception:
                    logger.debug('Failed to compute dynamic center counts', exc_info=True)

    return items


def _fetch_single(center_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT id, center_code, center_name, location, usage, seismic_rating, rack_qty, hw_qty, sw_qty, line_qty, note, created_at, created_by, updated_at, updated_by, is_deleted FROM {TABLE_NAME} WHERE id = ?",
            (center_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def create_org_center(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    name = (data.get('center_name') or '').strip()
    if not name:
        raise ValueError('center_name is required')
    location = (data.get('location') or '').strip()
    usage = (data.get('usage') or '').strip()
    note = (data.get('note') or '').strip()
    seismic_value = _sanitize_float(data.get('seismic') if 'seismic' in data else data.get('seismic_rating'))
    rack_qty = _sanitize_int(data.get('rack_qty') if 'rack_qty' in data else data.get('rack_count'))
    hw_qty = _sanitize_int(data.get('hw_qty') if 'hw_qty' in data else data.get('hw_count'))
    sw_qty = _sanitize_int(data.get('sw_qty') if 'sw_qty' in data else data.get('sw_count'))
    line_qty = _sanitize_int(data.get('line_qty') if 'line_qty' in data else data.get('line_count'))
    with _get_connection(app) as conn:
        center_code = (data.get('center_code') or '').strip() or _generate_unique_code(conn, name)
        timestamp = _now()
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
                (center_code, center_name, location, usage, seismic_rating, rack_qty, hw_qty, sw_qty, line_qty, note, created_at, created_by, updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                center_code,
                name,
                location or None,
                usage or None,
                seismic_value,
                rack_qty if rack_qty is not None else 0,
                hw_qty if hw_qty is not None else 0,
                sw_qty if sw_qty is not None else 0,
                line_qty if line_qty is not None else 0,
                note or None,
                timestamp,
                actor,
                timestamp,
                actor,
            ),
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
    return _fetch_single(new_id, app)


def update_org_center(center_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    updates: List[str] = []
    params: List[Any] = []
    if 'center_code' in data:
        code = (data.get('center_code') or '').strip()
        if not code:
            raise ValueError('center_code cannot be empty')
        updates.append('center_code = ?')
        params.append(code)
    if 'center_name' in data:
        name = (data.get('center_name') or '').strip()
        if not name:
            raise ValueError('center_name is required')
        updates.append('center_name = ?')
        params.append(name)
    if 'location' in data:
        loc = (data.get('location') or '').strip()
        updates.append('location = ?')
        params.append(loc or None)
    if 'usage' in data:
        use = (data.get('usage') or '').strip()
        updates.append('usage = ?')
        params.append(use or None)
    if 'note' in data:
        note_val = (data.get('note') or '').strip()
        updates.append('note = ?')
        params.append(note_val or None)
    if 'seismic' in data or 'seismic_rating' in data:
        seismic_value = _sanitize_float(data.get('seismic') if 'seismic' in data else data.get('seismic_rating'))
        updates.append('seismic_rating = ?')
        params.append(seismic_value)
    if 'rack_qty' in data or 'rack_count' in data:
        rack_qty = _sanitize_int(data.get('rack_qty') if 'rack_qty' in data else data.get('rack_count'))
        updates.append('rack_qty = ?')
        params.append(rack_qty if rack_qty is not None else 0)
    if 'hw_qty' in data or 'hw_count' in data:
        hw_qty = _sanitize_int(data.get('hw_qty') if 'hw_qty' in data else data.get('hw_count'))
        updates.append('hw_qty = ?')
        params.append(hw_qty if hw_qty is not None else 0)
    if 'sw_qty' in data or 'sw_count' in data:
        sw_qty = _sanitize_int(data.get('sw_qty') if 'sw_qty' in data else data.get('sw_count'))
        updates.append('sw_qty = ?')
        params.append(sw_qty if sw_qty is not None else 0)
    if 'line_qty' in data or 'line_count' in data:
        line_qty = _sanitize_int(data.get('line_qty') if 'line_qty' in data else data.get('line_count'))
        updates.append('line_qty = ?')
        params.append(line_qty if line_qty is not None else 0)
    if not updates:
        return _fetch_single(center_id, app)
    timestamp = _now()
    updates.extend(['updated_at = ?', 'updated_by = ?'])
    params.extend([timestamp, actor, center_id])
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ? AND is_deleted = 0",
            params,
        )
        if cur.rowcount == 0:
            return None
        conn.commit()
    return _fetch_single(center_id, app)


def soft_delete_org_centers(ids: Sequence[Any], actor: str, app=None) -> int:
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
