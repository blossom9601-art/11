import json
import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

from app.services import hardware_asset_service

logger = logging.getLogger(__name__)

TABLE_GROUP = 'tab32_assign_group'
TABLE_HOST = 'tab32_assign_group_host'
TABLE_VOLUME = 'tab32_assign_group_volume'
TABLE_REPL = 'tab32_assign_group_replication'

DEFAULT_PAGE_SIZE = 200
MAX_PAGE_SIZE = 2000


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


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

    # sqlite:///file.db -> path='/file.db' (single leading / = relative)
    # sqlite:////abs.db  -> path='//abs.db' (double leading / = absolute)
    if path.startswith('/') and not path.startswith('//'):
        path = path.lstrip('/')

    if os.path.isabs(path):
        return os.path.abspath(path)

    # Keep relative SQLite filenames aligned with Flask-SQLAlchemy, which resolves
    # "sqlite:///filename.db" under instance_path.
    relative = path.lstrip('/')
    instance_candidate = os.path.abspath(os.path.join(app.instance_path, relative))
    project_candidate = os.path.abspath(os.path.join(_project_root(app), relative))
    if os.path.exists(instance_candidate):
        return instance_candidate
    if os.path.exists(project_candidate):
        return project_candidate
    return instance_candidate


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    try:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
            (table_name,),
        ).fetchone()
        return row is not None
    except Exception:
        return False


def _table_rowcount(conn: sqlite3.Connection, table_name: str) -> int:
    try:
        if not _table_exists(conn, table_name):
            return 0
        row = conn.execute(f"SELECT COUNT(1) FROM {table_name}").fetchone()
        return int(row[0] or 0) if row else 0
    except Exception:
        return 0


def _maybe_migrate_legacy_project_db(app=None) -> None:
    """Migrate Tab32 tables from legacy project-root DB into instance DB.

    Older iterations resolved relative sqlite paths under the project root.
    Flask-SQLAlchemy resolves them under instance_path. If the app already has
    Tab32 data in the project DB but the instance DB is empty, copy it over.

    This is best-effort and idempotent (uses INSERT OR IGNORE).
    """

    app = app or current_app

    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not (uri or '').startswith('sqlite'):
        return

    parsed = urlparse(uri)
    path = parsed.path or ''
    if path in (':memory:', '/:memory:'):
        return

    # Only handle the common relative-filename case (sqlite:///dev_blossom.db)
    relative = path.lstrip('/')
    if not relative or os.path.isabs(relative):
        return

    target = os.path.abspath(os.path.join(app.instance_path, relative))
    source = os.path.abspath(os.path.join(_project_root(app), relative))
    if target == source:
        return
    if not os.path.exists(source):
        return

    try:
        with sqlite3.connect(source) as src:
            src.row_factory = sqlite3.Row
            src.execute('PRAGMA foreign_keys = ON')
            src_group_count = _table_rowcount(src, TABLE_GROUP)
            if src_group_count <= 0:
                return

        with sqlite3.connect(target) as dst:
            dst.row_factory = sqlite3.Row
            try:
                dst.execute('PRAGMA foreign_keys = ON')
            except Exception:
                pass
            dst_group_count = _table_rowcount(dst, TABLE_GROUP)
            if dst_group_count > 0:
                return
    except Exception:
        return

    try:
        with sqlite3.connect(source) as src, sqlite3.connect(target) as dst:
            src.row_factory = sqlite3.Row
            dst.row_factory = sqlite3.Row
            try:
                dst.execute('PRAGMA foreign_keys = ON')
            except Exception:
                pass
            try:
                src.execute('PRAGMA foreign_keys = ON')
            except Exception:
                pass

            def _table_columns(conn: sqlite3.Connection, table: str) -> List[str]:
                try:
                    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
                    return [r[1] for r in rows if r and len(r) > 1]
                except Exception:
                    return []

            def _copy_table(table: str, columns: List[str]) -> None:
                if not _table_exists(src, table):
                    return
                if not _table_exists(dst, table):
                    return

                src_cols = set(_table_columns(src, table))
                dst_cols = set(_table_columns(dst, table))
                effective_cols = [c for c in columns if c in src_cols and c in dst_cols]
                if not effective_cols:
                    return
                rows = src.execute(
                    f"SELECT {', '.join(effective_cols)} FROM {table} ORDER BY id ASC"
                ).fetchall()
                if not rows:
                    return
                placeholders = ','.join(['?'] * len(effective_cols))
                dst.executemany(
                    f"INSERT OR IGNORE INTO {table} ({', '.join(effective_cols)}) VALUES ({placeholders})",
                    [tuple(r[c] for c in effective_cols) for r in rows],
                )

            _copy_table(
                TABLE_GROUP,
                [
                    'id', 'scope_key', 'asset_id', 'group_name', 'assigned_capacity', 'group_desc', 'remark',
                    'created_at', 'created_by', 'updated_at', 'updated_by',
                ],
            )
            _copy_table(
                TABLE_HOST,
                [
                    'id', 'group_id', 'system_name', 'os_type', 'wwid_ip', 'port_alloc',
                    'created_at', 'created_by', 'updated_at', 'updated_by',
                ],
            )
            _copy_table(
                TABLE_VOLUME,
                [
                    'id', 'group_id', 'volume_name', 'uuid', 'capacity', 'thin_thick',
                    'shared_yn', 'replicated_yn', 'assigned_date',
                    'created_at', 'created_by', 'updated_at', 'updated_by',
                ],
            )
            _copy_table(
                TABLE_REPL,
                [
                    'id', 'group_id', 'local_volume_name', 'repl_storage', 'repl_volume_name',
                    'capacity', 'created_at', 'created_by', 'updated_at', 'updated_by',
                ],
            )
            dst.commit()
    except Exception as exc:
        try:
            logger.warning('tab32 legacy DB migration failed: %s', exc)
        except Exception:
            pass


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
    except Exception:
        pass
    return conn


