import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'cost_capex_contract_tab62'
VALID_TYPES = {'HW', 'SW', 'ETC'}

CONTRACT_STATUS_OPTIONS = {'예정', '진행', '보류', '해지'}
CONTRACT_TYPE_OPTIONS = {'구매/매입', '구축/제작', '영구사용권'}
CONTRACT_DIVISION_OPTIONS = {'하드웨어', '소프트웨어', '부품', '기타'}

# tab62: 품목유형 옵션 (조달구분별)
HW_ITEM_TYPE_OPTIONS = {'서버', '스토리지', 'SAN', '네트워크', '보안장비'}
SW_ITEM_TYPE_OPTIONS = {'운영체제', '데이터베이스', '미들웨어', '가상화', '보안', 'HA'}

# Backward compatibility:
# - Previously stored values: '보안', 'HA'
# - New labels required by UI: '보안S/W', '고가용성'
SW_ITEM_TYPE_OPTIONS = {
    '운영체제',
    '데이터베이스',
    '미들웨어',
    '가상화',
    '보안S/W',
    '고가용성',
    # legacy
    '보안',
    'HA',
}
# Backward compatibility:
# - Previously stored values: '메모리', '디스크', '기타'
# - New labels required by UI: 'MEMORY', 'DISK', 'ETC'
CMP_ITEM_TYPE_OPTIONS = {
    'CPU',
    'GPU',
    'MEMORY',
    'DISK',
    'NIC',
    'HBA',
    'ETC',
    # legacy
    '메모리',
    '디스크',
    '기타',
}

_DESIRED_COLUMNS = [
    ('id', 'INTEGER PRIMARY KEY AUTOINCREMENT'),
    ('capex_type', 'TEXT NOT NULL'),
    ('manage_no', 'TEXT NOT NULL'),
    ('contract_status', 'TEXT'),
    ('contract_type', 'TEXT'),
    ('contract_division', 'TEXT'),
    ('item_type', 'TEXT'),
    ('supplier', 'TEXT'),
    ('manufacturer', 'TEXT'),
    ('model', 'TEXT'),
    ('specification', 'TEXT'),
    ('serial_no', 'TEXT'),
    ('unit_price', 'INTEGER'),
    ('quantity', 'INTEGER'),
    ('total_price', 'INTEGER'),
    ('rate', 'TEXT'),
    ('free_support_months', 'INTEGER'),
    ('support_start_date', 'TEXT'),
    ('support_end_date', 'TEXT'),
    ('inspection_inbound', 'INTEGER NOT NULL DEFAULT 0'),
    ('document', 'TEXT'),
    ('project_no', 'TEXT'),
    ('remark', 'TEXT'),
    ('created_at', 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP'),
    ('created_by', 'TEXT'),
    ('updated_at', 'TEXT'),
    ('updated_by', 'TEXT'),
    ('is_deleted', 'INTEGER NOT NULL DEFAULT 0'),
]


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


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

    # Match Flask-SQLAlchemy behavior on Windows for sqlite:///dev_blossom.db
    if os.path.isabs(path):
        normalized = path.replace('\\', '/')
        if normalized.startswith('/') and normalized.count('/') == 1:
            filename = normalized.lstrip('/')
            return os.path.abspath(os.path.join(app.instance_path, filename))
        return os.path.abspath(path)

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
    try:
        conn.execute('PRAGMA foreign_keys = ON')
    except sqlite3.DatabaseError:
        pass
    return conn


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    try:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
            (name,),
        ).fetchone()
        return bool(row)
    except sqlite3.DatabaseError:
        return False


def _get_table_columns(conn: sqlite3.Connection, name: str) -> List[str]:
    try:
        rows = conn.execute(f"PRAGMA table_info({name})").fetchall()
        return [str(r[1]) for r in rows if r and len(r) > 1]
    except sqlite3.DatabaseError:
        return []


