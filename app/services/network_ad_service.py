import json
import logging
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

LEGACY_TABLE_NAME = 'network_ad'
TABLE_NAME = 'network_ad_policy'
ACCOUNT_TABLE_NAME = 'network_ad_account'
FQDN_TABLE_NAME = 'network_ad_fqdn'
LOG_TABLE_NAME = 'network_ad_log'
ORDERABLE_COLUMNS = {
    'ad_id': 'ad_id',
    'status': 'status',
    'domain_name': 'domain_name',
    'fqdn': 'fqdn',
    'fqdn_count': 'fqdn_count',
    'role': 'role',
    'is_standby': 'is_standby',
    'total_account_cnt': 'total_account_cnt',
    'active_account_cnt': 'active_account_cnt',
    'account_count': 'account_count',
    'main_groups': 'main_groups',
    'remark': 'remark',
    'created_at': 'created_at',
    'updated_at': 'updated_at',
}
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 500


_AD_LIST_TABLES_READY = False


def _ensure_ad_list_tables_ready(app=None) -> None:
    """Best-effort table initialization for AD list/counts.

    The AD list endpoint needs to aggregate counts from related tables
    (`network_ad_account`, `network_ad_fqdn`). In some environments those tables
    may not be created/migrated yet (or may still live in the legacy project-root
    DB). Initialize/migrate once per process to keep list queries reliable.
    """
    global _AD_LIST_TABLES_READY
    if _AD_LIST_TABLES_READY:
        return

    app = app or current_app
    try:
        init_network_ad_table(app=app)
    except Exception:
        logger.exception('Failed to init AD policy table (best-effort)')

    try:
        init_network_ad_account_tables(app=app)
    except Exception:
        logger.exception('Failed to init AD account/log tables (best-effort)')

    try:
        # Local import to avoid circular imports at module load time.
        from app.services.network_ad_fqdn_service import init_network_ad_fqdn_table

        init_network_ad_fqdn_table(app=app)
    except Exception:
        logger.exception('Failed to init AD FQDN table (best-effort)')

    _AD_LIST_TABLES_READY = True


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _kst_tzinfo():
    try:
        from zoneinfo import ZoneInfo  # type: ignore

        return ZoneInfo('Asia/Seoul')
    except Exception:
        return timezone(timedelta(hours=9))


def _format_datetime_kst(value: Any) -> str:
    if value is None:
        return ''

    if isinstance(value, datetime):
        dt = value
    else:
        raw = str(value).strip()
        if raw == '':
            return ''
        dt = None
        for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M:%S.%f'):
            try:
                dt = datetime.strptime(raw, fmt)
                break
            except ValueError:
                continue
        if dt is None:
            try:
                dt = datetime.fromisoformat(raw)
            except Exception:
                return raw

    # Our sqlite timestamps are stored as UTC strings (CURRENT_TIMESTAMP / utcnow)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt_kst = dt.astimezone(_kst_tzinfo())
    return dt_kst.strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    override = app.config.get('NETWORK_AD_SQLITE_PATH')
    if override:
        return os.path.abspath(override)

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
    # Flask-SQLAlchemy treats relative SQLite filenames as relative to instance_path.
    relative = path.lstrip('/')
    if relative and not os.path.isabs(relative):
        # If it's just a filename (no directory), store in instance_path.
        if os.path.basename(relative) == relative:
            return os.path.abspath(os.path.join(app.instance_path, relative))
        return os.path.abspath(os.path.join(_project_root(app), relative))

    if os.path.isabs(path):
        return os.path.abspath(path)
    return os.path.abspath(os.path.join(app.instance_path, 'dev_blossom.db'))


def _legacy_project_db_path(app=None) -> Optional[str]:
    """Best-effort: path used by older AD services (project-root relative SQLite)."""
    app = app or current_app
    override = app.config.get('NETWORK_AD_SQLITE_PATH')
    if override:
        return None
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        return None
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return None
    if netloc and netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    relative = (path or '').lstrip('/')
    if not relative or os.path.isabs(relative):
        return None
    return os.path.abspath(os.path.join(_project_root(app), relative))


def migrate_network_ad_tables_from_legacy_db(
    table_names: List[str],
    *,
    app=None,
) -> None:
    """Copy rows from a legacy project-root DB into the current DB (instance DB).

    This is a best-effort, additive migration (INSERT OR IGNORE) to avoid data loss
    when older code wrote AD tables into a different SQLite file.
    """
    app = app or current_app
    legacy_path = _legacy_project_db_path(app)
    current_path = _resolve_db_path(app)
    if not legacy_path:
        return
    if os.path.abspath(legacy_path) == os.path.abspath(current_path):
        return
    if not os.path.exists(legacy_path):
        return

    legacy_conn: Optional[sqlite3.Connection] = None
    try:
        # Avoid ATTACH/DETACH because DETACH can raise "database legacy is locked" during startup.
        legacy_conn = sqlite3.connect(legacy_path, timeout=1)
        legacy_conn.row_factory = sqlite3.Row
        try:
            legacy_conn.execute('PRAGMA query_only = ON')
        except Exception:
            pass

        with _get_connection(app) as conn:
            try:
                conn.execute('PRAGMA foreign_keys = OFF')
            except Exception:
                pass

            for table in table_names:
                try:
                    legacy_exists = legacy_conn.execute(
                        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                        (table,),
                    ).fetchone()
                    current_exists = conn.execute(
                        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                        (table,),
                    ).fetchone()
                    if not legacy_exists or not current_exists:
                        continue

                    legacy_count = legacy_conn.execute(f"SELECT COUNT(1) FROM {table}").fetchone()[0]
                    current_count = conn.execute(f"SELECT COUNT(1) FROM {table}").fetchone()[0]
                    if int(legacy_count or 0) <= int(current_count or 0):
                        continue

                    cols_new = [
                        r[1]
                        for r in conn.execute(f"PRAGMA table_info({table})").fetchall()
                        if r and r[1]
                    ]
                    cols_old = [
                        r[1]
                        for r in legacy_conn.execute(f"PRAGMA table_info({table})").fetchall()
                        if r and r[1]
                    ]
                    if not cols_new or not cols_old:
                        continue

                    cols = [c for c in cols_new if c in set(cols_old)]
                    if not cols:
                        continue

                    col_sql = ', '.join(cols)
                    placeholders = ', '.join(['?'] * len(cols))

                    cursor = legacy_conn.execute(f"SELECT {col_sql} FROM {table}")
                    while True:
                        batch = cursor.fetchmany(1000)
                        if not batch:
                            break
                        payload = [tuple(row[c] for c in cols) for row in batch]
                        conn.executemany(
                            f"INSERT OR IGNORE INTO {table} ({col_sql}) VALUES ({placeholders})",
                            payload,
                        )
                except Exception:
                    logger.exception('Failed to migrate legacy table: %s', table)

            try:
                conn.execute('PRAGMA foreign_keys = ON')
            except Exception:
                pass
            conn.commit()
    except Exception:
        logger.exception('Legacy AD DB migration failed')
    finally:
        if legacy_conn is not None:
            try:
                legacy_conn.close()
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
    return conn


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    ).fetchone()
    return row is not None


