import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import urlparse

from flask import current_app

from app.services.work_asset_counts import counts_by_code, sw_counts_via_hardware

logger = logging.getLogger(__name__)

TABLE_NAME = 'biz_work_group'
CHANGE_LOG_TABLE_NAME = 'biz_work_group_change_log'
MANAGER_TABLE_NAME = 'biz_work_group_manager'
SYSTEM_TABLE_NAME = 'system'
SERVICE_TABLE_NAME = 'biz_work_group_service'


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        fallback = app.config.get('WORK_GROUP_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'work_group.db')

    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    # Windows: urlparse("sqlite:///C:/path/to/db") yields path like "/C:/path/to/db".
    # Strip the leading slash so it becomes a valid absolute Windows path.
    if len(path) >= 4 and path[0] == '/' and path[2] == ':' and path[1].isalpha():
        path = path[1:]
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'work_group.db')
    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    # Keep sqlite path resolution consistent with Flask-SQLAlchemy:
    # - For sqlite URIs like "sqlite:///dev_blossom.db", Flask resolves the file under instance_path.
    # - Our service layer should point at the same DB so FK lookups (e.g., org_department) match.
    #
    # NOTE: urlparse yields path like "/dev_blossom.db" on Windows for sqlite:///dev_blossom.db.
    # Treat that as a filename, not an absolute filesystem path.
    if os.path.isabs(path):
        normalized = path.replace('\\', '/')
        # Special-case "/<filename>.db" (no other slashes) as instance-relative.
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
        logger.warning('Could not enable foreign key enforcement for %s', TABLE_NAME)
    return conn


def _sanitize_int(value: Any) -> Optional[int]:
    if value in (None, ''):
        return None
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return None


