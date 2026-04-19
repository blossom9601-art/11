import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'cctv'
_CENTER_COLUMN_CACHE: Optional[str] = None


_LAB_CENTER_TO_TABLE = {
    '퓨처센터(5층)': 'system_lab1_cctv',
    '퓨처센터(6층)': 'system_lab2_cctv',
    '을지트윈타워(15층)': 'system_lab3_cctv',
    '재해복구센터(4층)': 'system_lab4_cctv',
}


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    try:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
            (table_name,),
        ).fetchone()
        return bool(row)
    except Exception:
        return False


def _migrate_lab_cctv_placement_if_needed(
    conn: sqlite3.Connection,
    *,
    cctv_code: str,
    target_center: str,
    actor: str,
) -> None:
    """Best-effort: if a CCTV overlay record exists in a lab table, move it to the target lab table.

    This keeps CCTV lab tabs in sync when the org CCTV "place" is changed from the CCTV 관리(list) page.
    """

    code = (cctv_code or '').strip()
    center = (target_center or '').strip()
    if not code or not center:
        return
    target_table = _LAB_CENTER_TO_TABLE.get(center)
    if not target_table:
        return
    if not _table_exists(conn, target_table):
        return

    lab_tables = list(_LAB_CENTER_TO_TABLE.values())
    found = None
    for table in lab_tables:
        if not _table_exists(conn, table):
            continue
        row = conn.execute(
            f"SELECT * FROM {table} WHERE is_deleted=0 AND cctv_code = ? LIMIT 1",
            (code,),
        ).fetchone()
        if row:
            found = (table, row)
            break

    if not found:
        return

    source_table, row = found
    if source_table == target_table and (row['center'] or '').strip() == center:
        return

    timestamp = _now()
    # Insert into target table (keep geometry, mark as active there)
    conn.execute(
        f"""
        INSERT INTO {target_table} (
            cctv_code, name, status, cctv_type, center,
            position_x, position_y, width_pct, height_pct,
            width, height, remark, racks_json, box_identifier,
            created_at, created_by, updated_at, updated_by, is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """,
        (
            row['cctv_code'],
            row['name'],
            row['status'],
            row['cctv_type'],
            center,
            row['position_x'],
            row['position_y'],
            row['width_pct'],
            row['height_pct'],
            row['width'],
            row['height'],
            row['remark'],
            row['racks_json'],
            row['box_identifier'],
            row['created_at'] or timestamp,
            row['created_by'] or actor,
            timestamp,
            actor,
        ),
    )
    # Soft-delete the old record so it stops appearing in the previous lab tab
    conn.execute(
        f"UPDATE {source_table} SET is_deleted=1, updated_at=?, updated_by=? WHERE id=?",
        (timestamp, actor, row['id']),
    )


def _sync_lab_cctv_fields_if_needed(
    conn: sqlite3.Connection,
    *,
    from_code: str,
    to_code: Optional[str],
    next_name: Optional[str],
    next_status: Optional[str],
    actor: str,
) -> None:
    """Best-effort: keep lab-tab overlay records in sync with org CCTV updates.

    The center tabs read from system_lab*_cctv tables, which store their own `name`/`status`.
    When the org CCTV is updated from the list page, propagate selected fields so the
    lab tabs reflect the change.
    """

    prior = (from_code or '').strip()
    target = (to_code or '').strip() or prior
    if not prior:
        return

    timestamp = _now()
    lab_tables = list(_LAB_CENTER_TO_TABLE.values())
    for table in lab_tables:
        if not _table_exists(conn, table):
            continue

        # 1) Update records that still reference the old code.
        set_parts: List[str] = []
        params: List[Any] = []
        if target and target != prior:
            set_parts.append('cctv_code = ?')
            params.append(target)
        if next_name is not None:
            set_parts.append('name = ?')
            params.append(next_name)
        if next_status is not None:
            set_parts.append('status = ?')
            params.append(next_status)
        if set_parts:
            set_parts.extend(['updated_at = ?', 'updated_by = ?'])
            params.extend([timestamp, actor, prior])
            conn.execute(
                f"UPDATE {table} SET {', '.join(set_parts)} WHERE is_deleted=0 AND cctv_code = ?",
                params,
            )

        # 2) Also update any records already on the new code (e.g. after migration).
        if target and target != prior and (next_name is not None or next_status is not None):
            set_parts2: List[str] = []
            params2: List[Any] = []
            if next_name is not None:
                set_parts2.append('name = ?')
                params2.append(next_name)
            if next_status is not None:
                set_parts2.append('status = ?')
                params2.append(next_status)
            set_parts2.extend(['updated_at = ?', 'updated_by = ?'])
            params2.extend([timestamp, actor, target])
            conn.execute(
                f"UPDATE {table} SET {', '.join(set_parts2)} WHERE is_deleted=0 AND cctv_code = ?",
                params2,
            )