def _coerce_yn(value: Any, default: str = 'N') -> str:
    if value is None or value == '':
        return default
    if isinstance(value, bool):
        return 'Y' if value else 'N'
    token = str(value).strip().upper()
    if token in ('Y', 'N'):
        return token
    if token in ('1', 'TRUE', 'YES', 'ON'):
        return 'Y'
    if token in ('0', 'FALSE', 'NO', 'OFF'):
        return 'N'
    return default


def _coerce_int(value: Any) -> Optional[int]:
    if value is None or value == '':
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError('Account counts must be integers.') from exc


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    keys = set(row.keys())
    fqdn_raw = row['fqdn'] if 'fqdn' in keys else ''
    fqdn_count = row['fqdn_count'] if 'fqdn_count' in keys else (1 if str(fqdn_raw or '').strip() else 0)
    account_count = None
    if 'account_count' in keys:
        account_count = row['account_count']
    elif 'total_account_cnt' in keys:
        account_count = row['total_account_cnt']
    return {
        'ad_id': row['ad_id'],
        'status': row['status'],
        'domain_name': row['domain_name'],
        'fqdn': row['fqdn'],
        'fqdn_count': fqdn_count,
        'role': row['role'],
        'is_standby': row['is_standby'] or 'N',
        'total_account_cnt': row['total_account_cnt'],
        'active_account_cnt': row['active_account_cnt'],
        'account_count': account_count,
        'main_groups': row['main_groups'] or '',
        'remark': row['remark'] or '',
        'created_at': row['created_at'],
        'updated_at': row['updated_at'],
        # UI-friendly aliases (existing AD list mock keys)
        'id': row['ad_id'],
        'domain': row['domain_name'],
        'fqdn_cnt': fqdn_count,
        'acct_cnt': account_count,
        'account_cnt': account_count,
        'fqdn_count_ui': fqdn_count,
        'account_count_ui': account_count,
        'main_group': row['main_groups'] or '',
        'note': row['remark'] or '',
        'account_counts': _format_account_counts(row['total_account_cnt'], row['active_account_cnt']),
    }


def _row_to_account_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    keys = set(row.keys())
    return {
        'account_id': row['account_id'],
        'ad_id': row['ad_id'],
        'username': row['username'],
        'display_name': row['display_name'] or '',
        'account_type': row['account_type'] or '',
        'purpose': row['purpose'] or '',
        'owner': row['owner'] or '',
        'owner_user_id': row['owner_user_id'] if 'owner_user_id' in keys else None,
        'owner_dept_id': row['owner_dept_id'] if 'owner_dept_id' in keys else None,
        'privilege': row['privilege'] if 'privilege' in keys else '',
        'status': row['status'] or '',
        'password_rotated_at': row['password_rotated_at'] or '',
        'password_expires_at': row['password_expires_at'] or '',
        'note': row['note'] or '',
        'created_at': row['created_at'],
        'updated_at': row['updated_at'],
        # UI-friendly
        'id': row['account_id'],
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
        'ad_id': row['ad_id'],
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


def update_network_ad_log_reason(
    ad_id: int,
    log_id: int,
    *,
    reason: str,
    app=None,
) -> Optional[Dict[str, Any]]:
    app = app or current_app
    rid = int(log_id)
    aid = int(ad_id)
    reason_text = (reason or '').strip()
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT log_id FROM {LOG_TABLE_NAME} WHERE ad_id = ? AND log_id = ?",
            (aid, rid),
        ).fetchone()
        if not row:
            return None
        conn.execute(
            f"UPDATE {LOG_TABLE_NAME} SET reason = ? WHERE ad_id = ? AND log_id = ?",
            (reason_text, aid, rid),
        )
        conn.commit()
        updated = conn.execute(
            f"SELECT * FROM {LOG_TABLE_NAME} WHERE ad_id = ? AND log_id = ?",
            (aid, rid),
        ).fetchone()
    return _row_to_log_dict(updated)


def _format_account_counts(total: Any, active: Any) -> str:
    if total is None and active is None:
        return ''
    t = '' if total is None else str(total)
    a = '' if active is None else str(active)
    if t == '' and a == '':
        return ''
    return f"{t}/{a}" if (t != '' or a != '') else ''


