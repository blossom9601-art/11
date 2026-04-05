import logging
import os
import re
import sqlite3
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'insight_item'
LIKE_TABLE_NAME = 'insight_item_like'

_ALLOWED_CATEGORIES = {
    'trend': '동향',
    'security': '보안',
    'report': '지식',
    'technical': '기술',
}


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    """Resolve the SQLite file used by SQLAlchemy, and co-locate this table there.

    This avoids splitting data across multiple DB files.
    """

    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not str(uri).startswith('sqlite'):
        fallback = app.config.get('INSIGHT_ITEM_SQLITE_PATH')
        if fallback:
            return os.path.abspath(fallback)
        return os.path.join(app.instance_path, 'insight_item.db')

    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''

    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'insight_item.db')

    if netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"

    relative = path.lstrip('/')
    if relative and not os.path.isabs(relative):
        if os.path.basename(relative) == relative:
            return os.path.abspath(os.path.join(app.instance_path, relative))
        return os.path.abspath(os.path.join(_project_root(app), relative))

    if os.path.isabs(path):
        return os.path.abspath(path)

    return os.path.abspath(os.path.join(app.instance_path, 'insight_item.db'))


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


def _sanitize_category(value: Any) -> Optional[str]:
    raw = (value or '').strip().lower()
    if raw in _ALLOWED_CATEGORIES:
        return raw
    return None


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        'id': row['id'],
        'category': row['category'],
        'title': row['title'],
        'author': row['author'] or '',
        'created_at': row['created_at'],
        'views': int(row['views'] or 0),
        'likes': int(row['likes'] or 0),
    }

    # Optional columns (backwards compatible with older DBs)
    try:
        out['content_html'] = row['content_html'] if 'content_html' in row.keys() else ''
    except Exception:
        out['content_html'] = ''
    try:
        out['tags'] = row['tags'] if 'tags' in row.keys() else ''
    except Exception:
        out['tags'] = ''
    try:
        out['updated_at'] = row['updated_at'] if 'updated_at' in row.keys() else None
    except Exception:
        out['updated_at'] = None

    return out


def _table_columns(conn: sqlite3.Connection, table: str) -> List[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return [str(r['name']) for r in rows if r and 'name' in r.keys()]


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, ddl: str) -> None:
    cols = set(_table_columns(conn, table))
    if column in cols:
        return
    conn.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")


def _uploads_root(app) -> str:
    # Prefer repository-level uploads/ to match existing patterns.
    return os.path.join(_project_root(app), 'uploads', 'insight_items')


def _ensure_dir(path: str) -> None:
    if not path:
        return
    os.makedirs(path, exist_ok=True)


def _guess_mime(filename: str) -> str:
    name = (filename or '').lower()
    if name.endswith('.png'):
        return 'image/png'
    if name.endswith('.jpg') or name.endswith('.jpeg'):
        return 'image/jpeg'
    if name.endswith('.pdf'):
        return 'application/pdf'
    if name.endswith('.doc'):
        return 'application/msword'
    if name.endswith('.docx'):
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    if name.endswith('.xls'):
        return 'application/vnd.ms-excel'
    if name.endswith('.xlsx'):
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    return 'application/octet-stream'


def init_insight_item_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    category TEXT NOT NULL,
                    title TEXT NOT NULL,
                    author TEXT,
                    created_at TEXT NOT NULL,
                    views INTEGER NOT NULL DEFAULT 0,
                    likes INTEGER NOT NULL DEFAULT 0,
                    is_deleted INTEGER NOT NULL DEFAULT 0
                )
                """
            )

            # Backfill/extend schema for editor fields
            _ensure_column(conn, TABLE_NAME, 'content_html', 'content_html TEXT')
            _ensure_column(conn, TABLE_NAME, 'tags', 'tags TEXT')
            _ensure_column(conn, TABLE_NAME, 'updated_at', 'updated_at TEXT')

            # Attachment metadata table
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS insight_item_attachment (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id INTEGER NOT NULL,
                    orig_name TEXT NOT NULL,
                    stored_name TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL DEFAULT 0,
                    mime_type TEXT,
                    created_at TEXT NOT NULL,
                    is_deleted INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_insight_item_attachment_item_id ON insight_item_attachment(item_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_insight_item_attachment_deleted ON insight_item_attachment(is_deleted)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_category ON {TABLE_NAME}(category)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_deleted ON {TABLE_NAME}(is_deleted)"
            )

            # Per-user likes table (1 like per user per item)
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {LIKE_TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id INTEGER NOT NULL,
                    actor_user_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(item_id, actor_user_id)
                )
                """
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{LIKE_TABLE_NAME}_item_id ON {LIKE_TABLE_NAME}(item_id)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{LIKE_TABLE_NAME}_actor_user_id ON {LIKE_TABLE_NAME}(actor_user_id)"
            )
    except Exception:
        logger.exception('Failed to init insight_item table')
        raise