def _generate_group_code(conn: sqlite3.Connection, name: str) -> str:
    seed = (name or 'GROUP').upper()
    base = re.sub(r'[^A-Z0-9]+', '_', seed).strip('_') or 'GROUP'
    base = base[:40]
    candidate = base
    suffix = 1
    while True:
        exists = conn.execute(
            f"SELECT 1 FROM {TABLE_NAME} WHERE group_code = ?",
            (candidate,)
        ).fetchone()
        if not exists:
            return candidate
        suffix += 1
        candidate = f"{base}_{suffix}"[:60]


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}

    def _get(key: str, default: Any = None) -> Any:
        try:
            return row[key]
        except Exception:
            return default

    def _int(val: Any) -> int:
        if val is None:
            return 0
        try:
            parsed = int(val)
            return parsed if parsed >= 0 else 0
        except (TypeError, ValueError):
            return 0

    return {
        'id': row['id'],
        'group_code': row['group_code'],
        'group_name': row['group_name'],
        'wc_name': row['group_name'],
        'description': row['description'] or '',
        'wc_desc': row['description'] or '',
        'status_code': row['status_code'],
        'work_status': row['status_code'],
        'dept_code': row['dept_code'],
        'sys_dept': row['dept_code'],
        # Optional display field (when joined with org_department)
        'dept_name': _get('dept_name') or '',
        'sys_dept_name': _get('dept_name') or '',
        'member_count': _int(row['member_count']),
        'staff_count': _int(row['member_count']),
        'hw_count': _int(row['hw_count']),
        'sw_count': _int(row['sw_count']),
        'priority': _int(row['priority']),
        'work_priority': _int(row['priority']),
        'remark': row['remark'] or '',
        'note': row['remark'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'],
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'],
        'is_deleted': row['is_deleted'],
    }


def _table_has_column(conn: sqlite3.Connection, table_name: str, column_name: str) -> bool:
    try:
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    except sqlite3.DatabaseError:
        return False
    cols = {r[1] if isinstance(r, (tuple, list)) else r['name'] for r in rows}
    return column_name in cols


def _migrate_drop_division_code(conn: sqlite3.Connection) -> None:
    """Drop legacy division_code column from biz_work_group (SQLite-safe).

    SQLite does not support dropping columns directly on older versions.
    We recreate the table without division_code and copy data across.
    """
    if not _table_has_column(conn, TABLE_NAME, 'division_code'):
        return

    # Make migration resilient even if FK tables aren't present/consistent.
    try:
        conn.execute('PRAGMA foreign_keys = OFF')
    except sqlite3.DatabaseError:
        pass

    temp = f"{TABLE_NAME}__new"
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {temp} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_code TEXT NOT NULL UNIQUE,
            group_name TEXT NOT NULL,
            description TEXT,
            status_code TEXT NOT NULL,
            dept_code TEXT NOT NULL,
            member_count INTEGER DEFAULT 0,
            hw_count INTEGER DEFAULT 0,
            sw_count INTEGER DEFAULT 0,
            priority INTEGER DEFAULT 0,
            remark TEXT,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL,
            updated_at TEXT,
            updated_by TEXT,
            is_deleted INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (status_code) REFERENCES biz_work_status(status_code),
            FOREIGN KEY (dept_code) REFERENCES org_department(dept_code)
        )
        """
    )

    # Copy across columns that still exist.
    conn.execute(
        f"""
        INSERT INTO {temp}
            (id, group_code, group_name, description, status_code, dept_code, member_count, hw_count, sw_count,
             priority, remark, created_at, created_by, updated_at, updated_by, is_deleted)
        SELECT
            id, group_code, group_name, description, status_code, dept_code, member_count, hw_count, sw_count,
            priority, remark, created_at, created_by, updated_at, updated_by, is_deleted
        FROM {TABLE_NAME}
        """
    )

    conn.execute(f"DROP TABLE {TABLE_NAME}")
    conn.execute(f"ALTER TABLE {temp} RENAME TO {TABLE_NAME}")

    try:
        conn.execute('PRAGMA foreign_keys = ON')
    except sqlite3.DatabaseError:
        pass


def init_work_group_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            # In some environments (notably test bootstraps), parent tables like
            # biz_work_status/org_department may not exist yet. Temporarily disable
            # FK enforcement so we can create our tables without failing early.
            try:
                conn.execute('PRAGMA foreign_keys = OFF')
            except sqlite3.DatabaseError:
                pass

            # Drop legacy division_code column if present.
            _migrate_drop_division_code(conn)

            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    group_code TEXT NOT NULL UNIQUE,
                    group_name TEXT NOT NULL,
                    description TEXT,
                    status_code TEXT NOT NULL,
                    dept_code TEXT NOT NULL,
                    member_count INTEGER DEFAULT 0,
                    hw_count INTEGER DEFAULT 0,
                    sw_count INTEGER DEFAULT 0,
                    priority INTEGER DEFAULT 0,
                    remark TEXT,
                    created_at TEXT NOT NULL,
                    created_by TEXT NOT NULL,
                    updated_at TEXT,
                    updated_by TEXT,
                    is_deleted INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (status_code) REFERENCES biz_work_status(status_code),
                    FOREIGN KEY (dept_code) REFERENCES org_department(dept_code)
                )
                """
            )

            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {CHANGE_LOG_TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    group_code TEXT NOT NULL,
                    changed_at TEXT NOT NULL,
                    change_type TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    tab TEXT,
                    message TEXT
                )
                """
            )

            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {MANAGER_TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    group_id INTEGER NOT NULL,
                    department_id INTEGER,
                    user_id INTEGER,
                    org TEXT,
                    name TEXT,
                    role TEXT,
                    phone TEXT,
                    email TEXT,
                    remark TEXT,
                    is_primary INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    created_by_user_id INTEGER,
                    updated_at TEXT,
                    updated_by_user_id INTEGER,
                    is_deleted INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (group_id) REFERENCES {TABLE_NAME}(id) ON DELETE CASCADE
                )
                """
            )
            # ------ migration: add org / name / is_primary columns if missing ------
            try:
                cols = [c[1] for c in conn.execute(f"PRAGMA table_info({MANAGER_TABLE_NAME})").fetchall()]
                for col, coldef in [('org', 'TEXT'), ('name', 'TEXT'), ('is_primary', 'INTEGER NOT NULL DEFAULT 0')]:
                    if col not in cols:
                        conn.execute(f"ALTER TABLE {MANAGER_TABLE_NAME} ADD COLUMN {col} {coldef}")
                        logger.info('Added %s column to %s', col, MANAGER_TABLE_NAME)
            except Exception as _mig_err:
                logger.warning('column migration skipped for %s: %s', MANAGER_TABLE_NAME, _mig_err)
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{CHANGE_LOG_TABLE_NAME}_group_code ON {CHANGE_LOG_TABLE_NAME}(group_code)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{CHANGE_LOG_TABLE_NAME}_changed_at ON {CHANGE_LOG_TABLE_NAME}(changed_at)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_code ON {TABLE_NAME}(group_code)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_status ON {TABLE_NAME}(status_code)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_dept ON {TABLE_NAME}(dept_code)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_is_deleted ON {TABLE_NAME}(is_deleted)"
            )

            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{MANAGER_TABLE_NAME}_group_id ON {MANAGER_TABLE_NAME}(group_id)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{MANAGER_TABLE_NAME}_is_deleted ON {MANAGER_TABLE_NAME}(is_deleted)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{MANAGER_TABLE_NAME}_user_id ON {MANAGER_TABLE_NAME}(user_id)"
            )

            # Re-enable FK enforcement for subsequent operations.
            try:
                conn.execute('PRAGMA foreign_keys = ON')
            except sqlite3.DatabaseError:
                pass

            # Work group systems (tab71-system)
            # NOTE: Requested table name is literally "system".
            # Keep it sqlite-friendly and scoped by group_id.
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {SYSTEM_TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    group_id INTEGER NOT NULL,

                    work_type_name TEXT,
                    work_category_name TEXT,
                    work_status_name TEXT,
                    work_operation_name TEXT,
                    work_group_name TEXT,
                    work_name TEXT,

                    system_name TEXT,
                    system_ip TEXT,
                    mgmt_ip TEXT,
                    manufacturer_name TEXT,
                    server_model_name TEXT,
                    serial_no TEXT,
                    virtualization_type TEXT,
                    system_location TEXT,
                    cpu_size TEXT,
                    memory_size TEXT,
                    os_type TEXT,
                    os_vendor TEXT,
                    os_version TEXT,

                    remark TEXT,

                    created_at TEXT NOT NULL,
                    created_by_user_id INTEGER,
                    updated_at TEXT,
                    updated_by_user_id INTEGER,
                    is_deleted INTEGER NOT NULL DEFAULT 0,

                    FOREIGN KEY (group_id) REFERENCES {TABLE_NAME}(id) ON DELETE CASCADE
                )
                """
            )

            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{SYSTEM_TABLE_NAME}_group_id ON {SYSTEM_TABLE_NAME}(group_id)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{SYSTEM_TABLE_NAME}_is_deleted ON {SYSTEM_TABLE_NAME}(is_deleted)"
            )

            # Prevent duplicate active manager mappings within the same group.
            # Use a partial unique index so soft-deleted rows don't block re-adding.
            try:
                conn.execute(
                    f"""
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_{MANAGER_TABLE_NAME}_uniq_active_group_user
                    ON {MANAGER_TABLE_NAME}(group_id, user_id)
                    WHERE (is_deleted = 0 OR is_deleted IS NULL) AND user_id IS NOT NULL
                    """
                )
            except Exception:
                # If existing data violates uniqueness, do not block app startup.
                # The service-layer validation below will still prevent new duplicates.
                logger.warning('Could not create unique index for %s (existing duplicates?)', MANAGER_TABLE_NAME)

            # Work group services (tab47-service)
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {SERVICE_TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    group_id INTEGER NOT NULL,

                    service_name TEXT,
                    service_department TEXT,
                    service_system TEXT,
                    service_domain TEXT,
                    confidential TEXT DEFAULT 'X',
                    sensitive TEXT DEFAULT 'X',
                    open_level TEXT DEFAULT 'X',
                    install_area TEXT,
                    dmz TEXT DEFAULT 'X',
                    network_separation TEXT,
                    external_link TEXT,
                    bcp_target TEXT DEFAULT 'X',
                    impact_level TEXT,

                    remark TEXT,

                    created_at TEXT NOT NULL,
                    created_by_user_id INTEGER,
                    updated_at TEXT,
                    updated_by_user_id INTEGER,
                    is_deleted INTEGER NOT NULL DEFAULT 0,

                    FOREIGN KEY (group_id) REFERENCES {TABLE_NAME}(id) ON DELETE CASCADE
                )
                """
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{SERVICE_TABLE_NAME}_group_id ON {SERVICE_TABLE_NAME}(group_id)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{SERVICE_TABLE_NAME}_is_deleted ON {SERVICE_TABLE_NAME}(is_deleted)"
            )
            # ------ migration: add service_description column if missing ------
            try:
                svc_cols = [c[1] for c in conn.execute(f"PRAGMA table_info({SERVICE_TABLE_NAME})").fetchall()]
                if 'service_description' not in svc_cols:
                    conn.execute(f"ALTER TABLE {SERVICE_TABLE_NAME} ADD COLUMN service_description TEXT")
                    logger.info('Added service_description column to %s', SERVICE_TABLE_NAME)
            except Exception as _svc_mig_err:
                logger.warning('column migration skipped for %s: %s', SERVICE_TABLE_NAME, _svc_mig_err)

            conn.commit()
            logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def _system_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}

    def _t(val: Any) -> str:
        return ('' if val is None else str(val)).strip()

    def _dash(val: Any) -> str:
        txt = _t(val)
        return txt if txt else '-'

    return {
        'id': row['id'],
        'group_id': row['group_id'],
        'work_type_name': _dash(row['work_type_name']),
        'work_category_name': _dash(row['work_category_name']),
        'work_status_name': _dash(row['work_status_name']),
        'work_operation_name': _dash(row['work_operation_name']),
        'work_group_name': _dash(row['work_group_name']),
        'work_name': _dash(row['work_name']),
        'system_name': _dash(row['system_name']),
        'system_ip': _dash(row['system_ip']),
        'mgmt_ip': _dash(row['mgmt_ip']),
        'manufacturer_name': _dash(row['manufacturer_name']),
        'server_model_name': _dash(row['server_model_name']),
        'serial_no': _dash(row['serial_no']),
        'virtualization_type': _dash(row['virtualization_type']),
        'system_location': _dash(row['system_location']),
        'cpu_size': _dash(row['cpu_size']),
        'memory_size': _dash(row['memory_size']),
        'os_type': _dash(row['os_type']),
        'os_vendor': _dash(row['os_vendor']),
        'os_version': _dash(row['os_version']),
        'remark': _dash(row['remark']),
        'created_at': row['created_at'],
        'created_by_user_id': row['created_by_user_id'],
        'updated_at': row['updated_at'],
        'updated_by_user_id': row['updated_by_user_id'],
        'is_deleted': row['is_deleted'],
    }