def init_network_ad_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            # Backward-compatible migration: rename legacy table (network_ad) -> network_ad_policy
            try:
                if _table_exists(conn, LEGACY_TABLE_NAME) and not _table_exists(conn, TABLE_NAME):
                    conn.execute(f"ALTER TABLE {LEGACY_TABLE_NAME} RENAME TO {TABLE_NAME}")
                    # Best-effort rename for legacy index names (safe to ignore failures)
                    for suffix in ('status', 'domain', 'fqdn', 'fqdn_count', 'account_count'):
                        old_idx = f"idx_{LEGACY_TABLE_NAME}_{suffix}"
                        new_idx = f"idx_{TABLE_NAME}_{suffix}"
                        try:
                            conn.execute(f"ALTER INDEX {old_idx} RENAME TO {new_idx}")
                        except Exception:
                            pass
            except Exception:
                # Never block initialization due to best-effort migration.
                logger.exception('Legacy AD table rename migration failed')

            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    ad_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    status TEXT NOT NULL,
                    domain_name TEXT NOT NULL,
                    fqdn TEXT NOT NULL,
                    fqdn_count INTEGER NOT NULL DEFAULT 0,
                    role TEXT NOT NULL,
                    is_standby TEXT NOT NULL DEFAULT 'N',
                    total_account_cnt INTEGER,
                    active_account_cnt INTEGER,
                    account_count INTEGER NOT NULL DEFAULT 0,
                    main_groups TEXT,
                    remark TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            # Lightweight schema upgrades for existing sqlite DBs (without Alembic)
            cols = {r['name'] for r in conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall()}
            if 'fqdn_count' not in cols:
                conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN fqdn_count INTEGER")
            if 'account_count' not in cols:
                conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN account_count INTEGER")

            # Best-effort backfill (do not overwrite non-null explicit values)
            try:
                conn.execute(
                    f"""
                    UPDATE {TABLE_NAME}
                    SET fqdn_count = CASE
                        WHEN fqdn_count IS NULL THEN (CASE WHEN TRIM(COALESCE(fqdn, '')) != '' THEN 1 ELSE 0 END)
                        WHEN fqdn_count = 0 AND TRIM(COALESCE(fqdn, '')) != '' THEN 1
                        ELSE fqdn_count
                    END
                    """
                )
            except Exception:
                pass
            try:
                conn.execute(
                    f"""
                    UPDATE {TABLE_NAME}
                    SET account_count = COALESCE(account_count, COALESCE(total_account_cnt, 0))
                    """
                )
            except Exception:
                pass
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_status ON {TABLE_NAME}(status)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_domain ON {TABLE_NAME}(domain_name)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_fqdn ON {TABLE_NAME}(fqdn)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_fqdn_count ON {TABLE_NAME}(fqdn_count)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_account_count ON {TABLE_NAME}(account_count)"
            )
            conn.commit()
            logger.info('%s table ready', TABLE_NAME)

        # Best-effort: migrate legacy project-root DB rows into the current DB.
        try:
            migrate_network_ad_tables_from_legacy_db([TABLE_NAME], app=app)
        except Exception:
            logger.exception('Legacy migration (AD table) failed')
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def init_network_ad_account_tables(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {ACCOUNT_TABLE_NAME} (
                    account_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ad_id INTEGER NOT NULL,
                    username TEXT NOT NULL,
                    display_name TEXT,
                    account_type TEXT NOT NULL DEFAULT 'SERVICE',
                    purpose TEXT,
                    owner TEXT,
                    owner_user_id INTEGER,
                    owner_dept_id INTEGER,
                    privilege TEXT,
                    status TEXT NOT NULL DEFAULT 'ACTIVE',
                    password_rotated_at TEXT,
                    password_expires_at TEXT,
                    note TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (ad_id, username)
                )
                """
            )
            # Backward-compatible column adds for pre-existing tables
            try:
                cols = {r[1] for r in conn.execute(f"PRAGMA table_info({ACCOUNT_TABLE_NAME})").fetchall()}
            except Exception:
                cols = set()
            for col_name, col_def in (
                ('owner_user_id', 'INTEGER'),
                ('owner_dept_id', 'INTEGER'),
                ('privilege', 'TEXT'),
            ):
                if col_name not in cols:
                    try:
                        conn.execute(f"ALTER TABLE {ACCOUNT_TABLE_NAME} ADD COLUMN {col_name} {col_def}")
                    except Exception:
                        pass
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{ACCOUNT_TABLE_NAME}_ad_id ON {ACCOUNT_TABLE_NAME}(ad_id)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{ACCOUNT_TABLE_NAME}_status ON {ACCOUNT_TABLE_NAME}(status)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{ACCOUNT_TABLE_NAME}_owner_user_id ON {ACCOUNT_TABLE_NAME}(owner_user_id)"
            )

            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {LOG_TABLE_NAME} (
                    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ad_id INTEGER NOT NULL,
                    tab_key TEXT NOT NULL,
                    entity TEXT NOT NULL,
                    entity_id INTEGER,
                    action TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    message TEXT NOT NULL,
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
                f"CREATE INDEX IF NOT EXISTS idx_{LOG_TABLE_NAME}_ad_id ON {LOG_TABLE_NAME}(ad_id)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{LOG_TABLE_NAME}_created_at ON {LOG_TABLE_NAME}(created_at)"
            )
            conn.commit()
            logger.info('%s/%s tables ready', ACCOUNT_TABLE_NAME, LOG_TABLE_NAME)

        # Best-effort: migrate legacy project-root DB rows into the current DB.
        try:
            migrate_network_ad_tables_from_legacy_db([ACCOUNT_TABLE_NAME, LOG_TABLE_NAME], app=app)
        except Exception:
            logger.exception('Legacy migration (AD account/log) failed')
    except Exception:
        logger.exception('Failed to initialize AD account/log tables')
        raise


def append_network_ad_log(
    ad_id: int,
    *,
    tab_key: str,
    entity: str,
    action: str,
    actor: str,
    message: str,
    entity_id: Optional[int] = None,
    diff: Optional[Dict[str, Any]] = None,
    app=None,
) -> None:
    app = app or current_app
    tab_key = (tab_key or '').strip() or 'unknown'
    entity = (entity or '').strip() or 'UNKNOWN'
    action = (action or '').strip() or 'UNKNOWN'
    actor = (actor or '').strip() or 'system'
    message = (message or '').strip() or ''
    diff_json = None
    if diff is not None:
        try:
            diff_json = json.dumps(diff, ensure_ascii=False)
        except Exception:
            diff_json = None

    with _get_connection(app) as conn:
        conn.execute(
            f"""
            INSERT INTO {LOG_TABLE_NAME} (
                ad_id, tab_key, entity, entity_id, action, actor, message, diff_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                int(ad_id),
                tab_key,
                entity,
                entity_id,
                action,
                actor,
                message,
                diff_json,
                _now(),
            ),
        )
        conn.commit()