def has_user_liked_insight_item(app=None, *, item_id: int, actor_user_id: int) -> bool:
    app = app or current_app
    try:
        iid = int(item_id)
        uid = int(actor_user_id)
    except Exception:
        return False
    if iid <= 0 or uid <= 0:
        return False

    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT 1 AS ok FROM {LIKE_TABLE_NAME} WHERE item_id = ? AND actor_user_id = ? LIMIT 1",
            (iid, uid),
        ).fetchone()
    return bool(row)


def like_insight_item_once(app=None, *, item_id: int, actor_user_id: int) -> tuple[Optional[Dict[str, Any]], bool]:
    """Register a like for this (item_id, actor_user_id) pair.

    Returns (item, liked_now). When the user already liked before, liked_now is False
    and the item's like count is not incremented.
    """

    app = app or current_app
    try:
        iid = int(item_id)
        uid = int(actor_user_id)
    except Exception:
        return None, False
    if iid <= 0 or uid <= 0:
        return None, False

    liked_now = False
    with _get_connection(app) as conn:
        # Ensure item exists
        row = conn.execute(
            f"SELECT id FROM {TABLE_NAME} WHERE id = ? AND is_deleted = 0",
            (iid,),
        ).fetchone()
        if not row:
            return None, False

        try:
            conn.execute(
                f"INSERT INTO {LIKE_TABLE_NAME} (item_id, actor_user_id, created_at) VALUES (?, ?, ?)",
                (iid, uid, _now()),
            )
            conn.execute(
                f"UPDATE {TABLE_NAME} SET likes = COALESCE(likes, 0) + 1 WHERE id = ? AND is_deleted = 0",
                (iid,),
            )
            liked_now = True
        except sqlite3.IntegrityError:
            liked_now = False

        out_row = conn.execute(
            f"SELECT id, category, title, author, created_at, views, likes FROM {TABLE_NAME} WHERE id = ?",
            (iid,),
        ).fetchone()

    return (_row_to_dict(out_row) if out_row else None), liked_now


def unlike_insight_item(app=None, *, item_id: int, actor_user_id: int) -> tuple[Optional[Dict[str, Any]], bool]:
    """Remove a previously registered like.

    Returns (item, unliked_now). When the user had not liked before, unliked_now is False
    and the item's like count is not decremented.
    """

    app = app or current_app
    try:
        iid = int(item_id)
        uid = int(actor_user_id)
    except Exception:
        return None, False
    if iid <= 0 or uid <= 0:
        return None, False

    unliked_now = False
    with _get_connection(app) as conn:
        # Ensure item exists
        row = conn.execute(
            f"SELECT id FROM {TABLE_NAME} WHERE id = ? AND is_deleted = 0",
            (iid,),
        ).fetchone()
        if not row:
            return None, False

        cur = conn.execute(
            f"DELETE FROM {LIKE_TABLE_NAME} WHERE item_id = ? AND actor_user_id = ?",
            (iid, uid),
        )
        if cur.rowcount:
            conn.execute(
                f"UPDATE {TABLE_NAME} SET likes = CASE WHEN COALESCE(likes, 0) > 0 THEN COALESCE(likes, 0) - 1 ELSE 0 END WHERE id = ? AND is_deleted = 0",
                (iid,),
            )
            unliked_now = True

        out_row = conn.execute(
            f"SELECT id, category, title, author, created_at, views, likes FROM {TABLE_NAME} WHERE id = ?",
            (iid,),
        ).fetchone()

    return (_row_to_dict(out_row) if out_row else None), unliked_now


