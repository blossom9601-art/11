import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlparse

from flask import current_app

from app.services.public_id_service import make_public_id

logger = logging.getLogger(__name__)

TABLE_NAME = 'facility_security_infra_type'

RESOURCE_CONFIGS = {
    'access': {
        'label': '출입관리',
        'code_prefix': 'FSACC',
        'public_prefix': 'fsacc',
        'manual': True,
        'source_table': 'dc_access_system',
        'source_column': 'system_model_name',
        'select': """
            SELECT id,
                   system_model_name AS model_name,
                   system_code AS source_code,
                   system_name AS source_name,
                   manufacturer_name AS manufacturer_name,
                   system_location AS location_name
            FROM dc_access_system
            WHERE COALESCE(is_deleted, 0) = 0
              AND TRIM(COALESCE(system_model_name, '')) <> ''
        """,
    },
    'data_delete': {
        'label': '데이터삭제',
        'code_prefix': 'FSDEL',
        'public_prefix': 'fsdel',
        'manual': True,
        'source_table': 'data_delete_system',
        'source_column': 'system_model_name',
        'select': """
            SELECT d.id,
                   d.system_model_name AS model_name,
                   d.system_name AS source_code,
                   d.business_name AS source_name,
                   COALESCE(v.manufacturer_name, d.manufacturer_code, '') AS manufacturer_name,
                   COALESCE(d.rack_position, d.center_code, '') AS location_name
            FROM data_delete_system d
            LEFT JOIN biz_vendor_manufacturer v
              ON v.manufacturer_code = d.manufacturer_code
             AND COALESCE(v.is_deleted, 0) = 0
            WHERE COALESCE(d.is_deleted, 0) = 0
              AND TRIM(COALESCE(d.system_model_name, '')) <> ''
        """,
    },
    'rack': {
        'label': 'RACK',
        'code_prefix': 'FSRACK',
        'public_prefix': 'fsrack',
        'manual': True,
        'source_table': 'org_rack',
        'source_column': 'system_model_code',
        'select': """
            SELECT r.id,
                   r.system_model_code AS model_name,
                   r.rack_code AS source_code,
                   r.business_name AS source_name,
                   COALESCE(v.manufacturer_name, r.manufacturer_code, '') AS manufacturer_name,
                   r.rack_position AS location_name
            FROM org_rack r
            LEFT JOIN biz_vendor_manufacturer v
              ON v.manufacturer_code = r.manufacturer_code
             AND COALESCE(v.is_deleted, 0) = 0
            WHERE COALESCE(r.is_deleted, 0) = 0
              AND TRIM(COALESCE(r.system_model_code, '')) <> ''
        """,
    },
    'thermometer': {
        'label': '온/습도계',
        'code_prefix': 'FSTH',
        'public_prefix': 'fsth',
        'manual': True,
        'source_table': 'org_thermometer',
        'source_column': 'model_name',
        'select': """
            SELECT id,
                   model_name AS model_name,
                   device_code AS source_code,
                   business_name AS source_name,
                   vendor_name AS manufacturer_name,
                   place_name AS location_name
            FROM org_thermometer
            WHERE COALESCE(is_deleted, 0) = 0
              AND TRIM(COALESCE(model_name, '')) <> ''
        """,
    },
    'cctv': {
        'label': '영상감시',
        'code_prefix': 'FSCCTV',
        'public_prefix': 'fscctv',
        'manual': True,
        'source_table': 'cctv',
        'source_column': 'model_name',
        'select': """
            SELECT id,
                   model_name AS model_name,
                   device_code AS source_code,
                   business_name AS source_name,
                   vendor_name AS manufacturer_name,
                   place_name AS location_name
            FROM cctv
            WHERE COALESCE(is_deleted, 0) = 0
              AND TRIM(COALESCE(model_name, '')) <> ''
        """,
    },
    'transformer': {
        'label': '변압기',
        'code_prefix': 'FSTRANS',
        'public_prefix': 'fstrans',
        'manual': True,
        'source_table': TABLE_NAME,
        'source_column': 'model_name',
    },
    'generator': {
        'label': '발전기',
        'code_prefix': 'FSGEN',
        'public_prefix': 'fsgen',
        'manual': True,
        'source_table': TABLE_NAME,
        'source_column': 'model_name',
    },
    'ups': {
        'label': '무정전전원장치',
        'code_prefix': 'FSUPS',
        'public_prefix': 'fsups',
        'manual': True,
        'source_table': TABLE_NAME,
        'source_column': 'model_name',
    },
    'battery': {
        'label': '배터리',
        'code_prefix': 'FSBAT',
        'public_prefix': 'fsbat',
        'manual': True,
        'source_table': TABLE_NAME,
        'source_column': 'model_name',
    },
    'hvac': {
        'label': '항온항습기',
        'code_prefix': 'FSHVAC',
        'public_prefix': 'fshvac',
        'manual': True,
        'source_table': TABLE_NAME,
        'source_column': 'model_name',
    },
    'leak_detector': {
        'label': '누수감지',
        'code_prefix': 'FSLEAK',
        'public_prefix': 'fsleak',
        'manual': True,
        'source_table': TABLE_NAME,
        'source_column': 'model_name',
    },
    'detection': {
        'label': '감지설비',
        'code_prefix': 'FSDET',
        'public_prefix': 'fsdet',
        'manual': True,
        'source_table': TABLE_NAME,
        'source_column': 'model_name',
    },
    'fire_extinguishing': {
        'label': '소화설비',
        'code_prefix': 'FSFIRE',
        'public_prefix': 'fsfire',
        'manual': True,
        'source_table': TABLE_NAME,
        'source_column': 'model_name',
    },
    'evacuation': {
        'label': '대피설비',
        'code_prefix': 'FSEVAC',
        'public_prefix': 'fsevac',
        'manual': True,
        'source_table': TABLE_NAME,
        'source_column': 'model_name',
    },
}