def get_network_ad(ad_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE ad_id = ?",
            (ad_id,),
        ).fetchone()
        if not row:
            return None

        item = _row_to_dict(row)
        ad_id_int = int(item.get('ad_id') or 0)
        if not ad_id_int:
            return item

        if _table_exists(conn, FQDN_TABLE_NAME):
            fqdn_count = conn.execute(
                f"SELECT COUNT(1) FROM {FQDN_TABLE_NAME} WHERE ad_id = ?",
                (ad_id_int,),
            ).fetchone()[0]
            fqdn_count = int(fqdn_count or 0)
            item['fqdn_count'] = fqdn_count
            item['fqdn_cnt'] = fqdn_count
            item['fqdn_count_ui'] = fqdn_count

        if _table_exists(conn, ACCOUNT_TABLE_NAME):
            account_count = conn.execute(
                f"SELECT COUNT(1) FROM {ACCOUNT_TABLE_NAME} WHERE ad_id = ?",
                (ad_id_int,),
            ).fetchone()[0]
            account_count = int(account_count or 0)
            item['account_count'] = account_count
            item['acct_cnt'] = account_count
            item['account_cnt'] = account_count
            item['account_count_ui'] = account_count
            item['total_account_cnt'] = account_count
            item['account_counts'] = _format_account_counts(account_count, item.get('active_account_cnt'))

        return item


def _resolve_order(order: Optional[str]) -> str:
    if not order:
        return 'ad_id DESC'
    direction = 'ASC'
    column = order
    if order.startswith('-'):
        direction = 'DESC'
        column = order[1:]
    key = ORDERABLE_COLUMNS.get((column or '').lower())
    if not key:
        return 'ad_id DESC'
    return f"{key} {direction}"


def list_network_ads(
    app=None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    domain_name: Optional[str] = None,
    fqdn: Optional[str] = None,
    role: Optional[str] = None,
    is_standby: Optional[str] = None,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    order: Optional[str] = None,
) -> Dict[str, Any]:
    app = app or current_app
    _ensure_ad_list_tables_ready(app=app)
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))

    clauses = ['1=1']
    params: List[Any] = []

    if search:
        like = f"%{search.strip()}%"
        clauses.append("(status LIKE ? OR domain_name LIKE ? OR fqdn LIKE ? OR role LIKE ? OR main_groups LIKE ? OR remark LIKE ?)")
        params.extend([like] * 6)
    if status:
        clauses.append('status = ?')
        params.append(status.strip())
    if domain_name:
        clauses.append('domain_name LIKE ?')
        params.append(f"%{domain_name.strip()}%")
    if fqdn:
        clauses.append('fqdn LIKE ?')
        params.append(f"%{fqdn.strip()}%")
    if role:
        clauses.append('role LIKE ?')
        params.append(f"%{role.strip()}%")
    if is_standby:
        clauses.append('is_standby = ?')
        params.append(_coerce_yn(is_standby))

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

        ad_ids = [int(r['ad_id']) for r in rows]
        fqdn_counts: Dict[int, int] = {}
        account_counts: Dict[int, int] = {}
        if ad_ids:
            placeholders = ','.join(['?'] * len(ad_ids))
            if _table_exists(conn, FQDN_TABLE_NAME):
                fqdn_counts = {ad_id: 0 for ad_id in ad_ids}
                for r in conn.execute(
                    f"SELECT ad_id, COUNT(1) AS cnt FROM {FQDN_TABLE_NAME} WHERE ad_id IN ({placeholders}) GROUP BY ad_id",
                    ad_ids,
                ).fetchall():
                    fqdn_counts[int(r['ad_id'])] = int(r['cnt'] or 0)
            if _table_exists(conn, ACCOUNT_TABLE_NAME):
                account_counts = {ad_id: 0 for ad_id in ad_ids}
                for r in conn.execute(
                    f"SELECT ad_id, COUNT(1) AS cnt FROM {ACCOUNT_TABLE_NAME} WHERE ad_id IN ({placeholders}) GROUP BY ad_id",
                    ad_ids,
                ).fetchall():
                    account_counts[int(r['ad_id'])] = int(r['cnt'] or 0)

    items: List[Dict[str, Any]] = []
    for row in rows:
        item = _row_to_dict(row)
        ad_id = int(item.get('ad_id') or 0)

        if ad_id and ad_id in fqdn_counts:
            fqdn_count = int(fqdn_counts[ad_id])
            item['fqdn_count'] = fqdn_count
            item['fqdn_cnt'] = fqdn_count
            item['fqdn_count_ui'] = fqdn_count

        if ad_id and ad_id in account_counts:
            account_count = int(account_counts[ad_id])
            item['account_count'] = account_count
            item['acct_cnt'] = account_count
            item['account_cnt'] = account_count
            item['account_count_ui'] = account_count
            # Preserve active_account_cnt if it exists; keep UI summary aligned with count.
            item['total_account_cnt'] = account_count
            item['account_counts'] = _format_account_counts(account_count, item.get('active_account_cnt'))

        items.append(item)

    return {
        'items': items,
        'total': total,
        'page': page,
        'page_size': page_size,
    }


