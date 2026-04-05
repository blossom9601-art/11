import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'opex_contract'
VALID_OPEX_TYPES = {'HW', 'SW', 'ETC'}

def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        fallback = app.config.get('OPEX_CONTRACT_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'opex_contract.db')

    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'opex_contract.db')
    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"

    # Keep sqlite path resolution consistent with Flask-SQLAlchemy:
    # - For sqlite URIs like "sqlite:///dev_blossom.db", Flask resolves the file under instance_path.
    # - urlparse yields path like "/dev_blossom.db" on Windows for sqlite:///dev_blossom.db.
    #   Treat that as a filename, not an absolute filesystem path.
    if os.path.isabs(path):
        normalized = path.replace('\\', '/')
        if normalized.startswith('/') and normalized.count('/') == 1:
            filename = normalized.lstrip('/')
            return os.path.abspath(os.path.join(app.instance_path, filename))
        return os.path.abspath(path)

    relative = path.lstrip('/')
    return os.path.abspath(os.path.join(app.instance_path, relative))


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    try:
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1",
            (table_name,),
        ).fetchone()
        return bool(row)
    except sqlite3.DatabaseError:
        return False


def _table_columns(conn: sqlite3.Connection, table_name: str) -> List[str]:
    try:
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        return [str(r[1]) for r in rows if r and len(r) > 1]
    except sqlite3.DatabaseError:
        return []


def _ensure_column(conn: sqlite3.Connection, table_name: str, column_name: str, column_type: str) -> bool:
    columns = set(_table_columns(conn, table_name))
    if column_name in columns:
        return False
    conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")
    return True


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
        logger.warning('Could not enable foreign key enforcement for %s', TABLE_NAME)
    return conn