CREATE_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_type TEXT NOT NULL,
    infra_code TEXT NOT NULL UNIQUE,
    model_name TEXT NOT NULL,
    source_resource_id INTEGER,
    source_resource_code TEXT,
    source_resource_name TEXT,
    source_table TEXT NOT NULL,
    source_column TEXT NOT NULL,
    manufacturer_name TEXT,
    capacity TEXT,
    model_number TEXT,
    eosl TEXT,
    spec_summary TEXT,
    part_number TEXT,
    infra_count INTEGER NOT NULL DEFAULT 0,
    location_name TEXT,
    remark TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_at TEXT,
    updated_by TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0
)
"""


def _list_columns(conn: sqlite3.Connection) -> Dict[str, sqlite3.Row]:
    rows = conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall()
    return {row[1]: row for row in rows}


def _ensure_modern_columns(conn: sqlite3.Connection) -> None:
    columns = _list_columns(conn)

    def add_column(name: str, ddl: str) -> None:
        if name not in columns:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN {name} {ddl}")

    add_column('capacity', 'TEXT')
    add_column('model_number', 'TEXT')
    add_column('eosl', 'TEXT')
    add_column('part_number', 'TEXT')
    conn.commit()


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    override = app.config.get('FACILITY_SECURITY_INFRA_SQLITE_PATH')
    if override:
        return os.path.abspath(override)
    if not uri.startswith('sqlite'):
        return os.path.join(app.instance_path, 'facility_security_infra.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'facility_security_infra.db')
    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    if path.startswith('/') and not path.startswith('//'):
        path = path.lstrip('/')
    if os.path.isabs(path):
        return os.path.abspath(path)
    return os.path.abspath(os.path.join(app.instance_path, path.lstrip('/')))


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


def _resource_config(resource_type: str) -> Dict[str, Any]:
    key = (resource_type or '').strip().lower().replace('-', '_')
    cfg = RESOURCE_CONFIGS.get(key)
    if not cfg:
        raise ValueError('지원하지 않는 시설·보안 구분입니다.')
    return cfg


def _resource_key(resource_type: str) -> str:
    key = (resource_type or '').strip().lower().replace('-', '_')
    _resource_config(key)
    return key


def _sanitize_int(value: Any) -> int:
    if value in (None, ''):
        return 0
    try:
        parsed = int(value)
        return parsed if parsed >= 0 else 0
    except (TypeError, ValueError):
        return 0


def _normalize_code(seed: str, prefix: str) -> str:
    base = (seed or prefix).upper()
    base = re.sub(r'[^A-Z0-9]+', '_', base).strip('_') or prefix
    if not base.startswith(prefix):
        base = f'{prefix}_{base}'
    return base[:80]


def _generate_unique_code(conn: sqlite3.Connection, seed: str, prefix: str) -> str:
    base = _normalize_code(seed, prefix)
    candidate = base
    counter = 1
    while True:
        row = conn.execute(f"SELECT 1 FROM {TABLE_NAME} WHERE infra_code = ?", (candidate,)).fetchone()
        if not row:
            return candidate
        counter += 1
        suffix = f"_{counter}"
        candidate = base[:80 - len(suffix)] + suffix if len(base) + len(suffix) > 80 else base + suffix
        if counter > 9999:
            raise ValueError('인프라 코드를 생성하지 못했습니다.')


def _assert_unique_code(conn: sqlite3.Connection, code: str, record_id: Optional[int] = None) -> None:
    row = conn.execute(f"SELECT id FROM {TABLE_NAME} WHERE infra_code = ?", (code,)).fetchone()
    if row and (record_id is None or int(row['id']) != int(record_id)):
        raise ValueError('이미 사용 중인 인프라 코드입니다.')


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?",
        (table_name,),
    ).fetchone()
    return bool(row)


def _source_rows(conn: sqlite3.Connection, resource_type: str) -> List[Dict[str, Any]]:
    cfg = _resource_config(resource_type)
    if cfg.get('manual'):
        return []
    source_table = cfg['source_table']
    if not _table_exists(conn, source_table):
        return []
    try:
        rows = conn.execute(cfg['select'] + " ORDER BY model_name COLLATE NOCASE ASC, id ASC").fetchall()
    except sqlite3.DatabaseError as exc:
        logger.warning('source model query failed for %s: %s', resource_type, exc)
        return []
    output: List[Dict[str, Any]] = []
    seen = set()
    for row in rows:
        model_name = str(row['model_name'] or '').strip()
        if not model_name:
            continue
        source_id = int(row['id']) if row['id'] is not None else 0
        dedupe_key = (source_id, model_name)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        output.append({
            'id': source_id,
            'source_id': source_id,
            'model_name': model_name,
            'model': model_name,
            'source_code': str(row['source_code'] or '').strip(),
            'source_name': str(row['source_name'] or '').strip(),
            'manufacturer_name': str(row['manufacturer_name'] or '').strip(),
            'vendor': str(row['manufacturer_name'] or '').strip(),
            'location_name': str(row['location_name'] or '').strip(),
            'source_table': cfg['source_table'],
            'source_column': cfg['source_column'],
            'source_fk': f"{cfg['source_table']}.{cfg['source_column']}",
        })
    return output


def list_facility_security_source_models(
    resource_type: str,
    app=None,
    *,
    search: Optional[str] = None,
) -> List[Dict[str, Any]]:
    app = app or current_app
    key = _resource_key(resource_type)
    needle = (search or '').strip().lower()
    with _get_connection(app) as conn:
        rows = _source_rows(conn, key)
    if needle:
        rows = [
            row for row in rows
            if needle in row['model_name'].lower()
            or needle in row.get('source_code', '').lower()
            or needle in row.get('source_name', '').lower()
            or needle in row.get('manufacturer_name', '').lower()
        ]
    return rows


def _find_source_model(
    conn: sqlite3.Connection,
    resource_type: str,
    *,
    source_id: Optional[int] = None,
    model_name: str = '',
) -> Dict[str, Any]:
    cfg = _resource_config(resource_type)
    rows = _source_rows(conn, resource_type)
    if source_id:
        for row in rows:
            if int(row.get('source_id') or 0) == int(source_id):
                return row
    clean_model = (model_name or '').strip()
    if clean_model:
        for row in rows:
            if row['model_name'] == clean_model:
                return row
    raise ValueError(f"{cfg['label']} 원본 시스템 모델명을 선택하세요.")


def _prepare_payload(data: Dict[str, Any], *, require_model: bool = False) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    mapping = {
        'infra_code': ['infra_code', 'code'],
        'model_name': ['model_name', 'model', 'source_model_name'],
        'source_resource_id': ['source_resource_id', 'source_id', 'sourceId'],
        'spec_summary': ['spec_summary', 'spec', 'specs', 'specification'],
        'capacity': ['capacity', 'power_capacity'],
        'manufacturer_name': ['manufacturer_name', 'manufacturer', 'vendor'],
        'model_number': ['model_number', 'model_no', 'modelNo'],
        'eosl': ['eosl', 'management_life', 'lifecycle_end', 'life_cycle'],
        'part_number': ['part_number', 'part_no'],
        'infra_count': ['infra_count', 'qty', 'count'],
        'location_name': ['location_name', 'location', 'place_name'],
        'remark': ['remark', 'note', 'description'],
    }
    for column, aliases in mapping.items():
        for alias in aliases:
            if alias in data and data.get(alias) not in (None, ''):
                payload[column] = data.get(alias)
                break
    if 'source_resource_id' in payload:
        payload['source_resource_id'] = _sanitize_int(payload['source_resource_id']) or None
    if 'infra_count' in payload:
        payload['infra_count'] = _sanitize_int(payload['infra_count'])
    if require_model and not (payload.get('source_resource_id') or payload.get('model_name')):
        raise ValueError('모델명을 선택하세요.')
    return payload


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}
    resource_type = row['resource_type']
    cfg = _resource_config(resource_type)
    public_id = make_public_id(TABLE_NAME, cfg['public_prefix'], row['id'])
    qty = int(row['infra_count'] or 0)
    return {
        'id': row['id'],
        'public_id': public_id,
        'resource_type': resource_type,
        'resource_label': cfg['label'],
        'infra_code': row['infra_code'],
        'code': row['infra_code'],
        'model_name': row['model_name'],
        'model': row['model_name'],
        'source_model_name': row['model_name'],
        'source_resource_id': row['source_resource_id'],
        'source_id': row['source_resource_id'],
        'source_resource_code': row['source_resource_code'] or '',
        'source_code': row['source_resource_code'] or '',
        'source_resource_name': row['source_resource_name'] or '',
        'source_name': row['source_resource_name'] or '',
        'source_table': row['source_table'],
        'source_column': row['source_column'],
        'source_fk': f"{row['source_table']}.{row['source_column']}",
        'manufacturer_name': row['manufacturer_name'] or '',
        'vendor': row['manufacturer_name'] or '',
        'capacity': row['capacity'] or '',
        'model_number': row['model_number'] or '',
        'model_no': row['model_number'] or '',
        'eosl': row['eosl'] or '',
        'management_life': row['eosl'] or '',
        'spec_summary': row['spec_summary'] or '',
        'spec': row['spec_summary'] or '',
        'part_number': row['part_number'] or '',
        'part_no': row['part_number'] or '',
        'infra_count': qty,
        'qty': qty,
        'location_name': row['location_name'] or '',
        'location': row['location_name'] or '',
        'remark': row['remark'] or '',
        'note': row['remark'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
    }


def init_facility_security_infra_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(CREATE_TABLE_SQL)
            _ensure_modern_columns(conn)
            conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_resource ON {TABLE_NAME}(resource_type)")
            conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_deleted ON {TABLE_NAME}(is_deleted)")
            conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_source ON {TABLE_NAME}(source_table, source_resource_id)")
            conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_model ON {TABLE_NAME}(model_name)")
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def list_facility_security_infra_types(
    resource_type: str,
    app=None,
    *,
    search: Optional[str] = None,
    include_deleted: bool = False,
    field: Optional[str] = None,
) -> List[Dict[str, Any]]:
    app = app or current_app
    key = _resource_key(resource_type)
    with _get_connection(app) as conn:
        clauses = ['resource_type = ?']
        params: List[Any] = [key]
        if not include_deleted:
            clauses.append('is_deleted = 0')
        if search:
            like = f"%{search}%"
            f = (field or '').strip().lower()
            if f in ('model', 'model_name'):
                clauses.append('model_name LIKE ?')
                params.append(like)
            elif f in ('vendor', 'manufacturer'):
                clauses.append('manufacturer_name LIKE ?')
                params.append(like)
            else:
                clauses.append('(' + ' OR '.join([
                    'infra_code LIKE ?',
                    'model_name LIKE ?',
                    'source_resource_code LIKE ?',
                    'source_resource_name LIKE ?',
                    'manufacturer_name LIKE ?',
                    'capacity LIKE ?',
                    'model_number LIKE ?',
                    'eosl LIKE ?',
                    'spec_summary LIKE ?',
                    'part_number LIKE ?',
                    'location_name LIKE ?',
                    'remark LIKE ?',
                ]) + ')')
                params.extend([like] * 12)
        rows = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE {' AND '.join(clauses)} ORDER BY id DESC",
            params,
        ).fetchall()
        return [_row_to_dict(row) for row in rows]


def get_facility_security_infra_type(
    record_id: int,
    app=None,
    *,
    resource_type: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        if resource_type:
            key = _resource_key(resource_type)
            row = conn.execute(
                f"SELECT * FROM {TABLE_NAME} WHERE id = ? AND resource_type = ?",
                (record_id, key),
            ).fetchone()
        else:
            row = conn.execute(f"SELECT * FROM {TABLE_NAME} WHERE id = ?", (record_id,)).fetchone()
        return _row_to_dict(row) if row else None


def _create_or_update_source_fields(
    conn: sqlite3.Connection,
    resource_type: str,
    payload: Dict[str, Any],
    *,
    existing: Optional[sqlite3.Row] = None,
) -> Dict[str, Any]:
    cfg = _resource_config(resource_type)
    source_id = payload.get('source_resource_id')
    model_name = str(payload.get('model_name') or '').strip()
    if not source_id and not model_name and existing:
        source_id = existing['source_resource_id']
        model_name = existing['model_name']
    if cfg.get('manual'):
        if not model_name:
            raise ValueError(f"{cfg['label']} 모델명을 입력하세요.")
        payload['model_name'] = model_name
        payload['source_resource_id'] = None
        payload['source_resource_code'] = ''
        payload['source_resource_name'] = ''
        payload['source_table'] = cfg['source_table']
        payload['source_column'] = cfg['source_column']
        return payload
    source = _find_source_model(conn, resource_type, source_id=source_id, model_name=model_name)
    payload['model_name'] = source['model_name']
    payload['source_resource_id'] = source['source_id']
    payload['source_resource_code'] = source.get('source_code') or ''
    payload['source_resource_name'] = source.get('source_name') or ''
    payload['source_table'] = source['source_table']
    payload['source_column'] = source['source_column']
    payload.setdefault('manufacturer_name', source.get('manufacturer_name') or '')
    payload.setdefault('location_name', source.get('location_name') or '')
    return payload


def create_facility_security_infra_type(
    resource_type: str,
    data: Dict[str, Any],
    actor: str,
    app=None,
) -> Dict[str, Any]:
    app = app or current_app
    key = _resource_key(resource_type)
    cfg = _resource_config(key)
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data, require_model=True)
    timestamp = _now()
    with _get_connection(app) as conn:
        payload = _create_or_update_source_fields(conn, key, payload)
        infra_code = str(payload.get('infra_code') or '').strip()
        if infra_code:
            infra_code = _normalize_code(infra_code, cfg['code_prefix'])
            _assert_unique_code(conn, infra_code)
        else:
            infra_code = _generate_unique_code(conn, payload['model_name'], cfg['code_prefix'])
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
                (resource_type, infra_code, model_name, source_resource_id, source_resource_code,
                 source_resource_name, source_table, source_column, manufacturer_name, capacity,
                 model_number, eosl, spec_summary,
                 part_number, infra_count, location_name, remark, created_at, created_by,
                 updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                key,
                infra_code,
                payload['model_name'],
                payload.get('source_resource_id'),
                payload.get('source_resource_code'),
                payload.get('source_resource_name'),
                payload.get('source_table'),
                payload.get('source_column'),
                payload.get('manufacturer_name'),
                payload.get('capacity'),
                payload.get('model_number'),
                payload.get('eosl'),
                payload.get('spec_summary'),
                payload.get('part_number'),
                payload.get('infra_count', 0),
                payload.get('location_name'),
                payload.get('remark'),
                timestamp,
                actor,
                timestamp,
                actor,
            ),
        )
        conn.commit()
        new_id = int(cur.lastrowid)
    return get_facility_security_infra_type(new_id, app, resource_type=key)


def update_facility_security_infra_type(
    resource_type: str,
    record_id: int,
    data: Dict[str, Any],
    actor: str,
    app=None,
) -> Optional[Dict[str, Any]]:
    app = app or current_app
    key = _resource_key(resource_type)
    cfg = _resource_config(key)
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data, require_model=False)
    with _get_connection(app) as conn:
        existing = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ? AND resource_type = ? AND is_deleted = 0",
            (record_id, key),
        ).fetchone()
        if not existing:
            return None
        source_payload = any(name in payload for name in ('model_name', 'source_resource_id'))
        if source_payload:
            payload = _create_or_update_source_fields(conn, key, payload, existing=existing)
        updates: List[str] = []
        params: List[Any] = []
        if 'infra_code' in payload:
            infra_code = str(payload.get('infra_code') or '').strip()
            if infra_code:
                infra_code = _normalize_code(infra_code, cfg['code_prefix'])
                _assert_unique_code(conn, infra_code, record_id)
                updates.append('infra_code = ?')
                params.append(infra_code)
        for column in (
            'model_name',
            'source_resource_id',
            'source_resource_code',
            'source_resource_name',
            'source_table',
            'source_column',
            'manufacturer_name',
            'capacity',
            'model_number',
            'eosl',
            'spec_summary',
            'part_number',
            'infra_count',
            'location_name',
            'remark',
        ):
            if column in payload:
                updates.append(f"{column} = ?")
                params.append(payload[column])
        if not updates:
            return get_facility_security_infra_type(record_id, app, resource_type=key)
        updates.extend(['updated_at = ?', 'updated_by = ?'])
        params.extend([_now(), actor, record_id, key])
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ? AND resource_type = ? AND is_deleted = 0",
            params,
        )
        if cur.rowcount == 0:
            return None
        conn.commit()
    return get_facility_security_infra_type(record_id, app, resource_type=key)


def soft_delete_facility_security_infra_types(
    resource_type: str,
    ids: Iterable[Any],
    actor: str,
    app=None,
) -> int:
    app = app or current_app
    key = _resource_key(resource_type)
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
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE resource_type = ? AND id IN ({placeholders})",
            [_now(), actor, key] + safe_ids,
        )
        conn.commit()
        return int(cur.rowcount or 0)


def get_facility_security_access_type(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    return get_facility_security_infra_type(record_id, app, resource_type='access')


def get_facility_security_data_delete_type(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    return get_facility_security_infra_type(record_id, app, resource_type='data_delete')


def get_facility_security_rack_type(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    return get_facility_security_infra_type(record_id, app, resource_type='rack')


def get_facility_security_thermometer_type(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    return get_facility_security_infra_type(record_id, app, resource_type='thermometer')


def get_facility_security_cctv_type(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    return get_facility_security_infra_type(record_id, app, resource_type='cctv')


def get_facility_security_transformer_type(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    return get_facility_security_infra_type(record_id, app, resource_type='transformer')


def get_facility_security_generator_type(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    return get_facility_security_infra_type(record_id, app, resource_type='generator')


def get_facility_security_ups_type(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    return get_facility_security_infra_type(record_id, app, resource_type='ups')


def get_facility_security_battery_type(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    return get_facility_security_infra_type(record_id, app, resource_type='battery')


def get_facility_security_hvac_type(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    return get_facility_security_infra_type(record_id, app, resource_type='hvac')


def get_facility_security_leak_detector_type(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    return get_facility_security_infra_type(record_id, app, resource_type='leak_detector')


def get_facility_security_detection_type(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    return get_facility_security_infra_type(record_id, app, resource_type='detection')


def get_facility_security_fire_extinguishing_type(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    return get_facility_security_infra_type(record_id, app, resource_type='fire_extinguishing')


def get_facility_security_evacuation_type(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    return get_facility_security_infra_type(record_id, app, resource_type='evacuation')