def list_insight_items(
    app=None,
    *,
    category: str,
    q: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Tuple[List[Dict[str, Any]], int]:
    app = app or current_app
    cat = _sanitize_category(category)
    if not cat:
        return [], 0

    q = (q or '').strip()
    limit = max(1, min(100, int(limit or 10)))
    offset = max(0, int(offset or 0))

    where = [f"category = ?", f"is_deleted = 0"]
    params: List[Any] = [cat]

    if q:
        like = f"%{q}%"
        where.append("(title LIKE ? OR author LIKE ?)")
        params.extend([like, like])

    where_sql = " AND ".join(where)

    with _get_connection(app) as conn:
        total_row = conn.execute(
            f"SELECT COUNT(*) AS cnt FROM {TABLE_NAME} WHERE {where_sql}",
            tuple(params),
        ).fetchone()
        total = int(total_row['cnt'] if total_row else 0)

        rows = conn.execute(
            f"""
            SELECT id, category, title, author, created_at, views, likes
            FROM {TABLE_NAME}
            WHERE {where_sql}
            ORDER BY id DESC
            LIMIT ? OFFSET ?
            """,
            tuple(params + [limit, offset]),
        ).fetchall()

        return [_row_to_dict(r) for r in rows], total


def create_insight_item(
    app=None,
    *,
    category: str,
    title: str,
    author: str,
    content_html: str = '',
    tags: str = '',
) -> Dict[str, Any]:
    app = app or current_app
    cat = _sanitize_category(category)
    if not cat:
        raise ValueError('invalid category')

    title_val = (title or '').strip()
    if not title_val:
        raise ValueError('title is required')

    author_val = (author or '').strip()
    content_val = (content_html or '').strip()
    tags_val = (tags or '').strip()
    created_at = _now()
    updated_at = _now()

    with _get_connection(app) as conn:
        cur = conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (category, title, author, created_at, updated_at, content_html, tags, views, likes, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0)
            """,
            (cat, title_val, author_val, created_at, updated_at, content_val, tags_val),
        )
        new_id = int(cur.lastrowid)
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (new_id,),
        ).fetchone()

    if not row:
        return {
            'id': new_id,
            'category': cat,
            'title': title_val,
            'author': author_val,
            'created_at': created_at,
            'updated_at': updated_at,
            'content_html': content_val,
            'tags': tags_val,
            'views': 0,
            'likes': 0,
        }

    return _row_to_dict(row)


def delete_insight_item(app=None, *, item_id: int) -> bool:
    app = app or current_app
    try:
        iid = int(item_id)
    except Exception:
        return False
    if iid <= 0:
        return False

    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET is_deleted = 1 WHERE id = ?",
            (iid,),
        )
        return bool(cur.rowcount)


def update_insight_item(
    app=None,
    *,
    item_id: int,
    title: str,
    author: str,
    content_html: str = '',
    tags: str = '',
) -> Optional[Dict[str, Any]]:
    app = app or current_app
    try:
        iid = int(item_id)
    except Exception:
        return None
    if iid <= 0:
        return None

    title_val = (title or '').strip()
    if not title_val:
        raise ValueError('title is required')

    author_val = (author or '').strip()
    content_val = (content_html or '').strip()
    tags_val = (tags or '').strip()
    updated_at = _now()

    with _get_connection(app) as conn:
        cur = conn.execute(
            f"UPDATE {TABLE_NAME} SET title = ?, author = ?, content_html = ?, tags = ?, updated_at = ? WHERE id = ? AND is_deleted = 0",
            (title_val, author_val, content_val, tags_val, updated_at, iid),
        )
        if not cur.rowcount:
            return None
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?",
            (iid,),
        ).fetchone()

    return _row_to_dict(row) if row else None


def get_insight_item(app=None, *, item_id: int) -> Optional[Dict[str, Any]]:
    app = app or current_app
    try:
        iid = int(item_id)
    except Exception:
        return None
    if iid <= 0:
        return None

    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ? AND is_deleted = 0",
            (iid,),
        ).fetchone()

        if not row:
            return None

        att_rows = conn.execute(
            """
            SELECT id, item_id, orig_name, stored_name, size_bytes, mime_type, created_at
            FROM insight_item_attachment
            WHERE item_id = ? AND is_deleted = 0
            ORDER BY id ASC
            """,
            (iid,),
        ).fetchall()

    item = _row_to_dict(row)
    item['attachments'] = [
        {
            'id': int(a['id']),
            'item_id': int(a['item_id']),
            'name': a['orig_name'],
            'stored': a['stored_name'],
            'size_bytes': int(a['size_bytes'] or 0),
            'mime_type': a['mime_type'] or _guess_mime(a['orig_name'] or ''),
            'created_at': a['created_at'],
        }
        for a in att_rows
    ]
    return item


def save_insight_item_attachments(
    app=None,
    *,
    item_id: int,
    files: List[Any],
) -> List[Dict[str, Any]]:
    """Persist uploaded files for an insight item and return attachment records.

    `files` are expected to be Werkzeug FileStorage-like objects.
    """

    app = app or current_app
    try:
        iid = int(item_id)
    except Exception:
        return []
    if iid <= 0:
        return []

    folder = os.path.join(_uploads_root(app), str(iid))
    _ensure_dir(folder)

    created_at = _now()
    out: List[Dict[str, Any]] = []

    with _get_connection(app) as conn:
        for f in (files or []):
            if not f:
                continue
            try:
                orig_name = (getattr(f, 'filename', None) or '').strip()
            except Exception:
                orig_name = ''
            if not orig_name:
                continue

            # Generate a stored filename; keep extension.
            _, ext = os.path.splitext(orig_name)
            ext = (ext or '')[:16]
            stored_name = f"{uuid.uuid4().hex}{ext}"
            abs_path = os.path.join(folder, stored_name)

            # Save
            try:
                f.save(abs_path)
            except Exception:
                # If FileStorage doesn't support .save, try reading.
                try:
                    data = f.read()
                    with open(abs_path, 'wb') as fp:
                        fp.write(data)
                except Exception:
                    continue

            try:
                size_bytes = int(os.path.getsize(abs_path))
            except Exception:
                size_bytes = 0

            mime = _guess_mime(orig_name)

            cur = conn.execute(
                """
                INSERT INTO insight_item_attachment (item_id, orig_name, stored_name, size_bytes, mime_type, created_at, is_deleted)
                VALUES (?, ?, ?, ?, ?, ?, 0)
                """,
                (iid, orig_name, stored_name, size_bytes, mime, created_at),
            )
            att_id = int(cur.lastrowid)
            out.append(
                {
                    'id': att_id,
                    'item_id': iid,
                    'name': orig_name,
                    'stored': stored_name,
                    'size_bytes': size_bytes,
                    'mime_type': mime,
                    'created_at': created_at,
                }
            )

    return out


def get_insight_item_attachment(app=None, *, item_id: int, attachment_id: int) -> Optional[Dict[str, Any]]:
    app = app or current_app
    try:
        iid = int(item_id)
        aid = int(attachment_id)
    except Exception:
        return None
    if iid <= 0 or aid <= 0:
        return None

    with _get_connection(app) as conn:
        row = conn.execute(
            """
            SELECT id, item_id, orig_name, stored_name, size_bytes, mime_type, created_at
            FROM insight_item_attachment
            WHERE id = ? AND item_id = ? AND is_deleted = 0
            """,
            (aid, iid),
        ).fetchone()

    if not row:
        return None

    folder = os.path.join(_uploads_root(app), str(iid))
    abs_path = os.path.join(folder, row['stored_name'])

    return {
        'id': int(row['id']),
        'item_id': int(row['item_id']),
        'name': row['orig_name'],
        'stored': row['stored_name'],
        'size_bytes': int(row['size_bytes'] or 0),
        'mime_type': row['mime_type'] or _guess_mime(row['orig_name'] or ''),
        'created_at': row['created_at'],
        'abs_path': abs_path,
    }


def delete_insight_item_attachment(app=None, *, item_id: int, attachment_id: int) -> bool:
    """Soft-delete an attachment record and best-effort remove its stored file."""

    app = app or current_app
    try:
        iid = int(item_id)
        aid = int(attachment_id)
    except Exception:
        return False
    if iid <= 0 or aid <= 0:
        return False

    stored_name = None
    with _get_connection(app) as conn:
        row = conn.execute(
            """
            SELECT stored_name
            FROM insight_item_attachment
            WHERE id = ? AND item_id = ? AND is_deleted = 0
            """,
            (aid, iid),
        ).fetchone()
        if not row:
            return False
        stored_name = row['stored_name']
        conn.execute(
            """
            UPDATE insight_item_attachment
            SET is_deleted = 1
            WHERE id = ? AND item_id = ? AND is_deleted = 0
            """,
            (aid, iid),
        )

    # Best-effort physical delete
    if stored_name:
        try:
            folder = os.path.join(_uploads_root(app), str(iid))
            abs_path = os.path.join(folder, stored_name)
            if os.path.exists(abs_path):
                os.remove(abs_path)
        except Exception:
            pass

    return True


def bump_insight_counter(app=None, *, item_id: int, field: str) -> Optional[Dict[str, Any]]:
    """Increment views/likes and return updated row."""

    app = app or current_app
    try:
        iid = int(item_id)
    except Exception:
        return None
    if iid <= 0:
        return None

    if field not in ('views', 'likes'):
        return None

    with _get_connection(app) as conn:
        conn.execute(
            f"UPDATE {TABLE_NAME} SET {field} = COALESCE({field}, 0) + 1 WHERE id = ? AND is_deleted = 0",
            (iid,),
        )
        row = conn.execute(
            f"SELECT id, category, title, author, created_at, views, likes FROM {TABLE_NAME} WHERE id = ?",
            (iid,),
        ).fetchone()

    return _row_to_dict(row) if row else None