def list_work_group_systems(
    group_id: int,
    app=None,
    *,
    include_deleted: bool = False,
) -> List[Dict[str, Any]]:
    """업무 그룹에 속한 시스템 목록을 hardware_asset + 관련 테이블 JOIN 으로 조회."""
    _CATEGORY_KR = {
        'SERVER': '서버', 'STORAGE': '스토리지', 'SAN': 'SAN',
        'NETWORK': '네트워크', 'SECURITY': '보안장비',
    }
    _TYPE_KR = {
        'ON_PREMISE': '온프레미스', 'CLOUD': '클라우드', 'FRAME': '프레임',
        'WORKSTATION': '워크스테이션', 'STORAGE': '스토리지', 'BACKUP': '백업장치',
        'DIRECTOR': 'SAN 디렉터', 'SWITCH': 'SAN 스위치',
        'L2': 'L2', 'L3': 'L3', 'L4': 'L4', 'L7': 'L7',
        'CIRCUIT': '회선장비', 'AP': '무선장비',
        'FIREWALL': '방화벽', 'VPN': 'VPN', 'IDS': 'IDS', 'IPS': 'IPS',
        'HSM': 'HSM', 'KMS': 'KMS', 'WIPS': 'WIPS', 'ETC': '기타',
    }

    app = app or current_app
    gid = _coerce_positive_int(group_id)
    if not gid:
        return []
    with _get_connection(app) as conn:
        # 1) biz_work_group 에서 group_code 조회
        grp = conn.execute(
            "SELECT group_code FROM biz_work_group WHERE id = ?", (gid,)
        ).fetchone()
        if not grp:
            return []
        group_code = grp['group_code']

        deleted_clause = "" if include_deleted else "AND (ha.is_deleted = 0 OR ha.is_deleted IS NULL)"
        rows = conn.execute(
            f"""
            SELECT
                ha.id,
                COALESCE(ha.asset_category, '-')        AS asset_category,
                COALESCE(ha.asset_type, '-')            AS asset_type,
                COALESCE(bws.status_name, ha.work_status_code, '-') AS work_status_name,
                COALESCE(bws.status_level, '') AS work_status_level,
                COALESCE(bwo.operation_name, ha.work_operation_code, '-') AS work_operation_name,
                COALESCE(ha.work_name, '-')             AS work_name,
                COALESCE(ha.system_name, '-')           AS system_name,
                COALESCE(ha.system_ip, '-')             AS system_ip,
                COALESCE(ha.virtualization_type, '-')   AS virtualization_type,
                COALESCE(bvm.manufacturer_name, ha.manufacturer_code, '-') AS manufacturer_name,
                COALESCE(hst.model_name, ha.server_code, '-') AS server_model_name,
                COALESCE(ss_os.name, '-')               AS os_type,
                COALESCE(shc_cpu.active_capacity, '-')  AS cpu_size,
                COALESCE(shc_mem.active_capacity, '-')  AS memory_size
            FROM hardware_asset ha
            LEFT JOIN biz_work_status bws
                ON bws.status_code = ha.work_status_code
               AND (bws.is_deleted = 0 OR bws.is_deleted IS NULL)
            LEFT JOIN biz_work_operation bwo
                ON bwo.operation_code = ha.work_operation_code
            LEFT JOIN biz_vendor_manufacturer bvm
                ON bvm.manufacturer_code = ha.manufacturer_code
            LEFT JOIN hw_server_type hst
                ON hst.server_code = ha.server_code
            LEFT JOIN server_software ss_os
                ON ss_os.hardware_id = ha.id AND ss_os.type = '운영체제'
            LEFT JOIN server_hw_component shc_cpu
                ON shc_cpu.hardware_id = ha.id AND shc_cpu.type = 'CPU'
            LEFT JOIN server_hw_component shc_mem
                ON shc_mem.hardware_id = ha.id AND shc_mem.type = 'MEMORY'
            WHERE ha.work_group_code = ?
              {deleted_clause}
            ORDER BY ha.id ASC
            """,
            (group_code,),
        ).fetchall()

        def _to_dict(r):
            cat_raw = r['asset_category']
            type_raw = r['asset_type']
            return {
                'id': r['id'],
                'asset_category_name': _CATEGORY_KR.get(cat_raw, cat_raw) if cat_raw != '-' else '-',
                'asset_type_name': _TYPE_KR.get(type_raw, type_raw) if type_raw != '-' else '-',
                'work_status_name': r['work_status_name'],
                'work_status_level': r['work_status_level'],
                'work_operation_name': r['work_operation_name'],
                'work_name': r['work_name'],
                'system_name': r['system_name'],
                'system_ip': r['system_ip'],
                'virtualization_type': r['virtualization_type'],
                'manufacturer_name': r['manufacturer_name'],
                'server_model_name': r['server_model_name'],
                'os_type': r['os_type'],
                'cpu_size': r['cpu_size'],
                'memory_size': r['memory_size'],
            }
        return [_to_dict(r) for r in rows]