def _ensure_schema(conn: sqlite3.Connection) -> None:
    schema_sql = f"""
        CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_code TEXT NOT NULL UNIQUE,
            business_status TEXT NOT NULL,
            business_name TEXT NOT NULL,
            vendor_name TEXT NOT NULL,
            model_name TEXT NOT NULL,
            serial_number TEXT,
            place_name TEXT NOT NULL,
            system_owner_dept TEXT NOT NULL,
            system_owner_name TEXT NOT NULL,
            service_owner_dept TEXT NOT NULL,
            service_owner_name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL,
            updated_at TEXT,
            updated_by TEXT,
            is_deleted INTEGER NOT NULL DEFAULT 0
        )
    """
    conn.execute(schema_sql)
    conn.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_deleted ON {TABLE_NAME}(is_deleted)"
    )
    conn.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_status ON {TABLE_NAME}(business_status)"
    )

    # Best-effort uniqueness enforcement for non-empty values.
    # If legacy data contains duplicates, index creation can fail; do not block startup.
    try:
        conn.execute(
            f"""
            CREATE UNIQUE INDEX IF NOT EXISTS ux_{TABLE_NAME}_business_name_active
            ON {TABLE_NAME}(business_name)
            WHERE is_deleted=0 AND TRIM(business_name) != ''
            """
        )
    except sqlite3.IntegrityError:
        logger.warning('Skipped unique index on business_name due to existing duplicates')
    except sqlite3.OperationalError:
        logger.warning('Skipped unique index on business_name (unsupported SQLite?)')

    try:
        conn.execute(
            f"""
            CREATE UNIQUE INDEX IF NOT EXISTS ux_{TABLE_NAME}_serial_number_active
            ON {TABLE_NAME}(serial_number)
            WHERE is_deleted=0 AND serial_number IS NOT NULL AND TRIM(serial_number) != ''
            """
        )
    except sqlite3.IntegrityError:
        logger.warning('Skipped unique index on serial_number due to existing duplicates')
    except sqlite3.OperationalError:
        logger.warning('Skipped unique index on serial_number (unsupported SQLite?)')


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        fallback = app.config.get('ORG_CCTV_SQLITE_PATH') or app.config.get('ORG_RACK_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'org_cctv.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'org_cctv.db')
    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    if os.path.isabs(path):
        return path
    relative = path.lstrip('/')
    return os.path.abspath(os.path.join(_project_root(app), relative))


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


def _resolve_center_column(conn: sqlite3.Connection) -> str:
    global _CENTER_COLUMN_CACHE
    if _CENTER_COLUMN_CACHE:
        return _CENTER_COLUMN_CACHE
    try:
        columns = {row[1] for row in conn.execute(f'PRAGMA table_info({TABLE_NAME})').fetchall()}
    except Exception:
        columns = set()
    target = 'center_name' if 'center_name' in columns else 'place_name'
    _CENTER_COLUMN_CACHE = target
    return target


def _require_text(data: Dict[str, Any], key: str, label: str) -> str:
    value = (data.get(key) or '').strip()
    if not value:
        raise ValueError(f'{label} 값은 필수입니다.')
    return value


def _optional_text(data: Dict[str, Any], key: str) -> Optional[str]:
    value = (data.get(key) or '').strip()
    return value or None