def init_opex_contract_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    opex_type TEXT NOT NULL,
                    contract_status TEXT NOT NULL,
                    contract_name TEXT NOT NULL,
                    contract_code TEXT NOT NULL UNIQUE,
                    vendor_id INTEGER NOT NULL,
                    total_license_count INTEGER,
                    active_license_count INTEGER,
                    maintenance_start_date TEXT NOT NULL,
                    maintenance_end_date TEXT NOT NULL,
                    maintenance_amount INTEGER NOT NULL,
                    inspection_target INTEGER DEFAULT 0,
                    maint_manager TEXT,
                    memo TEXT,
                    description TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    created_by TEXT NOT NULL,
                    updated_at TEXT,
                    updated_by TEXT,
                    is_deleted INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (vendor_id) REFERENCES biz_vendor_maintenance(id)
                )
                """
            )

            _ensure_column(conn, TABLE_NAME, 'maint_manager', 'TEXT')
            memo_added = _ensure_column(conn, TABLE_NAME, 'memo', 'TEXT')
            if memo_added:
                # Backfill memo from legacy description.
                conn.execute(
                    f"UPDATE {TABLE_NAME} SET memo = description WHERE memo IS NULL AND description IS NOT NULL"
                )
            # Keep legacy description populated for older clients.
            conn.execute(
                f"UPDATE {TABLE_NAME} SET description = memo WHERE description IS NULL AND memo IS NOT NULL"
            )

            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_type ON {TABLE_NAME}(opex_type)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_vendor ON {TABLE_NAME}(vendor_id)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_deleted ON {TABLE_NAME}(is_deleted)"
            )
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def _sanitize_int(value: Any, *, allow_none: bool = True) -> Optional[int]:
    if value in (None, ''):
        return None if allow_none else 0
    try:
        parsed = int(value)
        return parsed
    except (TypeError, ValueError):
        return None if allow_none else 0


def _sanitize_bool(value: Any) -> int:
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, (int, float)):
        return 1 if int(value) != 0 else 0
    if isinstance(value, str):
        return 1 if value.strip().lower() in ('1', 'true', 'y', 'yes', 'on', 'o') else 0
    return 0


def _sanitize_date(value: Any) -> Optional[str]:
    if value in (None, ''):
        return None
    text = str(value).strip()
    if not text:
        return None
    # Accept ISO-like values (YYYY-MM-DD or YYYY/MM/DD)
    normalized = text.replace('/', '-').replace('.', '-').strip()
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', normalized):
        raise ValueError('날짜 형식은 YYYY-MM-DD 이어야 합니다.')
    return normalized


def _normalize_type(raw: Any) -> str:
    if raw in (None, ''):
        raise ValueError('OPEX 구분이 필요합니다.')
    token = str(raw).strip().upper()
    if token not in VALID_OPEX_TYPES:
        raise ValueError('OPEX 구분은 HW, SW, ETC 중 하나여야 합니다.')
    return token


def _prepare_payload(data: Dict[str, Any]) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    mapping = {
        'opex_type': ['opex_type', 'type', 'category'],
        'contract_status': ['contract_status', 'status'],
        'contract_name': ['contract_name', 'name', 'title'],
        'contract_code': ['contract_code', 'manage_no', 'manageNo', 'code'],
        'vendor_id': ['vendor_id', 'maintenance_vendor_id', 'maint_vendor_id'],
        'total_license_count': ['total_license_count', 'maint_qty_total', 'license_total', 'total_qty'],
        'active_license_count': ['active_license_count', 'maint_qty_active', 'license_active', 'active_qty'],
        'maintenance_start_date': ['maintenance_start_date', 'maint_start', 'start_date'],
        'maintenance_end_date': ['maintenance_end_date', 'maint_end', 'end_date'],
        'maintenance_amount': ['maintenance_amount', 'maint_amount', 'amount'],
        'inspection_target': ['inspection_target', 'inspection', 'is_inspection_target'],
        'maint_manager': ['maint_manager', 'maintenance_manager', 'manager'],
        'memo': ['memo', 'description', 'remark', 'note'],
    }
    for column, aliases in mapping.items():
        for alias in aliases:
            if alias in data and data.get(alias) not in (None, ''):
                payload[column] = data[alias]
                break
    return payload


def _vendor_exists(conn: sqlite3.Connection, vendor_id: int) -> bool:
    if vendor_id is None:
        return False
    if _table_exists(conn, 'biz_vendor_maintenance'):
        row = conn.execute(
            "SELECT id FROM biz_vendor_maintenance WHERE id = ? AND is_deleted = 0",
            (vendor_id,),
        ).fetchone()
        return row is not None

    try:
        from app.services.vendor_maintenance_service import get_maintenance_vendors_by_ids

        vendor = get_maintenance_vendors_by_ids([int(vendor_id)], app=current_app).get(int(vendor_id))
        return bool(vendor) and not vendor.get('is_deleted')
    except Exception:
        logger.exception('Failed to resolve vendor existence via vendor maintenance service')
        return False


def _backfill_vendor_names(records: List[Dict[str, Any]], vendor_table_present: bool, app) -> None:
    if vendor_table_present:
        return
    missing_ids = {
        record['vendor_id']
        for record in records
        if record.get('vendor_id') and not record.get('vendor_name')
    }
    if not missing_ids:
        return
    try:
        from app.services.vendor_maintenance_service import get_maintenance_vendors_by_ids

        vendor_map = get_maintenance_vendors_by_ids(missing_ids, app=app)
    except Exception:
        logger.exception('Failed to backfill vendor names for OPEX contracts')
        return
    for record in records:
        vendor = vendor_map.get(record.get('vendor_id'))
        if not vendor:
            continue
        name = vendor.get('maintenance_name') or vendor.get('vendor') or ''
        if not name:
            continue
        record['vendor_name'] = name
        record['maint_vendor'] = name


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}
    total_qty = row['total_license_count']
    active_qty = row['active_license_count']
    memo_value = ''
    try:
        memo_value = row['memo'] or ''
    except Exception:
        memo_value = ''
    if not memo_value:
        memo_value = (row['description'] or '') if 'description' in row.keys() else ''
    return {
        'id': row['id'],
        'opex_type': row['opex_type'],
        'contract_status': row['contract_status'],
        'contract_name': row['contract_name'],
        'contract_code': row['contract_code'],
        'vendor_id': row['vendor_id'],
        'vendor_name': row['vendor_name'],
        'total_license_count': total_qty,
        'active_license_count': active_qty,
        'maintenance_start_date': row['maintenance_start_date'],
        'maintenance_end_date': row['maintenance_end_date'],
        'maintenance_amount': row['maintenance_amount'],
        'inspection_target': row['inspection_target'],
        'maint_manager': row['maint_manager'] if 'maint_manager' in row.keys() else '',
        'memo': memo_value,
        'description': memo_value,
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
        # Front-end friendly aliases
        'manage_no': row['contract_code'],
        'maint_vendor': row['vendor_name'],
        'maint_qty_total': total_qty,
        'maint_qty_active': active_qty,
        'maint_start': row['maintenance_start_date'],
        'maint_end': row['maintenance_end_date'],
        'maint_amount': row['maintenance_amount'],
        'maint_manager': row['maint_manager'] if 'maint_manager' in row.keys() else '',
    }


def list_opex_contracts(
    app=None,
    *,
    opex_type: Optional[str] = None,
    search: Optional[str] = None,
    include_deleted: bool = False,
) -> List[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        vendor_table_present = _table_exists(conn, 'biz_vendor_maintenance')
        vendor_name_column = "IFNULL(vm.maintenance_name, '') AS vendor_name" if vendor_table_present else "'' AS vendor_name"
        vendor_join_clause = "LEFT JOIN biz_vendor_maintenance vm ON vm.id = oc.vendor_id" if vendor_table_present else ''
        clauses = ['1=1']
        params: List[Any] = []
        if not include_deleted:
            clauses.append('oc.is_deleted = 0')
        if opex_type:
            clauses.append('oc.opex_type = ?')
            params.append(_normalize_type(opex_type))
        if search:
            like = f"%{search.strip()}%"
            search_terms = [
                'oc.contract_name LIKE ?',
                'oc.contract_code LIKE ?',
                'oc.contract_status LIKE ?',
                'IFNULL(oc.memo, IFNULL(oc.description, "")) LIKE ?',
            ]
            if vendor_table_present:
                search_terms.insert(3, 'IFNULL(vm.maintenance_name, "") LIKE ?')
            clauses.append('(' + ' OR '.join(search_terms) + ')')
            params.extend([like] * len(search_terms))
        query = (
            f"""
            SELECT oc.id, oc.opex_type, oc.contract_status, oc.contract_name, oc.contract_code,
                   oc.vendor_id, oc.total_license_count, oc.active_license_count,
                   oc.maintenance_start_date, oc.maintenance_end_date, oc.maintenance_amount,
                     oc.inspection_target, oc.maint_manager, oc.memo, oc.description, oc.created_at, oc.created_by,
                   oc.updated_at, oc.updated_by, oc.is_deleted,
                   {vendor_name_column}
            FROM {TABLE_NAME} oc
            {vendor_join_clause}
            WHERE {' AND '.join(clauses)}
            ORDER BY oc.id DESC
            """
        )
        rows = conn.execute(query, params).fetchall()

    records = [_row_to_dict(row) for row in rows]
    _backfill_vendor_names(records, vendor_table_present, app)
    return records


def get_opex_contract(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        vendor_table_present = _table_exists(conn, 'biz_vendor_maintenance')
        vendor_name_column = "IFNULL(vm.maintenance_name, '') AS vendor_name" if vendor_table_present else "'' AS vendor_name"
        vendor_join_clause = "LEFT JOIN biz_vendor_maintenance vm ON vm.id = oc.vendor_id" if vendor_table_present else ''
        row = conn.execute(
            f"""
            SELECT oc.id, oc.opex_type, oc.contract_status, oc.contract_name, oc.contract_code,
                   oc.vendor_id, oc.total_license_count, oc.active_license_count,
                   oc.maintenance_start_date, oc.maintenance_end_date, oc.maintenance_amount,
                     oc.inspection_target, oc.maint_manager, oc.memo, oc.description, oc.created_at, oc.created_by,
                   oc.updated_at, oc.updated_by, oc.is_deleted,
                   {vendor_name_column}
            FROM {TABLE_NAME} oc
            {vendor_join_clause}
            WHERE oc.id = ?
            """,
            (record_id,),
        ).fetchone()

    record = _row_to_dict(row) if row else None
    if record:
        _backfill_vendor_names([record], vendor_table_present, app)
    return record


def get_opex_contract_by_manage_no(
    manage_no: str,
    *,
    opex_type: Optional[str] = None,
    include_deleted: bool = False,
    app=None,
) -> Optional[Dict[str, Any]]:
    """Fetch a single OPEX contract by manage_no (contract_code)."""
    app = app or current_app
    manage_no = (manage_no or '').strip()
    if not manage_no:
        return None
    opex_type_norm = _normalize_type(opex_type) if opex_type else None

    with _get_connection(app) as conn:
        vendor_table_present = _table_exists(conn, 'biz_vendor_maintenance')
        vendor_name_column = "IFNULL(vm.maintenance_name, '') AS vendor_name" if vendor_table_present else "'' AS vendor_name"
        vendor_join_clause = "LEFT JOIN biz_vendor_maintenance vm ON vm.id = oc.vendor_id" if vendor_table_present else ''

        clauses = ['oc.contract_code = ?']
        params: List[Any] = [manage_no]
        if opex_type_norm:
            clauses.append('oc.opex_type = ?')
            params.append(opex_type_norm)
        if not include_deleted:
            clauses.append('oc.is_deleted = 0')

        row = conn.execute(
            f"""
            SELECT oc.id, oc.opex_type, oc.contract_status, oc.contract_name, oc.contract_code,
                   oc.vendor_id, oc.total_license_count, oc.active_license_count,
                   oc.maintenance_start_date, oc.maintenance_end_date, oc.maintenance_amount,
                     oc.inspection_target, oc.maint_manager, oc.memo, oc.description, oc.created_at, oc.created_by,
                   oc.updated_at, oc.updated_by, oc.is_deleted,
                   {vendor_name_column}
            FROM {TABLE_NAME} oc
            {vendor_join_clause}
            WHERE {' AND '.join(clauses)}
            ORDER BY oc.id DESC
            LIMIT 1
            """,
            params,
        ).fetchone()

    record = _row_to_dict(row) if row else None
    if record:
        _backfill_vendor_names([record], vendor_table_present, app)
    return record


def create_opex_contract(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data)
    required = ['opex_type', 'contract_status', 'contract_name', 'contract_code', 'vendor_id', 'maintenance_start_date', 'maintenance_end_date', 'maintenance_amount']
    missing = [key for key in required if key not in payload]
    if missing:
        raise ValueError('필수 필드가 누락되었습니다: ' + ', '.join(missing))
    payload['opex_type'] = _normalize_type(payload['opex_type'])
    payload['contract_status'] = str(payload['contract_status']).strip()
    payload['contract_name'] = str(payload['contract_name']).strip()
    payload['contract_code'] = str(payload['contract_code']).strip()
    if not payload['contract_name'] or not payload['contract_code']:
        raise ValueError('계약명과 관리번호는 필수입니다.')
    payload['maintenance_start_date'] = _sanitize_date(payload['maintenance_start_date'])
    payload['maintenance_end_date'] = _sanitize_date(payload['maintenance_end_date'])
    if not payload['maintenance_start_date'] or not payload['maintenance_end_date']:
        raise ValueError('유지보수 시작/종료일을 입력하세요.')
    payload['vendor_id'] = int(payload['vendor_id'])
    payload['maintenance_amount'] = _sanitize_int(payload['maintenance_amount'], allow_none=False) or 0
    payload['total_license_count'] = _sanitize_int(payload.get('total_license_count'))
    payload['active_license_count'] = _sanitize_int(payload.get('active_license_count'))
    payload['inspection_target'] = _sanitize_bool(payload.get('inspection_target'))
    maint_manager = str(payload.get('maint_manager') or '').strip()
    timestamp = _now()
    with _get_connection(app) as conn:
        if not _vendor_exists(conn, payload['vendor_id']):
            raise ValueError('유효한 유지보수사를 선택하세요.')
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
                (opex_type, contract_status, contract_name, contract_code, vendor_id,
                 total_license_count, active_license_count, maintenance_start_date,
                 maintenance_end_date, maintenance_amount, inspection_target, maint_manager, memo, description,
                 created_at, created_by, updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                payload['opex_type'],
                payload['contract_status'],
                payload['contract_name'],
                payload['contract_code'],
                payload['vendor_id'],
                payload.get('total_license_count'),
                payload.get('active_license_count'),
                payload['maintenance_start_date'],
                payload['maintenance_end_date'],
                payload['maintenance_amount'],
                payload['inspection_target'],
                maint_manager,
                payload.get('memo'),
                payload.get('memo'),
                timestamp,
                actor,
                timestamp,
                actor,
            ),
        )
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
    return get_opex_contract(new_id, app)


def update_opex_contract(record_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data)
    if not payload:
        return get_opex_contract(record_id, app)
    updates: List[str] = []
    params: List[Any] = []
    maybe_new_vendor: Optional[int] = None
    if 'opex_type' in payload:
        payload['opex_type'] = _normalize_type(payload['opex_type'])
        updates.append('opex_type = ?')
        params.append(payload['opex_type'])
    if 'contract_status' in payload:
        updates.append('contract_status = ?')
        params.append(str(payload['contract_status']).strip())
    if 'contract_name' in payload:
        name = str(payload['contract_name']).strip()
        if not name:
            raise ValueError('계약명은 비워둘 수 없습니다.')
        updates.append('contract_name = ?')
        params.append(name)
    if 'contract_code' in payload:
        code = str(payload['contract_code']).strip()
        if not code:
            raise ValueError('관리번호는 비워둘 수 없습니다.')
        updates.append('contract_code = ?')
        params.append(code)
    if 'vendor_id' in payload:
        maybe_new_vendor = int(payload['vendor_id'])
        updates.append('vendor_id = ?')
        params.append(maybe_new_vendor)
    if 'total_license_count' in payload:
        updates.append('total_license_count = ?')
        params.append(_sanitize_int(payload['total_license_count']))
    if 'active_license_count' in payload:
        updates.append('active_license_count = ?')
        params.append(_sanitize_int(payload['active_license_count']))
    if 'maintenance_start_date' in payload:
        updates.append('maintenance_start_date = ?')
        params.append(_sanitize_date(payload['maintenance_start_date']))
    if 'maintenance_end_date' in payload:
        updates.append('maintenance_end_date = ?')
        params.append(_sanitize_date(payload['maintenance_end_date']))
    if 'maintenance_amount' in payload:
        updates.append('maintenance_amount = ?')
        params.append(_sanitize_int(payload['maintenance_amount'], allow_none=False) or 0)
    if 'inspection_target' in payload:
        updates.append('inspection_target = ?')
        params.append(_sanitize_bool(payload['inspection_target']))
    if 'maint_manager' in payload:
        updates.append('maint_manager = ?')
        params.append(str(payload['maint_manager'] or '').strip())
    if 'memo' in payload:
        # Keep legacy description in sync.
        updates.append('memo = ?')
        params.append(payload['memo'])
        updates.append('description = ?')
        params.append(payload['memo'])
    if not updates:
        return get_opex_contract(record_id, app)
    timestamp = _now()
    updates.extend(['updated_at = ?', 'updated_by = ?'])
    params.extend([timestamp, actor, record_id])
    with _get_connection(app) as conn:
        if maybe_new_vendor is not None and not _vendor_exists(conn, maybe_new_vendor):
            raise ValueError('유효한 유지보수사를 선택하세요.')
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ? AND is_deleted = 0",
            params,
        )
        if cur.rowcount == 0:
            return None
        conn.commit()
    return get_opex_contract(record_id, app)


def soft_delete_opex_contracts(ids: Iterable[Any], actor: str, app=None) -> int:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    safe_ids: List[int] = []
    for raw in ids:
        try:
            value = int(raw)
        except (TypeError, ValueError):
            continue
        if value >= 0:
            safe_ids.append(value)
    if not safe_ids:
        return 0
    placeholders = ','.join('?' for _ in safe_ids)
    timestamp = _now()
    with _get_connection(app) as conn:
        params: List[Any] = [timestamp, actor, *safe_ids]
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id IN ({placeholders}) AND is_deleted = 0",
            params,
        )
        conn.commit()
        return cur.rowcount