def init_tab32_assign_group_tables(app=None) -> None:
    app = app or current_app
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {TABLE_GROUP} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scope_key TEXT NOT NULL,
                asset_id INTEGER NOT NULL,
                group_name TEXT NOT NULL,
                assigned_capacity TEXT,
                group_desc TEXT,
                remark TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT,
                updated_at TEXT,
                updated_by TEXT
            )
            """
        )
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{TABLE_GROUP}_scope_asset ON {TABLE_GROUP}(scope_key, asset_id)"
        )

        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {TABLE_HOST} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER NOT NULL,
                work_name TEXT,
                system_name TEXT NOT NULL,
                os_type TEXT,
                host_type TEXT,
                wwid_ip TEXT,
                identifiers_json TEXT,
                auth_access TEXT,
                port_alloc TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT,
                updated_at TEXT,
                updated_by TEXT,
                FOREIGN KEY(group_id) REFERENCES {TABLE_GROUP}(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{TABLE_HOST}_group_id ON {TABLE_HOST}(group_id)"
        )

        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {TABLE_VOLUME} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER NOT NULL,
                volume_name TEXT NOT NULL,
                uuid TEXT,
                capacity TEXT,
                thin_thick TEXT,
                shared_yn TEXT,
                replicated_yn TEXT,
                assigned_date TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT,
                updated_at TEXT,
                updated_by TEXT,
                FOREIGN KEY(group_id) REFERENCES {TABLE_GROUP}(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{TABLE_VOLUME}_group_id ON {TABLE_VOLUME}(group_id)"
        )

        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {TABLE_REPL} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER NOT NULL,
                local_volume_name TEXT,
                repl_storage TEXT,
                repl_volume_name TEXT,
                capacity TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT,
                updated_at TEXT,
                updated_by TEXT,
                FOREIGN KEY(group_id) REFERENCES {TABLE_GROUP}(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{TABLE_REPL}_group_id ON {TABLE_REPL}(group_id)"
        )

        # Schema upgrade for existing DBs (SQLite has no ADD COLUMN IF NOT EXISTS).
        try:
            cols = [r[1] for r in conn.execute(f"PRAGMA table_info({TABLE_GROUP})").fetchall()]
            if 'assigned_capacity' not in cols:
                conn.execute(f"ALTER TABLE {TABLE_GROUP} ADD COLUMN assigned_capacity TEXT")
        except Exception:
            pass

        try:
            host_cols = [r[1] for r in conn.execute(f"PRAGMA table_info({TABLE_HOST})").fetchall()]
            if 'work_name' not in host_cols:
                conn.execute(f"ALTER TABLE {TABLE_HOST} ADD COLUMN work_name TEXT")
            if 'host_type' not in host_cols:
                conn.execute(f"ALTER TABLE {TABLE_HOST} ADD COLUMN host_type TEXT")
            if 'identifiers_json' not in host_cols:
                conn.execute(f"ALTER TABLE {TABLE_HOST} ADD COLUMN identifiers_json TEXT")
            if 'auth_access' not in host_cols:
                conn.execute(f"ALTER TABLE {TABLE_HOST} ADD COLUMN auth_access TEXT")
        except Exception:
            pass

        # Replication tab (schema upgrade)
        # New UI expects: repl_storage(work_name), repl_storage_system_name, repl_method, remark
        try:
            repl_cols = [r[1] for r in conn.execute(f"PRAGMA table_info({TABLE_REPL})").fetchall()]
            if 'repl_storage_system_name' not in repl_cols:
                conn.execute(f"ALTER TABLE {TABLE_REPL} ADD COLUMN repl_storage_system_name TEXT")
            if 'repl_method' not in repl_cols:
                conn.execute(f"ALTER TABLE {TABLE_REPL} ADD COLUMN repl_method TEXT")
            if 'remark' not in repl_cols:
                conn.execute(f"ALTER TABLE {TABLE_REPL} ADD COLUMN remark TEXT")
        except Exception:
            pass

        conn.commit()

    # After tables exist, migrate any legacy project-root data into instance DB.
    try:
        _maybe_migrate_legacy_project_db(app)
    except Exception:
        pass


def _sanitize_text(value: Any, *, max_len: int = 500) -> str:
    s = ('' if value is None else str(value)).strip()
    if s == '-':
        s = ''
    if max_len and len(s) > max_len:
        s = s[:max_len]
    return s


def _sanitize_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError('정수 값이 올바르지 않습니다.') from exc


def _ensure_replication_schema(conn: sqlite3.Connection) -> None:
    """Ensure the replication table has newer columns.

    This is called at runtime (not only during init) so older DBs upgrade
    automatically when the feature is used.
    """

    try:
        cols = [r[1] for r in conn.execute(f"PRAGMA table_info({TABLE_REPL})").fetchall()]
        if 'repl_storage_system_name' not in cols:
            conn.execute(f"ALTER TABLE {TABLE_REPL} ADD COLUMN repl_storage_system_name TEXT")
        if 'repl_method' not in cols:
            conn.execute(f"ALTER TABLE {TABLE_REPL} ADD COLUMN repl_method TEXT")
        if 'remark' not in cols:
            conn.execute(f"ALTER TABLE {TABLE_REPL} ADD COLUMN remark TEXT")
    except Exception:
        # Best-effort; callers will handle missing columns gracefully.
        return


def _lookup_storage_system_name(work_name: str) -> str:
    """Return system_name for a STORAGE asset matching the work_name (best-effort)."""

    w = _sanitize_text(work_name, max_len=200)
    if not w:
        return ''
    try:
        result = hardware_asset_service.list_hardware_assets(
            search=None,
            filters={'work_name': w},
            page=1,
            page_size=20,
            asset_category='STORAGE',
            asset_type=None,
        )
        items = (result or {}).get('items') or []
        if not items:
            return ''
        for it in items:
            sys_name = (it or {}).get('system_name')
            if sys_name:
                return str(sys_name).strip()
    except Exception:
        return ''
    return ''


def _is_truthy_yn(value: Any) -> bool:
    s = ('' if value is None else str(value)).strip().lower()
    return s in ('y', 'yes', 'true', '1', 'o', 'ok')


def _row_to_group(row: sqlite3.Row, *, host_count: int = 0, volume_count: int = 0, replicated: bool = False) -> Dict[str, Any]:
    try:
        assigned_capacity = row['assigned_capacity'] or ''
    except Exception:
        assigned_capacity = ''
    return {
        'id': row['id'],
        'scope_key': row['scope_key'],
        'asset_id': row['asset_id'],
        'group_name': row['group_name'] or '',
        'assigned_capacity': assigned_capacity,
        'group_desc': row['group_desc'] or '',
        'remark': row['remark'] or '',
        'host_count': int(host_count or 0),
        'volume_count': int(volume_count or 0),
        'replicated': 'Y' if replicated else 'N',
        # Optional: derived from volumes (GB 기준). If not provided, clients may fall back.
        'volume_total_gb': None,
        'volume_total_capacity': '',
        'created_at': row['created_at'],
        'created_by': row['created_by'] or '',
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'] or '',
    }


def _format_gb_total(total_gb: Any) -> str:
    try:
        n = float(total_gb or 0)
    except Exception:
        n = 0.0
    # Match frontend: round to 2 decimals
    n = round(n, 2)
    if abs(n - round(n)) < 1e-9:
        return f"{int(round(n)):,} GB"
    s = f"{n:.2f}".rstrip('0').rstrip('.')
    if '.' in s:
        a, b = s.split('.', 1)
        try:
            a_fmt = f"{int(a):,}"
        except Exception:
            a_fmt = a
        return f"{a_fmt}.{b} GB"
    try:
        return f"{int(s):,} GB"
    except Exception:
        return f"{s} GB"


def _get_group_volume_total_gb(conn: sqlite3.Connection, group_id: int) -> float:
    row = conn.execute(
        f"""
        SELECT
            SUM(
                CASE
                    WHEN capacity IS NULL OR TRIM(COALESCE(capacity,'')) = '' THEN 0
                    ELSE CAST(capacity AS REAL)
                END
            )
        FROM {TABLE_VOLUME}
        WHERE group_id = ?
        """,
        (int(group_id),),
    ).fetchone()
    try:
        return float(row[0] or 0)
    except Exception:
        return 0.0


def _row_to_host(row: sqlite3.Row) -> Dict[str, Any]:
    def _try_get(col: str) -> str:
        try:
            return row[col] or ''
        except Exception:
            return ''

    identifiers: List[str] = []
    raw_json = _try_get('identifiers_json')
    if raw_json:
        try:
            loaded = json.loads(raw_json)
            if isinstance(loaded, list):
                identifiers = [str(x).strip() for x in loaded if str(x).strip()]
        except Exception:
            identifiers = []

    # Backward compatibility: older rows stored a single identifier in wwid_ip.
    if not identifiers:
        legacy = _try_get('wwid_ip')
        if legacy:
            identifiers = [legacy]

    return {
        'id': row['id'],
        'group_id': row['group_id'],
        'work_name': _try_get('work_name'),
        'system_name': row['system_name'] or '',
        # Host type is stored in legacy os_type column.
        'host_type': row['os_type'] or '',
        # Connection type is stored in host_type column.
        'conn_type': _try_get('host_type'),
        'identifiers': identifiers,
        'wwid_ip': row['wwid_ip'] or '',
        'port_alloc': row['port_alloc'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'] or '',
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'] or '',
    }


def suggest_tab32_host_work_systems(
    q: str,
    *,
    limit: int = 30,
    asset_types: Optional[List[str]] = None,
    app=None,
) -> List[Dict[str, Any]]:
    q = _sanitize_text(q, max_len=200)
    limit = max(1, min(int(limit or 30), 200))

    # Match both canonical codes and possible localized values.
    default_types = [
        'ON_PREMISE',
        'CLOUD',
        'WORKSTATION',
        '온프레미스',
        '클라우드',
        '워크스테이션',
    ]
    allowed_types = [
        _sanitize_text(t, max_len=50)
        for t in (asset_types if asset_types else default_types)
        if _sanitize_text(t, max_len=50)
    ]
    if not allowed_types:
        allowed_types = default_types

    with hardware_asset_service._get_connection(app) as conn:
        # NOTE: Requirement
        # - 업무 이름: hardware_asset.work_name
        # - 시스템 이름: hardware.system_name (업무 이름에 매핑된 값)
        # The legacy table name is a VIEW alias to the canonical table in most setups,
        # but we still follow the requested source-of-truth semantics here.
        where = [
            "h.is_deleted = 0",
            f"h.asset_type IN ({','.join(['?'] * len(allowed_types))})",
            "COALESCE(ha.work_name,'') <> ''",
        ]
        params: List[Any] = list(allowed_types)

        if q:
            where.append("(COALESCE(ha.work_name,'') LIKE ? OR COALESCE(h.system_name,'') LIKE ?)")
            like = f"%{q}%"
            params.extend([like, like])

        sql = f"""
            SELECT
                COALESCE(ha.work_name,'') AS work_name,
                MIN(COALESCE(h.system_name,'')) AS system_name,
                MIN(COALESCE(h.asset_type,'')) AS asset_type
            FROM {hardware_asset_service.LEGACY_TABLE_NAME} ha
            JOIN {hardware_asset_service.TABLE_NAME} h
                ON h.id = ha.id
            WHERE {' AND '.join(where)}
            GROUP BY COALESCE(ha.work_name,'')
            ORDER BY work_name ASC, system_name ASC
            LIMIT ?
        """
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
        return [
            {
                'asset_type': r['asset_type'] or '',
                'work_name': r['work_name'] or '',
                'system_name': r['system_name'] or '',
            }
            for r in rows
            if (r['work_name'] or '').strip()
        ]


def _normalize_identifiers(value: Any) -> List[str]:
    items: List[str] = []
    if value is None:
        return []
    if isinstance(value, list):
        items = [str(x) for x in value]
    else:
        raw = str(value)
        # accept newline or comma separated
        raw = raw.replace('\r\n', '\n').replace('\r', '\n')
        parts: List[str] = []
        for chunk in raw.split('\n'):
            parts.extend(chunk.split(','))
        items = parts

    out: List[str] = []
    seen = set()
    for it in items:
        s = str(it or '').strip()
        if not s:
            continue
        key = s.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
        if len(out) >= 200:
            break
    return out


def _row_to_volume(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        'id': row['id'],
        'group_id': row['group_id'],
        'volume_name': row['volume_name'] or '',
        'uuid': row['uuid'] or '',
        'capacity': row['capacity'] or '',
        'thin_thick': row['thin_thick'] or '',
        'shared': row['shared_yn'] or '',
        'replicated': row['replicated_yn'] or '',
        'assigned_date': row['assigned_date'] or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'] or '',
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'] or '',
    }


def _row_to_replication(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        'id': row['id'],
        'group_id': row['group_id'],
        'local_volume_name': row['local_volume_name'] or '',
        'repl_storage': row['repl_storage'] or '',
        'repl_storage_system_name': (row['repl_storage_system_name'] if 'repl_storage_system_name' in row.keys() else '') or '',
        'repl_volume_name': row['repl_volume_name'] or '',
        'capacity': row['capacity'] or '',
        'repl_method': (row['repl_method'] if 'repl_method' in row.keys() else '') or '',
        'remark': (row['remark'] if 'remark' in row.keys() else '') or '',
        'created_at': row['created_at'],
        'created_by': row['created_by'] or '',
        'updated_at': row['updated_at'],
        'updated_by': row['updated_by'] or '',
    }


def list_tab32_assign_groups(
    scope_key: str,
    asset_id: int,
    *,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    app=None,
) -> Dict[str, Any]:
    scope_key = _sanitize_text(scope_key, max_len=120)
    if not scope_key:
        raise ValueError('scope_key가 필요합니다.')
    asset_id = _sanitize_int(asset_id)

    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))
    offset = (page - 1) * page_size

    with _get_connection(app) as conn:
        total = conn.execute(
            f"SELECT COUNT(1) FROM {TABLE_GROUP} WHERE scope_key = ? AND asset_id = ?",
            (scope_key, asset_id),
        ).fetchone()[0]

        rows = conn.execute(
            f"""
            SELECT * FROM {TABLE_GROUP}
            WHERE scope_key = ? AND asset_id = ?
            ORDER BY id ASC
            LIMIT ? OFFSET ?
            """,
            (scope_key, asset_id, page_size, offset),
        ).fetchall()

        items: List[Dict[str, Any]] = []
        for r in rows:
            gid = int(r['id'])
            host_count = conn.execute(
                f"SELECT COUNT(1) FROM {TABLE_HOST} WHERE group_id = ?",
                (gid,),
            ).fetchone()[0]
            volume_count = conn.execute(
                f"SELECT COUNT(1) FROM {TABLE_VOLUME} WHERE group_id = ?",
                (gid,),
            ).fetchone()[0]
            total_gb = _get_group_volume_total_gb(conn, gid) if int(volume_count or 0) > 0 else 0.0
            has_repl = conn.execute(
                f"SELECT 1 FROM {TABLE_REPL} WHERE group_id = ? LIMIT 1",
                (gid,),
            ).fetchone() is not None
            if not has_repl:
                has_repl = conn.execute(
                    f"SELECT replicated_yn FROM {TABLE_VOLUME} WHERE group_id = ? AND replicated_yn IS NOT NULL LIMIT 50",
                    (gid,),
                ).fetchone() is not None
            out = _row_to_group(
                r,
                host_count=int(host_count or 0),
                volume_count=int(volume_count or 0),
                replicated=bool(has_repl),
            )
            # Provide the same value the modal's "볼륨" 탭 shows in its 합계 row.
            out['volume_total_gb'] = round(float(total_gb or 0), 2)
            out['volume_total_capacity'] = _format_gb_total(total_gb) if int(volume_count or 0) > 0 else ''
            items.append(out)

        return {
            'items': items,
            'page': page,
            'page_size': page_size,
            'total': int(total or 0),
        }


def get_tab32_assign_group(group_id: int, *, app=None) -> Dict[str, Any]:
    group_id = _sanitize_int(group_id)
    with _get_connection(app) as conn:
        row = conn.execute(f"SELECT * FROM {TABLE_GROUP} WHERE id = ?", (group_id,)).fetchone()
        if not row:
            raise ValueError('업무 그룹을 찾을 수 없습니다.')
        host_count = conn.execute(
            f"SELECT COUNT(1) FROM {TABLE_HOST} WHERE group_id = ?",
            (group_id,),
        ).fetchone()[0]
        volume_count = conn.execute(
            f"SELECT COUNT(1) FROM {TABLE_VOLUME} WHERE group_id = ?",
            (group_id,),
        ).fetchone()[0]
        total_gb = _get_group_volume_total_gb(conn, group_id) if int(volume_count or 0) > 0 else 0.0
        has_repl = conn.execute(
            f"SELECT 1 FROM {TABLE_REPL} WHERE group_id = ? LIMIT 1",
            (group_id,),
        ).fetchone() is not None
        out = _row_to_group(
            row,
            host_count=int(host_count or 0),
            volume_count=int(volume_count or 0),
            replicated=bool(has_repl),
        )
        out['volume_total_gb'] = round(float(total_gb or 0), 2)
        out['volume_total_capacity'] = _format_gb_total(total_gb) if int(volume_count or 0) > 0 else ''
        return out


def create_tab32_assign_group(payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    scope_key = _sanitize_text(payload.get('scope_key'), max_len=120)
    if not scope_key:
        raise ValueError('scope_key가 필요합니다.')
    asset_id = _sanitize_int(payload.get('asset_id'))

    group_name = _sanitize_text(payload.get('group_name'), max_len=200)
    if not group_name:
        raise ValueError('업무 그룹 이름이 필요합니다.')

    group_desc = _sanitize_text(payload.get('group_desc'), max_len=1000)
    assigned_capacity = _sanitize_text(payload.get('assigned_capacity'), max_len=120)
    remark = _sanitize_text(payload.get('remark'), max_len=1000)

    actor = (actor or 'system').strip() or 'system'

    with _get_connection(app) as conn:
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_GROUP} (
                scope_key, asset_id,
                group_name, assigned_capacity, group_desc, remark,
                created_at, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (scope_key, asset_id, group_name, assigned_capacity, group_desc, remark, _now(), actor),
        )
        gid = int(cur.lastrowid)
        row = conn.execute(f"SELECT * FROM {TABLE_GROUP} WHERE id = ?", (gid,)).fetchone()
        conn.commit()
        return _row_to_group(row, host_count=0, volume_count=0, replicated=False)


def update_tab32_assign_group(group_id: int, payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    group_id = _sanitize_int(group_id)
    group_name = _sanitize_text(payload.get('group_name'), max_len=200)
    if not group_name:
        raise ValueError('업무 그룹 이름이 필요합니다.')

    assigned_capacity = _sanitize_text(payload.get('assigned_capacity'), max_len=120)
    group_desc = _sanitize_text(payload.get('group_desc'), max_len=1000)
    remark = _sanitize_text(payload.get('remark'), max_len=1000)
    actor = (actor or 'system').strip() or 'system'

    with _get_connection(app) as conn:
        existing = conn.execute(f"SELECT * FROM {TABLE_GROUP} WHERE id = ?", (group_id,)).fetchone()
        if not existing:
            raise ValueError('업무 그룹을 찾을 수 없습니다.')
        conn.execute(
            f"""
            UPDATE {TABLE_GROUP}
            SET group_name = ?, assigned_capacity = ?, group_desc = ?, remark = ?, updated_at = ?, updated_by = ?
            WHERE id = ?
            """,
            (group_name, assigned_capacity, group_desc, remark, _now(), actor, group_id),
        )
        row = conn.execute(f"SELECT * FROM {TABLE_GROUP} WHERE id = ?", (group_id,)).fetchone()
        conn.commit()
        return get_tab32_assign_group(int(row['id']), app=app)


def delete_tab32_assign_group(group_id: int, *, app=None) -> None:
    group_id = _sanitize_int(group_id)
    with _get_connection(app) as conn:
        conn.execute(f"DELETE FROM {TABLE_HOST} WHERE group_id = ?", (group_id,))
        conn.execute(f"DELETE FROM {TABLE_VOLUME} WHERE group_id = ?", (group_id,))
        conn.execute(f"DELETE FROM {TABLE_REPL} WHERE group_id = ?", (group_id,))
        cur = conn.execute(f"DELETE FROM {TABLE_GROUP} WHERE id = ?", (group_id,))
        if cur.rowcount == 0:
            raise ValueError('업무 그룹을 찾을 수 없습니다.')
        conn.commit()


def list_tab32_group_hosts(group_id: int, *, app=None) -> List[Dict[str, Any]]:
    group_id = _sanitize_int(group_id)
    with _get_connection(app) as conn:
        rows = conn.execute(
            f"SELECT * FROM {TABLE_HOST} WHERE group_id = ? ORDER BY id ASC",
            (group_id,),
        ).fetchall()
        return [_row_to_host(r) for r in rows]


def create_tab32_group_host(group_id: int, payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    group_id = _sanitize_int(group_id)
    work_name = _sanitize_text(payload.get('work_name'), max_len=200)
    system_name = _sanitize_text(payload.get('system_name'), max_len=200)
    if not system_name and work_name:
        # Best-effort: resolve system_name from hardware table.
        try:
            rows = suggest_tab32_host_work_systems(work_name, limit=5, app=app)
            for r in rows:
                if (r.get('work_name') or '').strip() == work_name and (r.get('system_name') or '').strip():
                    system_name = _sanitize_text(r.get('system_name'), max_len=200)
                    break
        except Exception:
            pass
    if not work_name:
        raise ValueError('업무 이름이 필요합니다.')
    if not system_name:
        raise ValueError('시스템 이름이 필요합니다.')

    host_type = _sanitize_text(payload.get('host_type'), max_len=200)
    conn_type = _sanitize_text(payload.get('conn_type'), max_len=50)
    identifiers = _normalize_identifiers(payload.get('identifiers') if 'identifiers' in payload else payload.get('identifiers_text'))
    identifiers_json = json.dumps(identifiers, ensure_ascii=False)
    legacy_wwid_ip = identifiers[0] if identifiers else ''

    actor = (actor or 'system').strip() or 'system'
    with _get_connection(app) as conn:
        exists = conn.execute(f"SELECT 1 FROM {TABLE_GROUP} WHERE id = ?", (group_id,)).fetchone()
        if not exists:
            raise ValueError('업무 그룹을 찾을 수 없습니다.')
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_HOST} (
                group_id, work_name, system_name, os_type, host_type, wwid_ip, identifiers_json, auth_access, port_alloc,
                created_at, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                group_id,
                work_name,
                system_name,
                host_type,
                conn_type,
                legacy_wwid_ip,
                identifiers_json,
                '',
                _sanitize_text(payload.get('port_alloc'), max_len=200),
                _now(),
                actor,
            ),
        )
        hid = int(cur.lastrowid)
        row = conn.execute(f"SELECT * FROM {TABLE_HOST} WHERE id = ?", (hid,)).fetchone()
        conn.commit()
        return _row_to_host(row)


def update_tab32_group_host(host_id: int, payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    host_id = _sanitize_int(host_id)
    work_name = _sanitize_text(payload.get('work_name'), max_len=200)
    system_name = _sanitize_text(payload.get('system_name'), max_len=200)
    if not system_name and work_name:
        try:
            rows = suggest_tab32_host_work_systems(work_name, limit=5, app=app)
            for r in rows:
                if (r.get('work_name') or '').strip() == work_name and (r.get('system_name') or '').strip():
                    system_name = _sanitize_text(r.get('system_name'), max_len=200)
                    break
        except Exception:
            pass
    if not work_name:
        raise ValueError('업무 이름이 필요합니다.')
    if not system_name:
        raise ValueError('시스템 이름이 필요합니다.')

    host_type = _sanitize_text(payload.get('host_type'), max_len=200)
    conn_type = _sanitize_text(payload.get('conn_type'), max_len=50)
    identifiers = _normalize_identifiers(payload.get('identifiers') if 'identifiers' in payload else payload.get('identifiers_text'))
    identifiers_json = json.dumps(identifiers, ensure_ascii=False)
    legacy_wwid_ip = identifiers[0] if identifiers else ''

    actor = (actor or 'system').strip() or 'system'
    with _get_connection(app) as conn:
        existing = conn.execute(f"SELECT * FROM {TABLE_HOST} WHERE id = ?", (host_id,)).fetchone()
        if not existing:
            raise ValueError('호스트 항목을 찾을 수 없습니다.')

        port_alloc = (
            _sanitize_text(payload.get('port_alloc'), max_len=200)
            if 'port_alloc' in payload
            else (existing['port_alloc'] or '')
        )
        conn.execute(
            f"""
            UPDATE {TABLE_HOST}
            SET work_name = ?, system_name = ?, os_type = ?, host_type = ?, wwid_ip = ?, identifiers_json = ?, auth_access = ?, port_alloc = ?,
                updated_at = ?, updated_by = ?
            WHERE id = ?
            """,
            (
                work_name,
                system_name,
                host_type,
                conn_type,
                legacy_wwid_ip,
                identifiers_json,
                '',
                port_alloc,
                _now(),
                actor,
                host_id,
            ),
        )
        row = conn.execute(f"SELECT * FROM {TABLE_HOST} WHERE id = ?", (host_id,)).fetchone()
        conn.commit()
        return _row_to_host(row)


def delete_tab32_group_host(host_id: int, *, app=None) -> None:
    host_id = _sanitize_int(host_id)
    with _get_connection(app) as conn:
        cur = conn.execute(f"DELETE FROM {TABLE_HOST} WHERE id = ?", (host_id,))
        if cur.rowcount == 0:
            raise ValueError('호스트 항목을 찾을 수 없습니다.')
        conn.commit()


def list_tab32_group_volumes(group_id: int, *, app=None) -> List[Dict[str, Any]]:
    group_id = _sanitize_int(group_id)
    with _get_connection(app) as conn:
        rows = conn.execute(
            f"SELECT * FROM {TABLE_VOLUME} WHERE group_id = ? ORDER BY id ASC",
            (group_id,),
        ).fetchall()
        return [_row_to_volume(r) for r in rows]


def create_tab32_group_volume(group_id: int, payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    group_id = _sanitize_int(group_id)
    volume_name = _sanitize_text(payload.get('volume_name'), max_len=200)
    if not volume_name:
        raise ValueError('볼륨 이름이 필요합니다.')

    uuid = _sanitize_text(payload.get('uuid'), max_len=200)

    actor = (actor or 'system').strip() or 'system'
    with _get_connection(app) as conn:
        exists = conn.execute(f"SELECT 1 FROM {TABLE_GROUP} WHERE id = ?", (group_id,)).fetchone()
        if not exists:
            raise ValueError('업무 그룹을 찾을 수 없습니다.')

        dup_name = conn.execute(
            f"SELECT 1 FROM {TABLE_VOLUME} WHERE group_id = ? AND LOWER(volume_name) = LOWER(?) LIMIT 1",
            (group_id, volume_name),
        ).fetchone()
        if dup_name:
            raise ValueError('볼륨 이름은 중복될 수 없습니다.')

        if uuid:
            dup_uuid = conn.execute(
                f"SELECT 1 FROM {TABLE_VOLUME} WHERE group_id = ? AND uuid IS NOT NULL AND uuid != '' AND LOWER(uuid) = LOWER(?) LIMIT 1",
                (group_id, uuid),
            ).fetchone()
            if dup_uuid:
                raise ValueError('UUID는 중복될 수 없습니다.')

        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_VOLUME} (
                group_id, volume_name, uuid, capacity, thin_thick,
                shared_yn, replicated_yn, assigned_date,
                created_at, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                group_id,
                volume_name,
                uuid,
                _sanitize_text(payload.get('capacity'), max_len=50),
                _sanitize_text(payload.get('thin_thick'), max_len=50),
                _sanitize_text(payload.get('shared'), max_len=10),
                _sanitize_text(payload.get('replicated'), max_len=10),
                _sanitize_text(payload.get('assigned_date'), max_len=50),
                _now(),
                actor,
            ),
        )
        vid = int(cur.lastrowid)
        row = conn.execute(f"SELECT * FROM {TABLE_VOLUME} WHERE id = ?", (vid,)).fetchone()
        conn.commit()
        return _row_to_volume(row)


def update_tab32_group_volume(volume_id: int, payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    volume_id = _sanitize_int(volume_id)
    volume_name = _sanitize_text(payload.get('volume_name'), max_len=200)
    if not volume_name:
        raise ValueError('볼륨 이름이 필요합니다.')

    uuid = _sanitize_text(payload.get('uuid'), max_len=200)

    actor = (actor or 'system').strip() or 'system'
    with _get_connection(app) as conn:
        existing = conn.execute(f"SELECT * FROM {TABLE_VOLUME} WHERE id = ?", (volume_id,)).fetchone()
        if not existing:
            raise ValueError('볼륨 항목을 찾을 수 없습니다.')

        group_id = int(existing['group_id'])
        dup_name = conn.execute(
            f"SELECT 1 FROM {TABLE_VOLUME} WHERE group_id = ? AND id <> ? AND LOWER(volume_name) = LOWER(?) LIMIT 1",
            (group_id, volume_id, volume_name),
        ).fetchone()
        if dup_name:
            raise ValueError('볼륨 이름은 중복될 수 없습니다.')

        if uuid:
            dup_uuid = conn.execute(
                f"SELECT 1 FROM {TABLE_VOLUME} WHERE group_id = ? AND id <> ? AND uuid IS NOT NULL AND uuid != '' AND LOWER(uuid) = LOWER(?) LIMIT 1",
                (group_id, volume_id, uuid),
            ).fetchone()
            if dup_uuid:
                raise ValueError('UUID는 중복될 수 없습니다.')

        conn.execute(
            f"""
            UPDATE {TABLE_VOLUME}
            SET volume_name = ?, uuid = ?, capacity = ?, thin_thick = ?,
                shared_yn = ?, replicated_yn = ?, assigned_date = ?,
                updated_at = ?, updated_by = ?
            WHERE id = ?
            """,
            (
                volume_name,
                uuid,
                _sanitize_text(payload.get('capacity'), max_len=50),
                _sanitize_text(payload.get('thin_thick'), max_len=50),
                _sanitize_text(payload.get('shared'), max_len=10),
                _sanitize_text(payload.get('replicated'), max_len=10),
                _sanitize_text(payload.get('assigned_date'), max_len=50),
                _now(),
                actor,
                volume_id,
            ),
        )
        row = conn.execute(f"SELECT * FROM {TABLE_VOLUME} WHERE id = ?", (volume_id,)).fetchone()
        conn.commit()
        return _row_to_volume(row)


def delete_tab32_group_volume(volume_id: int, *, app=None) -> None:
    volume_id = _sanitize_int(volume_id)
    with _get_connection(app) as conn:
        cur = conn.execute(f"DELETE FROM {TABLE_VOLUME} WHERE id = ?", (volume_id,))
        if cur.rowcount == 0:
            raise ValueError('볼륨 항목을 찾을 수 없습니다.')
        conn.commit()


def list_tab32_group_replications(group_id: int, *, app=None) -> List[Dict[str, Any]]:
    group_id = _sanitize_int(group_id)
    with _get_connection(app) as conn:
        _ensure_replication_schema(conn)
        rows = conn.execute(
            f"SELECT * FROM {TABLE_REPL} WHERE group_id = ? ORDER BY id ASC",
            (group_id,),
        ).fetchall()
        items = [_row_to_replication(r) for r in rows]
        # Backfill system name for legacy rows (display-only) when possible.
        try:
            for it in items:
                if it.get('repl_storage') and not it.get('repl_storage_system_name'):
                    sys_name = _lookup_storage_system_name(it.get('repl_storage') or '')
                    it['repl_storage_system_name'] = sys_name
                    if sys_name:
                        try:
                            conn.execute(
                                f"UPDATE {TABLE_REPL} SET repl_storage_system_name = ? WHERE id = ?",
                                (sys_name, int(it.get('id') or 0)),
                            )
                        except Exception:
                            pass
        except Exception:
            pass
        return items


def create_tab32_group_replication(group_id: int, payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    group_id = _sanitize_int(group_id)
    actor = (actor or 'system').strip() or 'system'

    with _get_connection(app) as conn:
        _ensure_replication_schema(conn)
        exists = conn.execute(f"SELECT 1 FROM {TABLE_GROUP} WHERE id = ?", (group_id,)).fetchone()
        if not exists:
            raise ValueError('업무 그룹을 찾을 수 없습니다.')

        repl_storage = _sanitize_text(payload.get('repl_storage'), max_len=200)
        repl_storage_system = _sanitize_text(payload.get('repl_storage_system_name'), max_len=200)
        if repl_storage and not repl_storage_system:
            repl_storage_system = _lookup_storage_system_name(repl_storage)

        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_REPL} (
                group_id, local_volume_name, repl_storage, repl_storage_system_name, repl_method, remark,
                repl_volume_name, capacity,
                created_at, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                group_id,
                _sanitize_text(payload.get('local_volume_name'), max_len=200),
                repl_storage,
                repl_storage_system,
                _sanitize_text(payload.get('repl_method'), max_len=50),
                _sanitize_text(payload.get('remark'), max_len=500),
                _sanitize_text(payload.get('repl_volume_name'), max_len=200),
                _sanitize_text(payload.get('capacity'), max_len=50),
                _now(),
                actor,
            ),
        )
        rid = int(cur.lastrowid)
        row = conn.execute(f"SELECT * FROM {TABLE_REPL} WHERE id = ?", (rid,)).fetchone()
        conn.commit()
        return _row_to_replication(row)


def update_tab32_group_replication(replication_id: int, payload: Dict[str, Any], *, actor: str = 'system', app=None) -> Dict[str, Any]:
    replication_id = _sanitize_int(replication_id)
    actor = (actor or 'system').strip() or 'system'
    with _get_connection(app) as conn:
        _ensure_replication_schema(conn)
        existing = conn.execute(f"SELECT * FROM {TABLE_REPL} WHERE id = ?", (replication_id,)).fetchone()
        if not existing:
            raise ValueError('복제 항목을 찾을 수 없습니다.')

        repl_storage = _sanitize_text(payload.get('repl_storage'), max_len=200)
        repl_storage_system = _sanitize_text(payload.get('repl_storage_system_name'), max_len=200)
        if repl_storage and not repl_storage_system:
            repl_storage_system = _lookup_storage_system_name(repl_storage)

        conn.execute(
            f"""
            UPDATE {TABLE_REPL}
            SET local_volume_name = ?, repl_storage = ?, repl_storage_system_name = ?, repl_method = ?, remark = ?,
                repl_volume_name = ?, capacity = ?,
                updated_at = ?, updated_by = ?
            WHERE id = ?
            """,
            (
                _sanitize_text(payload.get('local_volume_name'), max_len=200),
                repl_storage,
                repl_storage_system,
                _sanitize_text(payload.get('repl_method'), max_len=50),
                _sanitize_text(payload.get('remark'), max_len=500),
                _sanitize_text(payload.get('repl_volume_name'), max_len=200),
                _sanitize_text(payload.get('capacity'), max_len=50),
                _now(),
                actor,
                replication_id,
            ),
        )
        row = conn.execute(f"SELECT * FROM {TABLE_REPL} WHERE id = ?", (replication_id,)).fetchone()
        conn.commit()
        return _row_to_replication(row)


def delete_tab32_group_replication(replication_id: int, *, app=None) -> None:
    replication_id = _sanitize_int(replication_id)
    with _get_connection(app) as conn:
        cur = conn.execute(f"DELETE FROM {TABLE_REPL} WHERE id = ?", (replication_id,))
        if cur.rowcount == 0:
            raise ValueError('복제 항목을 찾을 수 없습니다.')
        conn.commit()


def _lookup_storage_asset_id_by_work_name(work_name: str, *, app=None) -> Optional[int]:
    work_name = (work_name or '').strip()
    if not work_name:
        return None
    try:
        from app.services import hardware_asset_service

        data = hardware_asset_service.list_hardware_assets(
            app=app,
            asset_category='STORAGE',
            asset_type=None,
            filters={'work_name': work_name},
            page=1,
            page_size=200,
        )
        items = (data or {}).get('items') or []
        for it in items:
            try:
                w = (it.get('work_name') or '').strip()
                if w.lower() == work_name.lower():
                    return int(it.get('id'))
            except Exception:
                continue
        for it in items:
            try:
                return int(it.get('id'))
            except Exception:
                continue
    except Exception:
        return None
    return None


def list_replication_storage_volume_names(
    group_id: int,
    repl_storage_work_name: str,
    *,
    app=None,
) -> List[str]:
    """Return volume_name list for the selected replication storage.

    Resolution strategy:
    - Look up the current group's scope_key.
    - Look up the STORAGE hardware asset id by work_name.
    - Find a Tab32 group with same scope_key + asset_id.
    - Return that group's volumes (names only).
    """
    group_id = _sanitize_int(group_id)
    repl_storage_work_name = _sanitize_text(repl_storage_work_name, max_len=200)
    if not repl_storage_work_name:
        return []

    asset_id = _lookup_storage_asset_id_by_work_name(repl_storage_work_name, app=app)
    if not asset_id:
        return []

    with _get_connection(app) as conn:
        g = conn.execute(f"SELECT scope_key FROM {TABLE_GROUP} WHERE id = ?", (group_id,)).fetchone()
        if not g:
            return []
        scope_key = (g['scope_key'] or '').strip()
        if not scope_key:
            return []

        target = conn.execute(
            f"SELECT id FROM {TABLE_GROUP} WHERE scope_key = ? AND asset_id = ? ORDER BY id DESC LIMIT 1",
            (scope_key, int(asset_id)),
        ).fetchone()
        if not target:
            return []

        target_group_id = int(target['id'])
        rows = conn.execute(
            f"SELECT volume_name FROM {TABLE_VOLUME} WHERE group_id = ? AND volume_name IS NOT NULL AND volume_name != '' ORDER BY volume_name ASC",
            (target_group_id,),
        ).fetchall()
        names: List[str] = []
        seen = set()
        for r in rows:
            try:
                name = (r['volume_name'] or '').strip()
            except Exception:
                name = ''
            if not name:
                continue
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            names.append(name)
        return names