def create_work_group_system(
    group_id: int,
    payload: Dict[str, Any],
    actor_user_id: Optional[int],
    app=None,
) -> Dict[str, Any]:
    app = app or current_app
    gid = _coerce_positive_int(group_id)
    if not gid:
        raise ValueError('대상을 찾을 수 없습니다.')

    def _v(key: str) -> Optional[str]:
        raw = payload.get(key)
        token = ('' if raw is None else str(raw)).strip()
        return token or None

    now = _now()
    with _get_connection(app) as conn:
        exists = conn.execute(f"SELECT 1 FROM {TABLE_NAME} WHERE id = ? AND (is_deleted = 0 OR is_deleted IS NULL)", (gid,)).fetchone()
        if not exists:
            raise ValueError('대상을 찾을 수 없습니다.')

        conn.execute(
            f"""
            INSERT INTO {SYSTEM_TABLE_NAME} (
                group_id,
                work_type_name, work_category_name, work_status_name, work_operation_name,
                work_group_name, work_name,
                system_name, system_ip, mgmt_ip,
                manufacturer_name, server_model_name, serial_no,
                virtualization_type, system_location,
                cpu_size, memory_size,
                os_type, os_vendor, os_version,
                remark,
                created_at, created_by_user_id, updated_at, updated_by_user_id, is_deleted
            ) VALUES (
                ?,
                ?, ?, ?, ?,
                ?, ?,
                ?, ?, ?,
                ?, ?, ?,
                ?, ?,
                ?, ?,
                ?, ?, ?,
                ?,
                ?, ?, ?, ?, 0
            )
            """,
            (
                gid,
                _v('work_type_name'),
                _v('work_category_name'),
                _v('work_status_name'),
                _v('work_operation_name'),
                _v('work_group_name'),
                _v('work_name'),
                _v('system_name'),
                _v('system_ip'),
                _v('mgmt_ip'),
                _v('manufacturer_name'),
                _v('server_model_name'),
                _v('serial_no'),
                _v('virtualization_type'),
                _v('system_location'),
                _v('cpu_size'),
                _v('memory_size'),
                _v('os_type'),
                _v('os_vendor'),
                _v('os_version'),
                _v('remark'),
                now,
                actor_user_id,
                now,
                actor_user_id,
            ),
        )
        new_id = conn.execute('SELECT last_insert_rowid() AS id').fetchone()['id']
        row = conn.execute(
            f"""
            SELECT
                id, group_id,
                work_type_name, work_category_name, work_status_name, work_operation_name,
                work_group_name, work_name,
                system_name, system_ip, mgmt_ip,
                manufacturer_name, server_model_name, serial_no,
                virtualization_type, system_location,
                cpu_size, memory_size,
                os_type, os_vendor, os_version,
                remark,
                created_at, created_by_user_id, updated_at, updated_by_user_id, is_deleted
            FROM {SYSTEM_TABLE_NAME}
            WHERE id = ?
            """,
            (new_id,),
        ).fetchone()
        conn.commit()
        return _system_row_to_dict(row)


def update_work_group_system(
    group_id: int,
    system_id: int,
    payload: Dict[str, Any],
    actor_user_id: Optional[int],
    app=None,
) -> Optional[Dict[str, Any]]:
    app = app or current_app
    gid = _coerce_positive_int(group_id)
    sid = _coerce_positive_int(system_id)
    if not gid or not sid:
        return None

    allowed = (
        'work_type_name',
        'work_category_name',
        'work_status_name',
        'work_operation_name',
        'work_group_name',
        'work_name',
        'system_name',
        'system_ip',
        'mgmt_ip',
        'manufacturer_name',
        'server_model_name',
        'serial_no',
        'virtualization_type',
        'system_location',
        'cpu_size',
        'memory_size',
        'os_type',
        'os_vendor',
        'os_version',
        'remark',
    )

    fields: List[str] = []
    values: List[Any] = []
    for key in allowed:
        if key in payload:
            raw = payload.get(key)
            token = ('' if raw is None else str(raw)).strip()
            fields.append(f"{key} = ?")
            values.append(token or None)

    if not fields:
        return get_work_group_system(group_id, system_id, app=app)

    now = _now()
    fields.append('updated_at = ?')
    values.append(now)
    fields.append('updated_by_user_id = ?')
    values.append(actor_user_id)
    values.extend([gid, sid])

    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {SYSTEM_TABLE_NAME} SET {', '.join(fields)} WHERE group_id = ? AND id = ? AND (is_deleted = 0 OR is_deleted IS NULL)",
            tuple(values),
        )
        if cur.rowcount <= 0:
            return None
        row = conn.execute(
            f"""
            SELECT
                id, group_id,
                work_type_name, work_category_name, work_status_name, work_operation_name,
                work_group_name, work_name,
                system_name, system_ip, mgmt_ip,
                manufacturer_name, server_model_name, serial_no,
                virtualization_type, system_location,
                cpu_size, memory_size,
                os_type, os_vendor, os_version,
                remark,
                created_at, created_by_user_id, updated_at, updated_by_user_id, is_deleted
            FROM {SYSTEM_TABLE_NAME}
            WHERE id = ?
            """,
            (sid,),
        ).fetchone()
        conn.commit()
        return _system_row_to_dict(row)


def get_work_group_system(
    group_id: int,
    system_id: int,
    app=None,
) -> Optional[Dict[str, Any]]:
    app = app or current_app
    gid = _coerce_positive_int(group_id)
    sid = _coerce_positive_int(system_id)
    if not gid or not sid:
        return None
    with _get_connection(app) as conn:
        row = conn.execute(
            f"""
            SELECT
                id, group_id,
                work_type_name, work_category_name, work_status_name, work_operation_name,
                work_group_name, work_name,
                system_name, system_ip, mgmt_ip,
                manufacturer_name, server_model_name, serial_no,
                virtualization_type, system_location,
                cpu_size, memory_size,
                os_type, os_vendor, os_version,
                remark,
                created_at, created_by_user_id, updated_at, updated_by_user_id, is_deleted
            FROM {SYSTEM_TABLE_NAME}
            WHERE group_id = ? AND id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
            """,
            (gid, sid),
        ).fetchone()
        return _system_row_to_dict(row) if row else None