def _generate_device_code(conn: sqlite3.Connection, name: str, place: str) -> str:
    seed_left = re.sub(r'[^A-Z0-9]+', '_', (place or '').upper()).strip('_')
    seed_right = re.sub(r'[^A-Z0-9]+', '_', (name or '').upper()).strip('_')
    base = '_'.join(filter(None, [seed_left, seed_right])) or 'CCTV'
    base = base[:48]
    candidate = base
    suffix = 1
    while True:
        exists = conn.execute(f'SELECT 1 FROM {TABLE_NAME} WHERE device_code = ?', (candidate,)).fetchone()
        if not exists:
            return candidate
        suffix += 1
        candidate = f"{base}_{suffix}"[:64]


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    center_value = None
    biz_work_status = None
    if isinstance(row, sqlite3.Row):
        keys = row.keys()
        if 'biz_work_status' in keys:
            biz_work_status = row['biz_work_status']
        if 'center_name' in keys:
            center_value = row['center_name']
        elif 'place_name' in keys:
            center_value = row['place_name']
    return {
        'id': row['id'],
        'cctv_code': row['device_code'],
        'business_status': row['business_status'],
        'biz_work_status': (biz_work_status or row['business_status']),
        'business_name': row['business_name'],
        'vendor': row['vendor_name'],
        'model': row['model_name'],
        'serial': row['serial_number'] or '',
        'place': row['place_name'],
        'system_owner_dept': row['system_owner_dept'],
        'system_owner': row['system_owner_name'],
        'service_owner_dept': row['service_owner_dept'],
        'service_owner': row['service_owner_name'],
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
        'center_name': center_value,
    }


def _has_table(conn: sqlite3.Connection, table_name: str) -> bool:
    try:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
            (table_name,),
        ).fetchone()
        return bool(row)
    except Exception:
        return False


def _ensure_unique_nonempty(conn: sqlite3.Connection, *, column: str, value: Optional[str], label: str, exclude_id: Optional[int] = None) -> None:
    candidate = (value or '').strip()
    if not candidate:
        return
    if exclude_id is None:
        row = conn.execute(
            f"SELECT 1 FROM {TABLE_NAME} WHERE is_deleted=0 AND {column} = ? LIMIT 1",
            (candidate,),
        ).fetchone()
    else:
        row = conn.execute(
            f"SELECT 1 FROM {TABLE_NAME} WHERE is_deleted=0 AND id != ? AND {column} = ? LIMIT 1",
            (int(exclude_id), candidate),
        ).fetchone()
    if row:
        raise ValueError(f'{label}은(는) 중복될 수 없습니다.')


def init_org_cctv_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            _ensure_schema(conn)

            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize cctv table')
        raise