def _create_table(conn: sqlite3.Connection) -> None:
    cols_sql = ',\n            '.join([f"{c} {t}" for c, t in _DESIRED_COLUMNS])
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
            {cols_sql}
        )
        """
    )


def _ensure_schema(conn: sqlite3.Connection) -> None:
    if not _table_exists(conn, TABLE_NAME):
        _create_table(conn)

    existing = set(_get_table_columns(conn, TABLE_NAME))
    for col, col_type in _DESIRED_COLUMNS:
        if col in existing:
            continue
        try:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN {col} {col_type}")
        except sqlite3.DatabaseError:
            # Ignore when sqlite cannot add column with certain constraints.
            pass

    try:
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_type_manage ON {TABLE_NAME}(capex_type, manage_no)"
        )
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_deleted ON {TABLE_NAME}(is_deleted)")
    except sqlite3.DatabaseError:
        pass


def init_cost_capex_contract_tab62_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            _ensure_schema(conn)
            conn.commit()
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def _normalize_type(token: Optional[str]) -> str:
    t = (token or '').strip().upper()
    if t in VALID_TYPES:
        return t
    return ''


def _digits_to_int(value) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        try:
            return int(value)
        except Exception:
            return None
    s = str(value).strip()
    if not s:
        return None
    neg = s.startswith('-')
    digits = ''.join(ch for ch in s if ch.isdigit())
    if not digits:
        return None
    try:
        n = int(digits)
        return -n if neg else n
    except Exception:
        return None


def _to_ox_int(value) -> int:
    # Accept: 1/0, true/false, 'O'/'X', 'Y'/'N'
    if value is None:
        return 0
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, (int, float)):
        try:
            return 1 if int(value) != 0 else 0
        except Exception:
            return 0
    s = str(value).strip().upper()
    if s in {'1', 'TRUE', 'YES', 'Y', 'O'}:
        return 1
    if s in {'0', 'FALSE', 'NO', 'N', 'X'}:
        return 0
    return 0


def _clean_str(value) -> Optional[str]:
    if value is None:
        return None
    s = str(value)
    s = s.strip()
    return s if s else None


def _validate_payload(payload: Dict[str, Any], *, is_create: bool) -> Dict[str, Any]:
    out: Dict[str, Any] = {}

    capex_type = _normalize_type(payload.get('capex_type') or payload.get('type'))
    manage_no = _clean_str(payload.get('manage_no') or payload.get('manageNo') or payload.get('contract_code'))

    if is_create:
        if not capex_type:
            raise ValueError('CAPEX 구분(HW/SW/ETC)이 필요합니다.')
        if not manage_no:
            raise ValueError('manage_no(관리번호)가 필요합니다.')
        out['capex_type'] = capex_type
        out['manage_no'] = manage_no

    if 'contract_status' in payload:
        v = _clean_str(payload.get('contract_status'))
        if v and v not in CONTRACT_STATUS_OPTIONS:
            raise ValueError('계약상태는 예정/진행/보류/해지 중 하나여야 합니다.')
        out['contract_status'] = v

    if 'contract_type' in payload:
        v = _clean_str(payload.get('contract_type'))
        if v and v not in CONTRACT_TYPE_OPTIONS:
            raise ValueError('계약유형은 구매·매입/구축·제작/영구사용권 중 하나여야 합니다.')
        out['contract_type'] = v

    if 'contract_division' in payload:
        v = _clean_str(payload.get('contract_division'))
        if v and v not in CONTRACT_DIVISION_OPTIONS:
            raise ValueError('계약구분은 하드웨어/소프트웨어/부품/기타 중 하나여야 합니다.')
        out['contract_division'] = v

    if 'item_type' in payload:
        v = _clean_str(payload.get('item_type'))
        # Best-effort validation by division (allow blank)
        division = out.get('contract_division')
        if division is None:
            division = _clean_str(payload.get('contract_division'))
        division = (division or '').strip()
        if v and division == '하드웨어' and v not in HW_ITEM_TYPE_OPTIONS:
            raise ValueError('품목 유형은 서버/스토리지/SAN/네트워크/보안장비 중 하나여야 합니다.')
        if v and division == '소프트웨어' and v not in SW_ITEM_TYPE_OPTIONS:
            raise ValueError('품목 유형은 운영체제/데이터베이스/미들웨어/가상화/보안S/W/고가용성 중 하나여야 합니다.')
        if v and division == '부품' and v not in CMP_ITEM_TYPE_OPTIONS:
            raise ValueError('품목 유형은 CPU/GPU/MEMORY/DISK/NIC/HBA/ETC 중 하나여야 합니다.')
        out['item_type'] = v

    for k in ['supplier', 'manufacturer', 'model', 'specification', 'serial_no', 'rate', 'document', 'remark', 'project_no']:
        if k in payload:
            out[k] = _clean_str(payload.get(k))

    if 'unit_price' in payload:
        out['unit_price'] = _digits_to_int(payload.get('unit_price'))

    if 'quantity' in payload:
        out['quantity'] = _digits_to_int(payload.get('quantity'))

    if 'total_price' in payload:
        out['total_price'] = _digits_to_int(payload.get('total_price'))

    if 'free_support_months' in payload:
        out['free_support_months'] = _digits_to_int(payload.get('free_support_months'))

    if 'support_start_date' in payload:
        out['support_start_date'] = _clean_str(payload.get('support_start_date'))

    if 'support_end_date' in payload:
        out['support_end_date'] = _clean_str(payload.get('support_end_date'))

    if 'inspection_inbound' in payload:
        out['inspection_inbound'] = _to_ox_int(payload.get('inspection_inbound'))

    # Compute total_price when omitted but unit_price/quantity exist.
    if ('total_price' not in out) and (('unit_price' in out) or ('quantity' in out)):
        unit_price = out.get('unit_price')
        quantity = out.get('quantity')
        if isinstance(unit_price, int) and isinstance(quantity, int):
            out['total_price'] = int(unit_price) * int(quantity)

    return out


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    def _get(name: str):
        try:
            return row[name]
        except Exception:
            return None

    return {
        'id': _get('id'),
        'capex_type': _get('capex_type'),
        'manage_no': _get('manage_no'),
        'contract_status': _get('contract_status'),
        'contract_type': _get('contract_type'),
        'contract_division': _get('contract_division'),
        'item_type': _get('item_type'),
        'supplier': _get('supplier'),
        'manufacturer': _get('manufacturer'),
        'model': _get('model'),
        'specification': _get('specification'),
        'serial_no': _get('serial_no'),
        'unit_price': _get('unit_price'),
        'quantity': _get('quantity'),
        'total_price': _get('total_price'),
        'rate': _get('rate'),
        'free_support_months': _get('free_support_months'),
        'support_start_date': _get('support_start_date'),
        'support_end_date': _get('support_end_date'),
        'inspection_inbound': 1 if int(_get('inspection_inbound') or 0) != 0 else 0,
        'document': _get('document'),
        'project_no': _get('project_no'),
        'remark': _get('remark'),
        'created_at': _get('created_at'),
        'created_by': _get('created_by'),
        'updated_at': _get('updated_at'),
        'updated_by': _get('updated_by'),
        'is_deleted': 1 if int(_get('is_deleted') or 0) != 0 else 0,
    }


def list_tab62_items(*, capex_type: str, manage_no: str, include_deleted: bool = False, app=None) -> List[Dict[str, Any]]:
    init_cost_capex_contract_tab62_table(app)
    t = _normalize_type(capex_type)
    mn = (manage_no or '').strip()
    if not t:
        raise ValueError('CAPEX 구분(HW/SW/ETC)이 필요합니다.')
    if not mn:
        raise ValueError('manage_no(관리번호)가 필요합니다.')

    with _get_connection(app) as conn:
        _ensure_schema(conn)
        clauses = ['capex_type = ?', 'manage_no = ?']
        params: List[Any] = [t, mn]
        if not include_deleted:
            clauses.append('is_deleted = 0')
        where_sql = ' AND '.join(clauses)
        rows = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE {where_sql} ORDER BY id ASC",
            tuple(params),
        ).fetchall()
        return [_row_to_dict(r) for r in (rows or [])]


def list_tab62_items_by_project_no(*, project_no: str, include_deleted: bool = False, app=None) -> List[Dict[str, Any]]:
    """Return all tab62 items whose project_no matches the given value.

    Joins with the parent ``capex_contract`` table to resolve
    ``contract_status`` (조달상태) from the purchase-number level.
    """
    init_cost_capex_contract_tab62_table(app)
    pn = (project_no or '').strip()
    if not pn:
        raise ValueError('project_no(프로젝트 번호)가 필요합니다.')

    with _get_connection(app) as conn:
        _ensure_schema(conn)
        clauses = ['t.project_no = ?']
        params: List[Any] = [pn]
        if not include_deleted:
            clauses.append('t.is_deleted = 0')
        where_sql = ' AND '.join(clauses)
        rows = conn.execute(
            f"SELECT t.*, c.contract_status AS parent_contract_status "
            f"FROM {TABLE_NAME} t "
            f"LEFT JOIN capex_contract c "
            f"  ON c.contract_code = t.manage_no AND c.is_deleted = 0 "
            f"WHERE {where_sql} ORDER BY t.id ASC",
            tuple(params),
        ).fetchall()
        results = []
        for r in (rows or []):
            d = _row_to_dict(r)
            # 조달상태: tab62 자체 status가 없으면 부모 계약의 status를 사용
            if not d.get('contract_status'):
                try:
                    d['contract_status'] = r['parent_contract_status']
                except (IndexError, KeyError):
                    pass
            results.append(d)
        return results


def create_tab62_item(payload: Dict[str, Any], *, actor: str, app=None) -> Dict[str, Any]:
    init_cost_capex_contract_tab62_table(app)
    data = _validate_payload(payload, is_create=True)

    cols = []
    vals = []
    for k, v in data.items():
        cols.append(k)
        vals.append(v)

    cols.extend(['created_at', 'created_by'])
    vals.extend([_now(), actor])

    placeholders = ','.join(['?'] * len(cols))
    col_sql = ','.join(cols)

    with _get_connection(app) as conn:
        _ensure_schema(conn)
        cur = conn.execute(
            f"INSERT INTO {TABLE_NAME} ({col_sql}) VALUES ({placeholders})",
            tuple(vals),
        )
        new_id = int(cur.lastrowid or 0)
        conn.commit()
        row = conn.execute(f"SELECT * FROM {TABLE_NAME} WHERE id = ?", (new_id,)).fetchone()
        if not row:
            raise RuntimeError('Failed to fetch created record')
        return _row_to_dict(row)


def update_tab62_item(item_id: int, payload: Dict[str, Any], *, actor: str, app=None) -> Optional[Dict[str, Any]]:
    init_cost_capex_contract_tab62_table(app)
    if int(item_id or 0) <= 0:
        raise ValueError('id 값이 올바르지 않습니다.')

    data = _validate_payload(payload, is_create=False)

    # IMPORTANT: Protect existing values on update.
    # Frontend searchable/select controls can transiently send empty strings,
    # which become None after validation. If we persist those Nones, existing
    # DB values are overwritten and appear as "disappeared" after refresh.
    # For PUT, treat None as "no change".
    data = {k: v for k, v in data.items() if v is not None}
    if not data:
        # Nothing to update.
        with _get_connection(app) as conn:
            _ensure_schema(conn)
            row = conn.execute(
                f"SELECT * FROM {TABLE_NAME} WHERE id = ? AND is_deleted = 0",
                (int(item_id),),
            ).fetchone()
            return _row_to_dict(row) if row else None

    sets = []
    params: List[Any] = []
    for k, v in data.items():
        sets.append(f"{k} = ?")
        params.append(v)

    sets.extend(['updated_at = ?', 'updated_by = ?'])
    params.extend([_now(), actor])

    params.append(int(item_id))

    with _get_connection(app) as conn:
        _ensure_schema(conn)
        conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(sets)} WHERE id = ? AND is_deleted = 0",
            tuple(params),
        )
        conn.commit()
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (int(item_id),),
        ).fetchone()
        return _row_to_dict(row) if row else None


def soft_delete_tab62_items(ids: Iterable[int], *, actor: str, app=None) -> int:
    init_cost_capex_contract_tab62_table(app)
    id_list = [int(x) for x in (ids or []) if str(x).strip().isdigit() and int(x) > 0]
    if not id_list:
        return 0
    with _get_connection(app) as conn:
        _ensure_schema(conn)
        placeholders = ','.join(['?'] * len(id_list))
        params: List[Any] = [_now(), actor] + id_list
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id IN ({placeholders})",
            tuple(params),
        )
        conn.commit()
        return int(cur.rowcount or 0)


def hard_delete_tab62_item(item_id: int, app=None) -> bool:
    init_cost_capex_contract_tab62_table(app)
    if int(item_id or 0) <= 0:
        return False
    with _get_connection(app) as conn:
        _ensure_schema(conn)
        cur = conn.execute(f"DELETE FROM {TABLE_NAME} WHERE id = ?", (int(item_id),))
        conn.commit()
        return int(cur.rowcount or 0) > 0