def delete_work_group_system(
    group_id: int,
    system_id: int,
    actor_user_id: Optional[int],
    app=None,
) -> bool:
    app = app or current_app
    gid = _coerce_positive_int(group_id)
    sid = _coerce_positive_int(system_id)
    if not gid or not sid:
        return False
    now = _now()
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"""
            UPDATE {SYSTEM_TABLE_NAME}
            SET is_deleted = 1, updated_at = ?, updated_by_user_id = ?
            WHERE group_id = ? AND id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
            """,
            (now, actor_user_id, gid, sid),
        )
        conn.commit()
        return cur.rowcount > 0


def _coerce_positive_int(value: Any) -> Optional[int]:
    if value in (None, ''):
        return None
    try:
        num = int(value)
    except (TypeError, ValueError):
        return None
    return num if num > 0 else None


def _manager_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}
    d = {
        'id': row['id'],
        'group_id': row['group_id'],
        'department_id': row['department_id'],
        'user_id': row['user_id'],
        'org': row['org'] or '',
        'name': row['name'] or '',
        'role': row['role'] or '',
        'phone': row['phone'] or '',
        'email': row['email'] or '',
        'remark': row['remark'] or '',
        'created_at': row['created_at'],
        'created_by_user_id': row['created_by_user_id'],
        'updated_at': row['updated_at'],
        'updated_by_user_id': row['updated_by_user_id'],
        'is_deleted': row['is_deleted'],
    }
    try:
        d['is_primary'] = bool(row['is_primary']) if row['is_primary'] else False
    except (IndexError, KeyError):
        d['is_primary'] = False
    return d


def list_work_group_managers(
    group_id: int,
    app=None,
    *,
    include_deleted: bool = False,
) -> List[Dict[str, Any]]:
    app = app or current_app
    gid = _coerce_positive_int(group_id)
    if not gid:
        return []
    with _get_connection(app) as conn:
        where = "group_id = ?"
        params: List[Any] = [gid]
        if not include_deleted:
            where += " AND (is_deleted = 0 OR is_deleted IS NULL)"
        rows = conn.execute(
            f"SELECT * FROM {MANAGER_TABLE_NAME} WHERE {where} ORDER BY id ASC",
            tuple(params),
        ).fetchall()
        return [_manager_row_to_dict(r) for r in rows]