def create_network_ad(data: Dict[str, Any], actor: str = 'system', app=None) -> Dict[str, Any]:
    app = app or current_app
    status = (data.get('status') or '').strip()
    domain_name = (data.get('domain_name') or data.get('domain') or '').strip()
    fqdn = (data.get('fqdn') or '').strip() or ''
    role = (data.get('role') or '').strip()

    fqdn_count = _coerce_int(data.get('fqdn_count') or data.get('fqdn_cnt') or data.get('fqdnCount'))
    account_count = _coerce_int(data.get('account_count') or data.get('account_cnt') or data.get('accountCount') or data.get('total_account_cnt') or data.get('totalAccountCnt'))

    if not status:
        raise ValueError('Status is required.')
    if not domain_name:
        raise ValueError('Domain name is required.')
    if not role:
        raise ValueError('Role is required.')

    is_standby = _coerce_yn(data.get('is_standby') or data.get('standby') or data.get('isStandby'))
    total_cnt = _coerce_int(data.get('total_account_cnt') or data.get('totalAccountCnt'))
    active_cnt = _coerce_int(data.get('active_account_cnt') or data.get('activeAccountCnt'))
    main_groups = (data.get('main_groups') or data.get('main_group') or data.get('mainGroups') or '').strip() or None
    remark = (data.get('remark') or data.get('note') or '').strip() or None

    fqdn_count = int(fqdn_count or 0)
    account_count = int(account_count or 0)

    timestamp = _now()
    with _get_connection(app) as conn:
        # NOTE: This table may exist with slightly different schemas across dev DBs.
        # Build the INSERT based on the columns actually present to avoid
        # OperationalError like "X values for Y columns".
        table_cols = {r['name'] for r in conn.execute(f"PRAGMA table_info({TABLE_NAME})").fetchall()}
        insert_order = [
            'status',
            'domain_name',
            'fqdn',
            'fqdn_count',
            'role',
            'is_standby',
            'total_account_cnt',
            'active_account_cnt',
            'account_count',
            'main_groups',
            'remark',
            'created_at',
            'updated_at',
        ]
        values_by_col = {
            'status': status,
            'domain_name': domain_name,
            'fqdn': fqdn,
            'fqdn_count': fqdn_count,
            'role': role,
            'is_standby': is_standby,
            'total_account_cnt': total_cnt,
            'active_account_cnt': active_cnt,
            'account_count': account_count,
            'main_groups': main_groups,
            'remark': remark,
            'created_at': timestamp,
            'updated_at': timestamp,
        }
        cols = [c for c in insert_order if c in table_cols]
        placeholders = ', '.join(['?'] * len(cols))
        col_sql = ', '.join(cols)
        sql = f"INSERT INTO {TABLE_NAME} ({col_sql}) VALUES ({placeholders})"
        params = tuple(values_by_col[c] for c in cols)
        try:
            cur = conn.execute(sql, params)
        except sqlite3.OperationalError:
            logger.exception(
                'network_ad insert failed: sql=%s cols=%s params_len=%s',
                sql,
                cols,
                len(params),
            )
            raise
        ad_id = int(cur.lastrowid)
        conn.commit()
        row = conn.execute(f"SELECT * FROM {TABLE_NAME} WHERE ad_id = ?", (ad_id,)).fetchone()
        record = _row_to_dict(row)

    try:
        append_network_ad_log(
            ad_id,
            tab_key='gov_ad_policy_detail',
            entity='AD',
            action='CREATE',
            actor=actor,
            message=f"AD 등록: {record.get('domain_name') or record.get('domain')}",
            diff={'after': record},
            app=app,
        )
    except Exception:
        logger.exception('Failed to append AD create log')
    return record


