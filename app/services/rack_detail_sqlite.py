import os
import re
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import urlparse

from flask import current_app


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def resolve_sqlite_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')

    # Keep path resolution consistent with org_rack_service so that
    # /api/org-racks and /api/racks/<rack_code> read the same database.
    if not uri.startswith('sqlite'):
        fallback = app.config.get('ORG_RACK_SQLITE_PATH') or app.config.get('ORG_CENTER_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'org_rack.db')

    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''

    # sqlite:///:memory:
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'org_rack.db')

    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"

    # sqlite:///file.db -> path='/file.db' (single leading / = relative)
    # sqlite:////abs.db  -> path='//abs.db' (double leading / = absolute)
    if path.startswith('/') and not path.startswith('//'):
        path = path.lstrip('/')

    if os.path.isabs(path):
        return os.path.abspath(path)

    relative = path.lstrip('/')
    return os.path.abspath(os.path.join(app.instance_path, relative))


def _ensure_parent_dir(path: str) -> None:
    directory = os.path.dirname(path)
    if directory and not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)


def get_connection(app=None) -> sqlite3.Connection:
    app = app or current_app
    db_path = resolve_sqlite_db_path(app)
    _ensure_parent_dir(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute('PRAGMA foreign_keys = ON')
    except Exception:
        pass
    return conn


@contextmanager
def sqlite_tx(app=None) -> Iterable[sqlite3.Connection]:
    conn = get_connection(app)
    try:
        conn.execute('BEGIN')
        yield conn
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        try:
            conn.close()
        except Exception:
            pass


RACK_WORK_HISTORY_TABLE = 'rack_work_history'
RACK_CHANGE_HISTORY_TABLE = 'rack_change_history'
RACK_FILE_TABLE = 'rack_file'


def rack_tables_ddl() -> str:
    # Note: No changes to org_rack (explicit requirement).
    return f"""
CREATE TABLE IF NOT EXISTS {RACK_WORK_HISTORY_TABLE} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rack_code TEXT NOT NULL,
    work_date TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_at TEXT,
    updated_by TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_{RACK_WORK_HISTORY_TABLE}_rack_code ON {RACK_WORK_HISTORY_TABLE}(rack_code);
CREATE INDEX IF NOT EXISTS idx_{RACK_WORK_HISTORY_TABLE}_is_deleted ON {RACK_WORK_HISTORY_TABLE}(is_deleted);

CREATE TABLE IF NOT EXISTS {RACK_CHANGE_HISTORY_TABLE} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rack_code TEXT NOT NULL,
    changed_at TEXT NOT NULL,
    field_name TEXT NOT NULL,
    before_value TEXT,
    after_value TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_at TEXT,
    updated_by TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_{RACK_CHANGE_HISTORY_TABLE}_rack_code ON {RACK_CHANGE_HISTORY_TABLE}(rack_code);
CREATE INDEX IF NOT EXISTS idx_{RACK_CHANGE_HISTORY_TABLE}_is_deleted ON {RACK_CHANGE_HISTORY_TABLE}(is_deleted);

CREATE TABLE IF NOT EXISTS {RACK_FILE_TABLE} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rack_code TEXT NOT NULL,
    file_role TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    stored_relpath TEXT NOT NULL,
    content_type TEXT,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_at TEXT,
    updated_by TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_{RACK_FILE_TABLE}_rack_code ON {RACK_FILE_TABLE}(rack_code);
CREATE INDEX IF NOT EXISTS idx_{RACK_FILE_TABLE}_role ON {RACK_FILE_TABLE}(file_role);
CREATE INDEX IF NOT EXISTS idx_{RACK_FILE_TABLE}_is_deleted ON {RACK_FILE_TABLE}(is_deleted);
""".strip()


def ensure_rack_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(rack_tables_ddl())


def ok(data: Any = None, message: str = '') -> Dict[str, Any]:
    return {'success': True, 'data': data, 'message': message}


def fail(message: str, data: Any = None) -> Dict[str, Any]:
    return {'success': False, 'data': data, 'message': message}


def sanitize_int(value: Any, *, minimum: int = 0) -> Optional[int]:
    if value is None or value == '':
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return max(minimum, parsed)


def paginate(page: Any, page_size: Any, *, default_size: int = 20, max_size: int = 100) -> Tuple[int, int, int]:
    p = sanitize_int(page, minimum=1) or 1
    ps = sanitize_int(page_size, minimum=1) or default_size
    ps = min(ps, max_size)
    offset = (p - 1) * ps
    return p, ps, offset


def uploads_base_dir(app=None) -> str:
    app = app or current_app
    base = os.path.join(app.instance_path, 'uploads', 'racks')
    os.makedirs(base, exist_ok=True)
    return base


def make_storage_name(original_filename: str) -> str:
    safe_name = (original_filename or 'file').replace('..', '_').replace('/', '_').replace('\\', '_')
    _, ext = os.path.splitext(safe_name)
    return f"{uuid.uuid4().hex}{ext}"


def normalize_role(role: Optional[str]) -> Optional[str]:
    if not role:
        return None
    role = role.strip().upper()
    if role in {'FRONT', 'REAR', 'DIAGRAM', 'ATTACHMENT'}:
        return role
    return None