def create_work_group_manager(
    group_id: int,
    payload: Dict[str, Any],
    actor_user_id: Optional[int],
    app=None,
) -> Dict[str, Any]:
    app = app or current_app
    gid = _coerce_positive_int(group_id)
    if not gid:
        raise ValueError('대상을 찾을 수 없습니다.')

    org = (payload.get('org') or '').strip() or None
    name = (payload.get('name') or '').strip() or None
    role = (payload.get('role') or '').strip() or None
    phone = (payload.get('phone') or '').strip() or None
    email = (payload.get('email') or '').strip() or None
    remark = (payload.get('remark') or '').strip() or None
    is_primary = 1 if payload.get('is_primary') else 0
    department_id = _coerce_positive_int(payload.get('department_id'))
    user_id = _coerce_positive_int(payload.get('user_id'))

    now = _now()
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"""
            INSERT INTO {MANAGER_TABLE_NAME}
              (group_id, department_id, user_id, org, name, role, phone, email, remark, is_primary,
               created_at, created_by_user_id, updated_at, updated_by_user_id, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (gid, department_id, user_id, org, name, role, phone, email, remark, is_primary,
             now, actor_user_id, now, actor_user_id),
        )
        conn.commit()
        new_id = int(cur.lastrowid)
        row = conn.execute(
            f"SELECT * FROM {MANAGER_TABLE_NAME} WHERE id = ?",
            (new_id,),
        ).fetchone()
        return _manager_row_to_dict(row)


def update_work_group_manager(
    group_id: int,
    manager_id: int,
    payload: Dict[str, Any],
    actor_user_id: Optional[int],
    app=None,
) -> Optional[Dict[str, Any]]:
    app = app or current_app
    gid = _coerce_positive_int(group_id)
    mid = _coerce_positive_int(manager_id)
    if not gid or not mid:
        return None

    fields: List[str] = []
    values: List[Any] = []
    for key in ('org', 'name', 'role', 'phone', 'email', 'remark'):
        if key not in payload:
            continue
        val = payload.get(key)
        if val is None:
            cleaned = None
        else:
            cleaned = str(val).strip() or None
        fields.append(f"{key} = ?")
        values.append(cleaned)
    for key in ('department_id', 'user_id'):
        if key in payload:
            val = _coerce_positive_int(payload.get(key))
            fields.append(f"{key} = ?")
            values.append(val)
    if 'is_primary' in payload:
        fields.append('is_primary = ?')
        values.append(1 if payload['is_primary'] else 0)

    if not fields:
        return get_work_group_manager(group_id, manager_id, app=app)

    now = _now()
    fields.append('updated_at = ?')
    values.append(now)
    fields.append('updated_by_user_id = ?')
    values.append(actor_user_id)

    with _get_connection(app) as conn:
        existing = conn.execute(
            f"SELECT * FROM {MANAGER_TABLE_NAME} WHERE id = ? AND group_id = ?",
            (mid, gid),
        ).fetchone()
        if not existing or int(existing['is_deleted'] or 0) != 0:
            return None

        conn.execute(
            f"UPDATE {MANAGER_TABLE_NAME} SET {', '.join(fields)} WHERE id = ? AND group_id = ?",
            tuple(values + [mid, gid]),
        )
        conn.commit()
        row = conn.execute(
            f"SELECT * FROM {MANAGER_TABLE_NAME} WHERE id = ?",
            (mid,),
        ).fetchone()
        return _manager_row_to_dict(row)


def get_work_group_manager(
    group_id: int,
    manager_id: int,
    app=None,
) -> Optional[Dict[str, Any]]:
    app = app or current_app
    gid = _coerce_positive_int(group_id)
    mid = _coerce_positive_int(manager_id)
    if not gid or not mid:
        return None
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT * FROM {MANAGER_TABLE_NAME} WHERE group_id = ? AND id = ? AND (is_deleted = 0 OR is_deleted IS NULL)",
            (gid, mid),
        ).fetchone()
        return _manager_row_to_dict(row) if row else None


def delete_work_group_manager(
    group_id: int,
    manager_id: int,
    actor_user_id: Optional[int],
    app=None,
) -> bool:
    app = app or current_app
    gid = _coerce_positive_int(group_id)
    mid = _coerce_positive_int(manager_id)
    if not gid or not mid:
        return False
    now = _now()
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"""
            UPDATE {MANAGER_TABLE_NAME}
            SET is_deleted = 1, updated_at = ?, updated_by_user_id = ?
            WHERE group_id = ? AND id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
            """,
            (now, actor_user_id, gid, mid),
        )
        conn.commit()
        return cur.rowcount > 0


def _insert_change_log(
    conn: sqlite3.Connection,
    *,
    group_code: str,
    change_type: str,
    actor: str,
    tab: str = '기본정보',
    message: str = '',
    changed_at: Optional[str] = None,
) -> None:
    code = (group_code or '').strip()
    if not code:
        return
    when = (changed_at or _now()).strip() or _now()
    ct = (change_type or '').strip() or 'UPDATE'
    who = (actor or 'system').strip() or 'system'
    conn.execute(
        f"INSERT INTO {CHANGE_LOG_TABLE_NAME} (group_code, changed_at, change_type, actor, tab, message) VALUES (?, ?, ?, ?, ?, ?)",
        (code, when, ct, who, (tab or '').strip(), (message or '').strip()),
    )


def list_work_group_change_logs(
    group_code: str,
    app=None,
    *,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    app = app or current_app
    code = (group_code or '').strip()
    if not code:
        return []
    try:
        lim = int(limit or 200)
    except (TypeError, ValueError):
        lim = 200
    lim = max(1, min(lim, 1000))
    with _get_connection(app) as conn:
        rows = conn.execute(
            f"SELECT id, group_code, changed_at, change_type, actor, tab, message FROM {CHANGE_LOG_TABLE_NAME} WHERE group_code = ? ORDER BY id DESC LIMIT ?",
            (code, lim),
        ).fetchall()
        return [
            {
                'id': r['id'],
                'group_code': r['group_code'],
                'changed_at': r['changed_at'],
                'change_type': r['change_type'],
                'actor': r['actor'],
                'tab': r['tab'] or '',
                'message': r['message'] or '',
            }
            for r in rows
        ]


def _fetch_single(record_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"""
            SELECT
                bwg.id,
                bwg.group_code,
                bwg.group_name,
                bwg.description,
                bwg.status_code,
                bwg.dept_code,
                od.dept_name AS dept_name,
                bwg.member_count,
                bwg.hw_count,
                bwg.sw_count,
                bwg.priority,
                bwg.remark,
                bwg.created_at,
                bwg.created_by,
                bwg.updated_at,
                bwg.updated_by,
                bwg.is_deleted
            FROM {TABLE_NAME} bwg
            LEFT JOIN org_department od ON od.dept_code = bwg.dept_code
            WHERE bwg.id = ?
            """,
            (record_id,),
        ).fetchone()
        if not row:
            return None
        item = _row_to_dict(row)
        code = (item.get('group_code') or '').strip()
        if not code:
            item['hw_count'] = 0
            item['sw_count'] = 0
            return item
        hw_counts = counts_by_code(conn, asset_table='hardware', code_column='work_group_code')
        sw_counts = sw_counts_via_hardware(conn, code_column='work_group_code')
        item['hw_count'] = hw_counts.get(code, 0)
        item['sw_count'] = sw_counts.get(code, 0)
        return item


def get_work_group(group_id: int, app=None, *, include_deleted: bool = False) -> Optional[Dict[str, Any]]:
    item = _fetch_single(group_id, app)
    if not item:
        return None
    if not include_deleted and item.get('is_deleted'):
        return None
    return item


def list_work_groups(app=None, search: Optional[str] = None, include_deleted: bool = False) -> List[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        clauses = ['1=1']
        params: List[Any] = []
        if not include_deleted:
            clauses.append('bwg.is_deleted = 0')
        if search:
            like = f"%{search}%"
            clauses.append('(' + ' OR '.join([
                'bwg.group_name LIKE ?',
                'bwg.group_code LIKE ?',
                'bwg.description LIKE ?',
                'bwg.remark LIKE ?',
                'bwg.status_code LIKE ?',
                'bwg.dept_code LIKE ?',
                'od.dept_name LIKE ?'
            ]) + ')')
            params.extend([like] * 7)
        query = (
            f"""
            SELECT
                bwg.id,
                bwg.group_code,
                bwg.group_name,
                bwg.description,
                bwg.status_code,
                bwg.dept_code,
                od.dept_name AS dept_name,
                bwg.member_count,
                bwg.hw_count,
                bwg.sw_count,
                bwg.priority,
                bwg.remark,
                bwg.created_at,
                bwg.created_by,
                bwg.updated_at,
                bwg.updated_by,
                bwg.is_deleted
            FROM {TABLE_NAME} bwg
            LEFT JOIN org_department od ON od.dept_code = bwg.dept_code
            WHERE {' AND '.join(clauses)}
            ORDER BY bwg.id DESC
            """
        )
        rows = conn.execute(query, params).fetchall()
        hw_counts = counts_by_code(conn, asset_table='hardware', code_column='work_group_code')
        sw_counts = sw_counts_via_hardware(conn, code_column='work_group_code')
        out: List[Dict[str, Any]] = []
        for row in rows:
            item = _row_to_dict(row)
            code = (item.get('group_code') or '').strip()
            if code:
                item['hw_count'] = hw_counts.get(code, 0)
                item['sw_count'] = sw_counts.get(code, 0)
            else:
                item['hw_count'] = 0
                item['sw_count'] = 0
            out.append(item)
        return out


def _prepare_payload(data: Dict[str, Any], *, require_all: bool = False) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    mapped_names = {
        'group_name': ['group_name', 'wc_name'],
        'description': ['description', 'wc_desc'],
        'status_code': ['status_code', 'work_status'],
        'dept_code': ['dept_code', 'sys_dept'],
        'member_count': ['member_count', 'staff_count'],
        'hw_count': ['hw_count'],
        'sw_count': ['sw_count'],
        'priority': ['priority', 'work_priority'],
        'remark': ['remark', 'note'],
        'group_code': ['group_code']
    }
    for key, aliases in mapped_names.items():
        for alias in aliases:
            if alias in data and data.get(alias) not in (None, ''):
                payload[key] = data[alias]
                break
    if require_all:
        missing = [field for field in ('group_name', 'status_code', 'dept_code') if not payload.get(field)]
        if missing:
            raise ValueError('필수 필드가 누락되었습니다: ' + ', '.join(missing))
    if 'member_count' in payload:
        payload['member_count'] = _sanitize_int(payload['member_count']) or 0
    if 'hw_count' in payload:
        payload['hw_count'] = _sanitize_int(payload['hw_count']) or 0
    if 'sw_count' in payload:
        payload['sw_count'] = _sanitize_int(payload['sw_count']) or 0
    if 'priority' in payload:
        payload['priority'] = _sanitize_int(payload['priority']) or 0
    return payload


def _norm_text(value: Any) -> str:
    if value is None:
        return ''
    try:
        return str(value).strip()
    except Exception:
        return ''


def _ensure_work_group_fk_seed(conn: sqlite3.Connection) -> None:
    """No-op: FK seed was removed. Tables must be populated by the user."""
    pass


def _resolve_fk_codes(conn: sqlite3.Connection, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Resolve potentially name-like inputs into FK-safe codes."""
    _ensure_work_group_fk_seed(conn)

    status_in = _norm_text(payload.get('status_code'))
    dept_in = _norm_text(payload.get('dept_code'))

    if status_in:
        row = conn.execute(
            "SELECT status_code FROM biz_work_status WHERE is_deleted=0 AND (status_code = ? OR status_name = ?) LIMIT 1",
            (status_in, status_in),
        ).fetchone()
        if not row:
            raise ValueError(f"업무 상태 참조값이 존재하지 않습니다: {status_in}")
        payload['status_code'] = row['status_code']

    if dept_in:
        row = conn.execute(
            "SELECT dept_code FROM org_department WHERE is_deleted=0 AND (dept_code = ? OR dept_name = ?) LIMIT 1",
            (dept_in, dept_in),
        ).fetchone()
        if not row:
            raise ValueError(f"부서 참조값이 존재하지 않습니다: {dept_in}")
        payload['dept_code'] = row['dept_code']

    return payload