def list_org_cctvs(
    app=None,
    search: Optional[str] = None,
    include_deleted: bool = False,
    center_name: Optional[str] = None,
    business_name: Optional[str] = None,
    limit: Optional[int] = None,
) -> List[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        _ensure_schema(conn)
        center_column = _resolve_center_column(conn)
        has_work_status = _has_table(conn, 'biz_work_status')
        clauses = ['1=1']
        params: List[Any] = []
        if not include_deleted:
            clauses.append('c.is_deleted = 0' if has_work_status else 'is_deleted = 0')
        if search:
            like = f"%{search}%"
            base_cols = [
                'device_code',
                'business_status',
                'business_name',
                'vendor_name',
                'model_name',
                'serial_number',
                'place_name',
                'system_owner_dept',
                'system_owner_name',
                'service_owner_dept',
                'service_owner_name',
            ]
            if center_column not in base_cols:
                base_cols.append(center_column)
            search_columns = [f"c.{col}" for col in base_cols] if has_work_status else base_cols
            clauses.append('(' + ' OR '.join([f"{col} LIKE ?" for col in search_columns]) + ')')
            params.extend([like] * len(search_columns))
        if center_name:
            clauses.append(f"c.{center_column} LIKE ?" if has_work_status else f'{center_column} LIKE ?')
            params.append(f"{center_name}%")
        if business_name:
            clauses.append('c.business_name LIKE ?' if has_work_status else 'business_name LIKE ?')
            params.append(f"%{business_name}%")
        if has_work_status:
            select_fields = (
                "c.id, c.device_code, c.business_status, bws.status_name AS biz_work_status, c.business_name, c.vendor_name, c.model_name, c.serial_number, c.place_name, "
                "c.system_owner_dept, c.system_owner_name, c.service_owner_dept, c.service_owner_name, c.created_at, c.created_by, c.updated_at, c.updated_by, c.is_deleted, "
                f"c.{center_column} AS center_name"
            )
            from_clause = (
                f"FROM {TABLE_NAME} c "
                "LEFT JOIN biz_work_status bws "
                "ON bws.is_deleted=0 AND (bws.status_code = c.business_status OR bws.status_name = c.business_status)"
            )
        else:
            select_fields = (
                "id, device_code, business_status, business_status AS biz_work_status, business_name, vendor_name, model_name, serial_number, place_name, "
                "system_owner_dept, system_owner_name, service_owner_dept, service_owner_name, created_at, created_by, updated_at, updated_by, is_deleted, "
                f"{center_column} AS center_name"
            )
            from_clause = f"FROM {TABLE_NAME}"
        limit_clause = ''
        limit_value: Optional[int] = None
        if limit is not None:
            try:
                parsed = int(limit)
                if parsed > 0:
                    limit_value = parsed
                    limit_clause = ' LIMIT ?'
            except (TypeError, ValueError):
                limit_value = None
        order_by = 'c.id DESC' if has_work_status else 'id DESC'
        query = (
            f"SELECT {select_fields} {from_clause} "
            f"WHERE {' AND '.join(clauses)} ORDER BY {order_by}{limit_clause}"
        )
        exec_params = list(params)
        if limit_value is not None:
            exec_params.append(limit_value)
        rows = conn.execute(query, exec_params).fetchall()
        return [_row_to_dict(row) for row in rows]


def _fetch_single(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        _ensure_schema(conn)
        has_work_status = _has_table(conn, 'biz_work_status')
        if has_work_status:
            sql = (
                f"SELECT c.id, c.device_code, c.business_status, bws.status_name AS biz_work_status, c.business_name, c.vendor_name, c.model_name, c.serial_number, c.place_name, "
                f"c.system_owner_dept, c.system_owner_name, c.service_owner_dept, c.service_owner_name, c.created_at, c.created_by, c.updated_at, c.updated_by, c.is_deleted "
                f"FROM {TABLE_NAME} c "
                "LEFT JOIN biz_work_status bws "
                "ON bws.is_deleted=0 AND (bws.status_code = c.business_status OR bws.status_name = c.business_status) "
                "WHERE c.id = ?"
            )
        else:
            sql = (
                f"SELECT id, device_code, business_status, business_status AS biz_work_status, business_name, vendor_name, model_name, serial_number, place_name, "
                f"system_owner_dept, system_owner_name, service_owner_dept, service_owner_name, created_at, created_by, updated_at, updated_by, is_deleted "
                f"FROM {TABLE_NAME} WHERE id = ?"
            )
        row = conn.execute(sql, (record_id,)).fetchone()
        return _row_to_dict(row) if row else None


def create_org_cctv(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    business_status = _require_text(data, 'business_status', '업무 상태')
    vendor_name = _require_text(data, 'vendor', '시스템 제조사')
    model_name = _require_text(data, 'model', '시스템 모델명')
    place_name = _require_text(data, 'place', '시스템 장소')

    # Optional fields (store as empty strings to satisfy NOT NULL schema)
    business_name = (_optional_text(data, 'business_name') or '')
    serial_number = _optional_text(data, 'serial')
    system_owner_dept = (_optional_text(data, 'system_owner_dept') or '')
    system_owner_name = (_optional_text(data, 'system_owner') or '')
    service_owner_dept = (_optional_text(data, 'service_owner_dept') or '')
    service_owner_name = (_optional_text(data, 'service_owner') or '')
    with _get_connection(app) as conn:
        _ensure_schema(conn)
        _ensure_unique_nonempty(conn, column='business_name', value=business_name, label='업무 이름')
        _ensure_unique_nonempty(conn, column='serial_number', value=serial_number, label='시스템 일련번호')
        device_code = (data.get('cctv_code') or data.get('device_code') or '').strip()
        if not device_code:
            device_code = _generate_device_code(conn, business_name, place_name)
        timestamp = _now()
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (
                device_code, business_status, business_name, vendor_name, model_name, serial_number,
                place_name, system_owner_dept, system_owner_name, service_owner_dept, service_owner_name,
                created_at, created_by, updated_at, updated_by, is_deleted
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                device_code,
                business_status,
                business_name,
                vendor_name,
                model_name,
                serial_number,
                place_name,
                system_owner_dept,
                system_owner_name,
                service_owner_dept,
                service_owner_name,
                timestamp,
                actor,
                timestamp,
                actor,
            ),
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
    return _fetch_single(new_id, app)


def update_org_cctv(record_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    existing = _fetch_single(record_id, app)
    if not existing:
        return None
    prior_place = (existing.get('place') or '').strip()
    prior_code = (existing.get('cctv_code') or '').strip()

    updates: List[str] = []
    params: List[Any] = []
    required_text_fields = {
        'business_status': '업무 상태',
        'vendor': '시스템 제조사',
        'model': '시스템 모델명',
        'place': '시스템 장소',
    }
    column_map = {
        'business_status': 'business_status',
        'business_name': 'business_name',
        'vendor': 'vendor_name',
        'model': 'model_name',
        'serial': 'serial_number',
        'place': 'place_name',
        'system_owner_dept': 'system_owner_dept',
        'system_owner': 'system_owner_name',
        'service_owner_dept': 'service_owner_dept',
        'service_owner': 'service_owner_name',
        'cctv_code': 'device_code',
        'device_code': 'device_code',
    }
    next_business_name: Optional[str] = None
    next_serial_number: Optional[str] = None
    next_place: Optional[str] = None
    next_business_status: Optional[str] = None
    next_device_code: Optional[str] = None
    for key, column in column_map.items():
        if key in data:
            if key == 'serial':
                value = _optional_text(data, key)
                next_serial_number = value
            elif key in required_text_fields:
                value = _require_text(data, key, required_text_fields[key])
                if key == 'place':
                    next_place = value
                if key == 'business_status':
                    next_business_status = value
            elif key in (
                'business_name',
                'system_owner_dept',
                'system_owner',
                'service_owner_dept',
                'service_owner',
            ):
                value = (_optional_text(data, key) or '')
                if key == 'business_name':
                    next_business_name = value
            else:
                value = (data.get(key) or '').strip()
                if not value:
                    raise ValueError(f'{key} 값은 비워둘 수 없습니다.')
                if key in ('cctv_code', 'device_code'):
                    next_device_code = value
            updates.append(f'{column} = ?')
            params.append(value)
    if not updates:
        return _fetch_single(record_id, app)
    timestamp = _now()
    updates.extend(['updated_at = ?', 'updated_by = ?'])
    params.extend([timestamp, actor, record_id])
    with _get_connection(app) as conn:
        _ensure_schema(conn)
        _ensure_unique_nonempty(conn, column='business_name', value=next_business_name, label='업무 이름', exclude_id=record_id)
        _ensure_unique_nonempty(conn, column='serial_number', value=next_serial_number, label='시스템 일련번호', exclude_id=record_id)
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ? AND is_deleted = 0",
            params,
        )
        if cur.rowcount == 0:
            return None

        # If place changed, migrate the overlay placement record between lab tables
        # so the CCTV is discoverable in the correct lab tab.
        if next_place is not None and next_place.strip() and next_place.strip() != prior_place and prior_code:
            try:
                _migrate_lab_cctv_placement_if_needed(
                    conn,
                    cctv_code=prior_code,
                    target_center=next_place.strip(),
                    actor=actor,
                )
            except Exception:
                logger.exception('Failed to migrate lab CCTV placement (code=%s, place=%s)', prior_code, next_place)

        # Keep lab-tab records in sync for fields that the lab tables duplicate.
        # - status: drives colored dot + status display on lab tabs
        # - name: used as the label on the overlay
        # - cctv_code: keeps FK linkage when code is edited
        if prior_code:
            try:
                _sync_lab_cctv_fields_if_needed(
                    conn,
                    from_code=prior_code,
                    to_code=(next_device_code or None),
                    next_name=next_business_name,
                    next_status=next_business_status,
                    actor=actor,
                )
            except Exception:
                logger.exception('Failed to sync lab CCTV fields (code=%s)', prior_code)
        conn.commit()
    return _fetch_single(record_id, app)


def soft_delete_org_cctvs(ids: Sequence[Any], actor: str, app=None) -> int:
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


def bulk_update_org_cctvs(
    ids: Sequence[Any],
    updates_data: Dict[str, Any],
    actor: str,
    app=None,
) -> int:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'

    safe_ids = [int(i) for i in ids if str(i).isdigit()]
    if not safe_ids:
        return 0
    if not isinstance(updates_data, dict) or not updates_data:
        raise ValueError('변경할 값을 1개 이상 입력하세요.')

    required_text_fields = {
        'business_status': '업무 상태',
        'vendor': '시스템 제조사',
        'model': '시스템 모델명',
        'place': '시스템 장소',
    }
    optional_text_keys = {
        'business_name',
        'system_owner_dept',
        'system_owner',
        'service_owner_dept',
        'service_owner',
    }
    column_map = {
        'business_status': 'business_status',
        'business_name': 'business_name',
        'vendor': 'vendor_name',
        'model': 'model_name',
        'serial': 'serial_number',
        'place': 'place_name',
        'system_owner_dept': 'system_owner_dept',
        'system_owner': 'system_owner_name',
        'service_owner_dept': 'service_owner_dept',
        'service_owner': 'service_owner_name',
        'cctv_code': 'device_code',
        'device_code': 'device_code',
    }

    updates: List[str] = []
    params: List[Any] = []

    next_place: Optional[str] = None
    next_business_status: Optional[str] = None
    next_business_name: Optional[str] = None
    next_device_code: Optional[str] = None

    for key, column in column_map.items():
        if key not in updates_data:
            continue

        if key == 'serial':
            raw = (updates_data.get(key) or '').strip()
            value = raw or None
        elif key in required_text_fields:
            value = (updates_data.get(key) or '').strip()
            if not value:
                raise ValueError(f"{required_text_fields[key]} 값은 필수입니다.")
            if key == 'place':
                next_place = value
            elif key == 'business_status':
                next_business_status = value
        elif key in optional_text_keys:
            value = ((updates_data.get(key) or '').strip()) or ''
            if key == 'business_name':
                next_business_name = value
        else:
            value = (updates_data.get(key) or '').strip()
            if not value:
                raise ValueError(f'{key} 값은 비워둘 수 없습니다.')
            if key in ('cctv_code', 'device_code'):
                next_device_code = value

        # Avoid duplicate updates for the same column when both keys are present.
        if any(u.startswith(f'{column} =') for u in updates):
            continue

        updates.append(f'{column} = ?')
        params.append(value)

    if not updates:
        raise ValueError('변경할 값을 1개 이상 입력하세요.')

    timestamp = _now()
    updates.extend(['updated_at = ?', 'updated_by = ?'])
    params.extend([timestamp, actor])

    placeholders = ','.join('?' for _ in safe_ids)
    pre_rows: Dict[int, sqlite3.Row] = {}
    with _get_connection(app) as conn:
        _ensure_schema(conn)

        # Capture prior codes/places for lab-table migration/sync.
        rows = conn.execute(
            f"SELECT id, device_code, place_name FROM {TABLE_NAME} WHERE is_deleted=0 AND id IN ({placeholders})",
            safe_ids,
        ).fetchall()
        pre_rows = {int(r['id']): r for r in rows}

        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id IN ({placeholders}) AND is_deleted = 0",
            [*params, *safe_ids],
        )

        needs_migration = next_place is not None
        needs_sync = (next_business_name is not None) or (next_business_status is not None) or (next_device_code is not None)

        if (needs_migration or needs_sync) and pre_rows:
            for rid, prior in pre_rows.items():
                prior_code = (prior['device_code'] or '').strip()
                prior_place = (prior['place_name'] or '').strip()
                if not prior_code:
                    continue

                if needs_migration and next_place and next_place.strip() and next_place.strip() != prior_place:
                    try:
                        _migrate_lab_cctv_placement_if_needed(
                            conn,
                            cctv_code=prior_code,
                            target_center=next_place.strip(),
                            actor=actor,
                        )
                    except Exception:
                        logger.exception('Failed to migrate lab CCTV placement (code=%s, place=%s)', prior_code, next_place)

                if needs_sync:
                    try:
                        _sync_lab_cctv_fields_if_needed(
                            conn,
                            from_code=prior_code,
                            to_code=(next_device_code or None),
                            next_name=next_business_name,
                            next_status=next_business_status,
                            actor=actor,
                        )
                    except Exception:
                        logger.exception('Failed to sync lab CCTV fields (code=%s)', prior_code)

        conn.commit()
        return cur.rowcount