def update_network_ad(ad_id: int, data: Dict[str, Any], actor: str = 'system', app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    existing = get_network_ad(ad_id, app=app)
    if not existing:
        return None

    fields: List[str] = []
    params: List[Any] = []

    if 'status' in data:
        status = (data.get('status') or '').strip()
        if not status:
            raise ValueError('Status cannot be empty.')
        fields.append('status = ?')
        params.append(status)

    if 'domain_name' in data or 'domain' in data:
        domain_name = (data.get('domain_name') or data.get('domain') or '').strip()
        if not domain_name:
            raise ValueError('Domain name cannot be empty.')
        fields.append('domain_name = ?')
        params.append(domain_name)

    if 'fqdn' in data:
        fqdn = (data.get('fqdn') or '').strip() or ''
        fields.append('fqdn = ?')
        params.append(fqdn)

    if 'fqdn_count' in data or 'fqdn_cnt' in data or 'fqdnCount' in data:
        value = _coerce_int(data.get('fqdn_count') or data.get('fqdn_cnt') or data.get('fqdnCount'))
        fields.append('fqdn_count = ?')
        params.append(int(value or 0))

    if 'role' in data:
        role = (data.get('role') or '').strip()
        if not role:
            raise ValueError('Role cannot be empty.')
        fields.append('role = ?')
        params.append(role)

    if 'is_standby' in data or 'standby' in data or 'isStandby' in data:
        fields.append('is_standby = ?')
        params.append(_coerce_yn(data.get('is_standby') or data.get('standby') or data.get('isStandby')))

    if 'total_account_cnt' in data or 'totalAccountCnt' in data:
        fields.append('total_account_cnt = ?')
        params.append(_coerce_int(data.get('total_account_cnt') or data.get('totalAccountCnt')))

    if 'active_account_cnt' in data or 'activeAccountCnt' in data:
        fields.append('active_account_cnt = ?')
        params.append(_coerce_int(data.get('active_account_cnt') or data.get('activeAccountCnt')))

    if 'account_count' in data or 'account_cnt' in data or 'accountCount' in data:
        value = _coerce_int(data.get('account_count') or data.get('account_cnt') or data.get('accountCount'))
        fields.append('account_count = ?')
        params.append(int(value or 0))

    if 'main_groups' in data or 'main_group' in data or 'mainGroups' in data:
        value = (data.get('main_groups') or data.get('main_group') or data.get('mainGroups') or '').strip() or None
        fields.append('main_groups = ?')
        params.append(value)

    if 'remark' in data or 'note' in data:
        value = (data.get('remark') or data.get('note') or '').strip() or None
        fields.append('remark = ?')
        params.append(value)

    if not fields:
        return get_network_ad(ad_id, app=app)

    fields.append('updated_at = ?')
    params.append(_now())

    with _get_connection(app) as conn:
        params.append(ad_id)
        conn.execute(
            f"UPDATE {TABLE_NAME} SET {', '.join(fields)} WHERE ad_id = ?",
            params,
        )
        conn.commit()
        row = conn.execute(f"SELECT * FROM {TABLE_NAME} WHERE ad_id = ?", (ad_id,)).fetchone()
        updated = _row_to_dict(row) if row else None

    if updated:
        try:
            before = existing
            after = updated
            diff: Dict[str, Any] = {}
            for k in (
                'status',
                'domain_name',
                'fqdn',
                'fqdn_count',
                'role',
                'is_standby',
                'total_account_cnt',
                'active_account_cnt',
                'account_count',
                'main_groups',
                'remark',
            ):
                if before.get(k) != after.get(k):
                    diff[k] = {'from': before.get(k), 'to': after.get(k)}
            if diff:
                append_network_ad_log(
                    ad_id,
                    tab_key='gov_ad_policy_detail',
                    entity='AD',
                    action='UPDATE',
                    actor=actor,
                    message=f"AD 수정: {after.get('domain_name') or after.get('domain')}",
                    diff=diff,
                    app=app,
                )
        except Exception:
            logger.exception('Failed to append AD update log')
    return updated


def delete_network_ad(ad_id: int, actor: str = 'system', app=None) -> int:
    app = app or current_app
    existing = get_network_ad(ad_id, app=app)
    with _get_connection(app) as conn:
        cur = conn.execute(f"DELETE FROM {TABLE_NAME} WHERE ad_id = ?", (ad_id,))
        conn.commit()
        deleted = int(cur.rowcount or 0)
    if deleted and existing:
        try:
            append_network_ad_log(
                ad_id,
                tab_key='gov_ad_policy_detail',
                entity='AD',
                action='DELETE',
                actor=actor,
                message=f"AD 삭제: {existing.get('domain_name') or existing.get('domain')}",
                diff={'before': existing},
                app=app,
            )
        except Exception:
            logger.exception('Failed to append AD delete log')
    return deleted


def list_network_ad_accounts(ad_id: int, app=None) -> List[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        rows = conn.execute(
            f"SELECT * FROM {ACCOUNT_TABLE_NAME} WHERE ad_id = ? ORDER BY account_id DESC",
            (int(ad_id),),
        ).fetchall()
        items = [_row_to_account_dict(r) for r in rows]

        # Best-effort: resolve owner_dept_id -> org_department label (same sqlite DB)
        try:
            dept_ids = sorted({int(it.get('owner_dept_id')) for it in items if it.get('owner_dept_id') not in (None, '')})
        except Exception:
            dept_ids = []
        if dept_ids and _table_exists(conn, 'org_department'):
            try:
                cols = {r[1] for r in conn.execute("PRAGMA table_info(org_department)").fetchall()}
            except Exception:
                cols = set()
            wanted = [c for c in ('id', 'dept_name', 'dept_code') if c in cols]
            if 'id' in wanted and 'dept_name' in wanted:
                placeholders = ','.join(['?'] * len(dept_ids))
                try:
                    dept_rows = conn.execute(
                        f"SELECT {', '.join(wanted)} FROM org_department WHERE id IN ({placeholders})",
                        dept_ids,
                    ).fetchall()
                    dept_map = {}
                    for r in dept_rows:
                        try:
                            dept_map[int(r['id'])] = {
                                'id': int(r['id']),
                                'dept_name': (r['dept_name'] if 'dept_name' in r.keys() else None) or '',
                                'dept_code': (r['dept_code'] if 'dept_code' in r.keys() else None),
                            }
                        except Exception:
                            continue
                    for it in items:
                        did = it.get('owner_dept_id')
                        if did in (None, ''):
                            continue
                        try:
                            did_int = int(did)
                        except Exception:
                            continue
                        d = dept_map.get(did_int)
                        if not d:
                            continue
                        it['owner_dept'] = d
                        it['owner_dept_name'] = d.get('dept_name') or ''
                except Exception:
                    logger.exception('Failed to resolve org_department for AD accounts')

        # Best-effort: resolve owner_user_id -> user profile data (same sqlite DB)
        try:
            owner_ids = sorted(
                {int(it.get('owner_user_id')) for it in items if it.get('owner_user_id') not in (None, '')}
            )
        except Exception:
            owner_ids = []
        if owner_ids and _table_exists(conn, 'org_user'):
            try:
                cols = {r[1] for r in conn.execute("PRAGMA table_info(org_user)").fetchall()}
            except Exception:
                cols = set()
            wanted = []
            for c in ('id', 'emp_no', 'name', 'department', 'department_id'):
                if c in cols:
                    wanted.append(c)
            if 'id' in wanted and ('name' in wanted or 'emp_no' in wanted):
                placeholders = ','.join(['?'] * len(owner_ids))
                try:
                    user_rows = conn.execute(
                        f"SELECT {', '.join(wanted)} FROM org_user WHERE id IN ({placeholders})",
                        owner_ids,
                    ).fetchall()
                    user_map = {}
                    for r in user_rows:
                        user_map[int(r['id'])] = {
                            'id': int(r['id']),
                            'emp_no': (r['emp_no'] if 'emp_no' in r.keys() else None),
                            'name': (r['name'] if 'name' in r.keys() else None) or (r['emp_no'] if 'emp_no' in r.keys() else None),
                            'department': (r['department'] if 'department' in r.keys() else None) or '',
                            'department_id': (r['department_id'] if 'department_id' in r.keys() else None),
                        }
                    for it in items:
                        oid = it.get('owner_user_id')
                        if oid in (None, ''):
                            continue
                        try:
                            oid_int = int(oid)
                        except Exception:
                            continue
                        u = user_map.get(oid_int)
                        if not u:
                            continue
                        it['owner_user'] = u
                        it['owner_user_name'] = u.get('name') or ''
                        it['owner_department'] = u.get('department') or ''
                        it['owner_department_id'] = u.get('department_id')
                except Exception:
                    logger.exception('Failed to resolve org_user for AD accounts')

        return items


def create_network_ad_account(ad_id: int, data: Dict[str, Any], actor: str = 'system', app=None) -> Dict[str, Any]:
    app = app or current_app
    username = (data.get('username') or '').strip()
    if not username:
        raise ValueError('계정명(username)은 필수입니다.')
    display_name = (data.get('display_name') or data.get('displayName') or '').strip() or None
    account_type = (data.get('account_type') or data.get('accountType') or 'SERVICE').strip() or 'SERVICE'
    purpose = (data.get('purpose') or '').strip() or None
    owner = (data.get('owner') or '').strip() or None
    owner_user_id = data.get('owner_user_id') if 'owner_user_id' in data else data.get('ownerUserId')
    owner_dept_id = data.get('owner_dept_id') if 'owner_dept_id' in data else data.get('ownerDeptId')
    privilege = (data.get('privilege') or '').strip() or None
    try:
        owner_user_id = int(owner_user_id) if owner_user_id not in (None, '') else None
    except (TypeError, ValueError):
        owner_user_id = None
    try:
        owner_dept_id = int(owner_dept_id) if owner_dept_id not in (None, '') else None
    except (TypeError, ValueError):
        owner_dept_id = None

    # Best-effort: if org_user is available and owner_user_id provided, infer dept_id and owner label
    if owner_user_id and (owner_dept_id is None or owner is None):
        try:
            with _get_connection(app) as conn:
                if _table_exists(conn, 'org_user'):
                    cols = {r[1] for r in conn.execute("PRAGMA table_info(org_user)").fetchall()}
                    select_cols = [c for c in ('id', 'name', 'emp_no', 'department', 'department_id') if c in cols]
                    if 'id' in select_cols:
                        row = conn.execute(
                            f"SELECT {', '.join(select_cols)} FROM org_user WHERE id = ?",
                            (int(owner_user_id),),
                        ).fetchone()
                    else:
                        row = None
            if row:
                if owner_dept_id is None and 'department_id' in row.keys():
                    try:
                        owner_dept_id = int(row['department_id']) if row['department_id'] is not None else None
                    except Exception:
                        owner_dept_id = owner_dept_id
                if owner is None:
                    name = (row['name'] if 'name' in row.keys() else None) or (row['emp_no'] if 'emp_no' in row.keys() else None) or ''
                    dept = (row['department'] if 'department' in row.keys() else None) or ''
                    owner = f"{dept} {name}".strip() if dept else str(name).strip() or None
        except Exception:
            # keep best-effort only
            pass
    status = (data.get('status') or 'ACTIVE').strip() or 'ACTIVE'
    password_rotated_at = (data.get('password_rotated_at') or data.get('passwordRotatedAt') or '').strip() or None
    password_expires_at = (data.get('password_expires_at') or data.get('passwordExpiresAt') or '').strip() or None
    note = (data.get('note') or '').strip() or None

    timestamp = _now()
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"""
            INSERT INTO {ACCOUNT_TABLE_NAME} (
                ad_id, username, display_name, account_type, purpose, owner, owner_user_id, owner_dept_id, privilege, status,
                password_rotated_at, password_expires_at, note, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                int(ad_id),
                username,
                display_name,
                account_type,
                purpose,
                owner,
                owner_user_id,
                owner_dept_id,
                privilege,
                status,
                password_rotated_at,
                password_expires_at,
                note,
                timestamp,
                timestamp,
            ),
        )
        account_id = int(cur.lastrowid)
        conn.commit()
        row = conn.execute(
            f"SELECT * FROM {ACCOUNT_TABLE_NAME} WHERE account_id = ?",
            (account_id,),
        ).fetchone()
        record = _row_to_account_dict(row)

    try:
        append_network_ad_log(
            int(ad_id),
            tab_key='gov_ad_policy_account',
            entity='ACCOUNT',
            entity_id=record.get('account_id'),
            action='CREATE',
            actor=actor,
            message=f"계정 {record.get('username')} 추가",
            diff={'after': record},
            app=app,
        )
    except Exception:
        logger.exception('Failed to append AD account create log')
    return record


def get_network_ad_account(account_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT * FROM {ACCOUNT_TABLE_NAME} WHERE account_id = ?",
            (int(account_id),),
        ).fetchone()
    return _row_to_account_dict(row) if row else None


def update_network_ad_account(account_id: int, data: Dict[str, Any], actor: str = 'system', app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    existing = get_network_ad_account(account_id, app=app)
    if not existing:
        return None

    fields: List[str] = []
    params: List[Any] = []

    if 'username' in data:
        username = (data.get('username') or '').strip()
        if not username:
            raise ValueError('계정명(username)은 비울 수 없습니다.')
        fields.append('username = ?')
        params.append(username)
    if 'display_name' in data or 'displayName' in data:
        value = (data.get('display_name') or data.get('displayName') or '').strip() or None
        fields.append('display_name = ?')
        params.append(value)
    if 'account_type' in data or 'accountType' in data:
        value = (data.get('account_type') or data.get('accountType') or '').strip() or 'SERVICE'
        fields.append('account_type = ?')
        params.append(value)
    if 'purpose' in data:
        value = (data.get('purpose') or '').strip() or None
        fields.append('purpose = ?')
        params.append(value)
    if 'owner' in data:
        value = (data.get('owner') or '').strip() or None
        fields.append('owner = ?')
        params.append(value)
    if 'owner_user_id' in data or 'ownerUserId' in data:
        raw = data.get('owner_user_id') if 'owner_user_id' in data else data.get('ownerUserId')
        try:
            value = int(raw) if raw not in (None, '') else None
        except (TypeError, ValueError):
            value = None
        fields.append('owner_user_id = ?')
        params.append(value)
    if 'owner_dept_id' in data or 'ownerDeptId' in data:
        raw = data.get('owner_dept_id') if 'owner_dept_id' in data else data.get('ownerDeptId')
        try:
            value = int(raw) if raw not in (None, '') else None
        except (TypeError, ValueError):
            value = None
        fields.append('owner_dept_id = ?')
        params.append(value)
    if 'privilege' in data:
        value = (data.get('privilege') or '').strip() or None
        fields.append('privilege = ?')
        params.append(value)
    if 'status' in data:
        value = (data.get('status') or '').strip() or 'ACTIVE'
        fields.append('status = ?')
        params.append(value)
    if 'password_rotated_at' in data or 'passwordRotatedAt' in data:
        value = (data.get('password_rotated_at') or data.get('passwordRotatedAt') or '').strip() or None
        fields.append('password_rotated_at = ?')
        params.append(value)
    if 'password_expires_at' in data or 'passwordExpiresAt' in data:
        value = (data.get('password_expires_at') or data.get('passwordExpiresAt') or '').strip() or None
        fields.append('password_expires_at = ?')
        params.append(value)
    if 'note' in data:
        value = (data.get('note') or '').strip() or None
        fields.append('note = ?')
        params.append(value)

    if not fields:
        return existing

    fields.append('updated_at = ?')
    params.append(_now())

    with _get_connection(app) as conn:
        params.append(int(account_id))
        conn.execute(
            f"UPDATE {ACCOUNT_TABLE_NAME} SET {', '.join(fields)} WHERE account_id = ?",
            params,
        )
        conn.commit()
        row = conn.execute(
            f"SELECT * FROM {ACCOUNT_TABLE_NAME} WHERE account_id = ?",
            (int(account_id),),
        ).fetchone()
        updated = _row_to_account_dict(row) if row else None

    if updated:
        try:
            diff: Dict[str, Any] = {}
            for k in (
                'username',
                'display_name',
                'account_type',
                'purpose',
                'owner',
                'owner_user_id',
                'owner_dept_id',
                'privilege',
                'status',
                'password_rotated_at',
                'password_expires_at',
                'note',
            ):
                if existing.get(k) != updated.get(k):
                    diff[k] = {'from': existing.get(k), 'to': updated.get(k)}
            if diff:
                append_network_ad_log(
                    int(updated.get('ad_id')),
                    tab_key='gov_ad_policy_account',
                    entity='ACCOUNT',
                    entity_id=int(account_id),
                    action='UPDATE',
                    actor=actor,
                    message=f"계정 {updated.get('username')} 수정 (데이터 {len(diff)}개 수정)",
                    diff=diff,
                    app=app,
                )
        except Exception:
            logger.exception('Failed to append AD account update log')
    return updated


def delete_network_ad_account(account_id: int, actor: str = 'system', app=None) -> int:
    app = app or current_app
    existing = get_network_ad_account(account_id, app=app)
    if not existing:
        return 0
    ad_id = int(existing.get('ad_id'))
    with _get_connection(app) as conn:
        cur = conn.execute(
            f"DELETE FROM {ACCOUNT_TABLE_NAME} WHERE account_id = ?",
            (int(account_id),),
        )
        conn.commit()
        deleted = int(cur.rowcount or 0)
    if deleted:
        try:
            append_network_ad_log(
                ad_id,
                tab_key='gov_ad_policy_account',
                entity='ACCOUNT',
                entity_id=int(account_id),
                action='DELETE',
                actor=actor,
                message=f"계정 {existing.get('username')} 삭제",
                diff={'before': existing},
                app=app,
            )
        except Exception:
            logger.exception('Failed to append AD account delete log')
    return deleted


def list_network_ad_logs(
    ad_id: int,
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
            WHERE ad_id = ?
            ORDER BY created_at DESC, log_id DESC
            LIMIT ? OFFSET ?
            """,
            (int(ad_id), page_size, offset),
        ).fetchall()
        total = conn.execute(
            f"SELECT COUNT(1) FROM {LOG_TABLE_NAME} WHERE ad_id = ?",
            (int(ad_id),),
        ).fetchone()[0]
    return {
        'items': [_row_to_log_dict(r) for r in rows],
        'total': int(total or 0),
        'page': page,
        'page_size': page_size,
    }