def create_work_group(data: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data, require_all=True)
    name = payload['group_name'].strip()
    if not name:
        raise ValueError('group_name is required')
    with _get_connection(app) as conn:
        payload = _resolve_fk_codes(conn, payload)
        group_code = (payload.get('group_code') or '').strip() or _generate_group_code(conn, name)
        timestamp = _now()
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME}
                (group_code, group_name, description, status_code, dept_code, member_count, hw_count, sw_count, priority, remark, created_at, created_by, updated_at, updated_by, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                group_code,
                name,
                payload.get('description'),
                payload['status_code'],
                payload['dept_code'],
                payload.get('member_count', 0),
                payload.get('hw_count', 0),
                payload.get('sw_count', 0),
                payload.get('priority', 0),
                payload.get('remark'),
                timestamp,
                actor,
                timestamp,
                actor,
            ),
        )
        new_id = int(cur.lastrowid or 0)
        _insert_change_log(
            conn,
            group_code=group_code,
            change_type='CREATE',
            actor=actor,
            tab='기본정보',
            message=f"업무 그룹 생성: {name}",
            changed_at=timestamp,
        )
        conn.commit()
    return _fetch_single(new_id, app)


def update_work_group(group_id: int, data: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = _prepare_payload(data, require_all=False)
    if not payload:
        return _fetch_single(group_id, app)
    with _get_connection(app) as conn:
        # Resolve FK-ish fields BEFORE building params so resolved codes are used.
        if any(k in payload for k in ('status_code', 'dept_code')):
            payload = _resolve_fk_codes(conn, payload)
        updates: List[str] = []
        params: List[Any] = []
        for column in (
            'group_name',
            'description',
            'status_code',
            'dept_code',
            'member_count',
            'hw_count',
            'sw_count',
            'priority',
            'remark',
            'group_code',
        ):
            if column in payload:
                value = payload[column]
                if column == 'group_name' and not value:
                    raise ValueError('group_name is required')
                updates.append(f"{column} = ?")
                params.append(value)
        if not updates:
            return _fetch_single(group_id, app)
        timestamp = _now()
        updates.extend(['updated_at = ?', 'updated_by = ?'])
        params.extend([timestamp, actor, group_id])
        existing = conn.execute(
            f"SELECT group_code, group_name FROM {TABLE_NAME} WHERE id = ? AND is_deleted = 0",
            (group_id,),
        ).fetchone()
        # If group_code is being changed, cascade to child tables.
        # Use deferred FK checks to avoid chicken-and-egg constraint ordering.
        new_code = payload.get('group_code')
        old_code = existing['group_code'] if existing else None
        changing_code = new_code and old_code and new_code != old_code
        if changing_code:
            try:
                conn.execute('PRAGMA defer_foreign_keys = ON')
            except Exception:
                pass
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(updates)} WHERE id = ? AND is_deleted = 0",
            params,
        )
        if cur.rowcount == 0:
            return None
        if changing_code:
            for child_table, child_col in (
                ('hardware', 'work_group_code'),
                ('software_asset', 'work_group_code'),
            ):
                try:
                    conn.execute(
                        f"UPDATE {child_table} SET {child_col} = ? WHERE {child_col} = ?",
                        (new_code, old_code),
                    )
                except Exception:
                    pass  # table may not exist
        if existing:
            _insert_change_log(
                conn,
                group_code=new_code or existing['group_code'],
                change_type='UPDATE',
                actor=actor,
                tab='기본정보',
                message=f"업무 그룹 수정: {existing['group_name']}",
                changed_at=timestamp,
            )
        conn.commit()
    return _fetch_single(group_id, app)


def soft_delete_work_groups(ids: Sequence[Any], actor: str, app=None) -> int:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    safe_ids = [int(i) for i in ids if str(i).isdigit()]
    if not safe_ids:
        return 0
    placeholders = ','.join('?' for _ in safe_ids)
    timestamp = _now()
    with _get_connection(app) as conn:
        try:
            rows = conn.execute(
                f"SELECT id, group_code, group_name FROM {TABLE_NAME} WHERE id IN ({placeholders}) AND is_deleted = 0",
                safe_ids,
            ).fetchall()
        except Exception:
            rows = []
        cur = conn.execute(
            f"DELETE FROM {TABLE_NAME} WHERE id IN ({placeholders})",
            safe_ids,
        )
        for r in rows or []:
            try:
                _insert_change_log(
                    conn,
                    group_code=r['group_code'],
                    change_type='DELETE',
                    actor=actor,
                    tab='기본정보',
                    message=f"업무 그룹 삭제: {r['group_name']}",
                    changed_at=timestamp,
                )
            except Exception:
                continue
        conn.commit()
        return cur.rowcount


# ---------------------------------------------------------------------------
# Service (tab47) CRUD
# ---------------------------------------------------------------------------

_SERVICE_COLS = (
    'service_name', 'service_description', 'service_department', 'service_system', 'service_domain',
    'confidential', 'sensitive', 'open_level',
    'install_area', 'dmz', 'network_separation',
    'external_link', 'bcp_target', 'impact_level', 'remark',
)


def _service_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}

    def _dash(val: Any) -> str:
        txt = ('' if val is None else str(val)).strip()
        return txt if txt else '-'

    return {
        'id': row['id'],
        'group_id': row['group_id'],
        'service_name': _dash(row['service_name']),
        'service_description': _dash(row['service_description']),
        'service_department': _dash(row['service_department']),
        'service_system': _dash(row['service_system']),
        'service_domain': _dash(row['service_domain']),
        'confidential': _dash(row['confidential']),
        'sensitive': _dash(row['sensitive']),
        'open_level': _dash(row['open_level']),
        'install_area': _dash(row['install_area']),
        'dmz': _dash(row['dmz']),
        'network_separation': _dash(row['network_separation']),
        'external_link': _dash(row['external_link']),
        'bcp_target': _dash(row['bcp_target']),
        'impact_level': _dash(row['impact_level']),
        'remark': _dash(row['remark']),
        'created_at': row['created_at'],
        'created_by_user_id': row['created_by_user_id'],
        'updated_at': row['updated_at'],
        'updated_by_user_id': row['updated_by_user_id'],
        'is_deleted': row['is_deleted'],
    }


def _service_select_sql() -> str:
    return f"""
        SELECT id, group_id,
               service_name, service_description, service_department, service_system, service_domain,
               confidential, sensitive, open_level,
               install_area, dmz, network_separation,
               external_link, bcp_target, impact_level, remark,
               created_at, created_by_user_id, updated_at, updated_by_user_id, is_deleted
        FROM {SERVICE_TABLE_NAME}
    """


def list_work_group_services(
    group_id: int,
    app=None,
    *,
    include_deleted: bool = False,
) -> List[Dict[str, Any]]:
    app = app or current_app
    gid = _coerce_positive_int(group_id)
    if not gid:
        return []
    where = "group_id = ?" + ("" if include_deleted else " AND (is_deleted = 0 OR is_deleted IS NULL)")
    with _get_connection(app) as conn:
        rows = conn.execute(
            _service_select_sql() + f" WHERE {where} ORDER BY id ASC",
            (gid,),
        ).fetchall()
        return [_service_row_to_dict(r) for r in rows]


def get_work_group_service(
    group_id: int,
    service_id: int,
    app=None,
) -> Optional[Dict[str, Any]]:
    app = app or current_app
    gid = _coerce_positive_int(group_id)
    sid = _coerce_positive_int(service_id)
    if not gid or not sid:
        return None
    with _get_connection(app) as conn:
        row = conn.execute(
            _service_select_sql() + " WHERE group_id = ? AND id = ? AND (is_deleted = 0 OR is_deleted IS NULL)",
            (gid, sid),
        ).fetchone()
        return _service_row_to_dict(row) if row else None


def create_work_group_service(
    group_id: int,
    payload: Dict[str, Any],
    actor_user_id: Optional[int],
    app=None,
) -> Dict[str, Any]:
    app = app or current_app
    gid = _coerce_positive_int(group_id)
    if not gid:
        raise ValueError('대상을 찾을 수 없습니다.')

    def _v(key: str) -> Optional[str]:
        raw = payload.get(key)
        token = ('' if raw is None else str(raw)).strip()
        return token or None

    now = _now()
    with _get_connection(app) as conn:
        exists = conn.execute(
            f"SELECT 1 FROM {TABLE_NAME} WHERE id = ? AND (is_deleted = 0 OR is_deleted IS NULL)",
            (gid,),
        ).fetchone()
        if not exists:
            raise ValueError('대상을 찾을 수 없습니다.')

        col_names = ', '.join(_SERVICE_COLS)
        placeholders = ', '.join('?' for _ in _SERVICE_COLS)
        conn.execute(
            f"""
            INSERT INTO {SERVICE_TABLE_NAME} (
                group_id, {col_names},
                created_at, created_by_user_id, updated_at, updated_by_user_id, is_deleted
            ) VALUES (
                ?, {placeholders},
                ?, ?, ?, ?, 0
            )
            """,
            (
                gid,
                *(_v(c) for c in _SERVICE_COLS),
                now, actor_user_id, now, actor_user_id,
            ),
        )
        new_id = conn.execute('SELECT last_insert_rowid() AS id').fetchone()['id']
        row = conn.execute(
            _service_select_sql() + " WHERE id = ?",
            (new_id,),
        ).fetchone()
        conn.commit()
        return _service_row_to_dict(row)


def update_work_group_service(
    group_id: int,
    service_id: int,
    payload: Dict[str, Any],
    actor_user_id: Optional[int],
    app=None,
) -> Optional[Dict[str, Any]]:
    app = app or current_app
    gid = _coerce_positive_int(group_id)
    sid = _coerce_positive_int(service_id)
    if not gid or not sid:
        return None

    fields: List[str] = []
    values: List[Any] = []
    for key in _SERVICE_COLS:
        if key in payload:
            raw = payload.get(key)
            token = ('' if raw is None else str(raw)).strip()
            fields.append(f"{key} = ?")
            values.append(token or None)

    if not fields:
        return get_work_group_service(group_id, service_id, app=app)

    now = _now()
    fields.append('updated_at = ?')
    values.append(now)
    fields.append('updated_by_user_id = ?')
    values.append(actor_user_id)
    values.extend([gid, sid])

    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {SERVICE_TABLE_NAME} SET {', '.join(fields)} WHERE group_id = ? AND id = ? AND (is_deleted = 0 OR is_deleted IS NULL)",
            tuple(values),
        )
        if cur.rowcount <= 0:
            return None
        row = conn.execute(
            _service_select_sql() + " WHERE id = ?",
            (sid,),
        ).fetchone()
        conn.commit()
        return _service_row_to_dict(row)


def delete_work_group_service(
    group_id: int,
    service_id: int,
    actor_user_id: Optional[int],
    app=None,
) -> bool:
    app = app or current_app
    gid = _coerce_positive_int(group_id)
    sid = _coerce_positive_int(service_id)
    if not gid or not sid:
        return False
    now = _now()
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"""
            UPDATE {SERVICE_TABLE_NAME}
            SET is_deleted = 1, updated_at = ?, updated_by_user_id = ?
            WHERE group_id = ? AND id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
            """,
            (now, actor_user_id, gid, sid),
        )
        conn.commit()
        return cur.rowcount > 0
