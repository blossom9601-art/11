import logging
from flask import current_app
from sqlalchemy import text
from app.models import db

logger = logging.getLogger(__name__)


def _execute(conn, statement: str) -> None:
    conn.execute(text(statement))


def init_chat_tables(app=None) -> None:
    """Ensure chat-related tables exist in dev_blossom.db."""
    app = app or current_app
    if getattr(app, 'config', {}).get('TESTING'):
        return
    engine = db.engine if app else db.get_engine()
    try:
        with engine.begin() as conn:
            _execute(
                conn,
                """
                CREATE TABLE IF NOT EXISTS msg_room (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    room_type VARCHAR(64) NOT NULL,
                    room_name VARCHAR(255),
                    direct_key VARCHAR(255) UNIQUE,
                    last_message_preview TEXT,
                    last_message_at TEXT,
                    created_by_user_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT,
                    updated_by_user_id INTEGER,
                    is_deleted INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (created_by_user_id) REFERENCES org_user(id),
                    FOREIGN KEY (updated_by_user_id) REFERENCES org_user(id)
                )
                """,
            )
            _execute(
                conn,
                """
                CREATE TABLE IF NOT EXISTS msg_message (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    room_id INTEGER NOT NULL,
                    sender_user_id INTEGER NOT NULL,
                    content_type VARCHAR(64) NOT NULL DEFAULT 'TEXT',
                    content_text TEXT,
                    file_id INTEGER,
                    reply_to_message_id INTEGER,
                    is_system INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    edited_at TEXT,
                    is_deleted INTEGER NOT NULL DEFAULT 0,
                    deleted_at TEXT,
                    FOREIGN KEY (room_id) REFERENCES msg_room(id),
                    FOREIGN KEY (sender_user_id) REFERENCES org_user(id),
                    FOREIGN KEY (reply_to_message_id) REFERENCES msg_message(id)
                )
                """,
            )
            _execute(
                conn,
                """
                CREATE TABLE IF NOT EXISTS msg_room_member (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    room_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    member_role VARCHAR(32) NOT NULL DEFAULT 'MEMBER',
                    is_favorite INTEGER NOT NULL DEFAULT 0,
                    is_muted INTEGER NOT NULL DEFAULT 0,
                    last_read_message_id INTEGER,
                    last_read_at TEXT,
                    unread_count_cached INTEGER DEFAULT 0,
                    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    left_at TEXT,
                    FOREIGN KEY (room_id) REFERENCES msg_room(id),
                    FOREIGN KEY (user_id) REFERENCES org_user(id),
                    FOREIGN KEY (last_read_message_id) REFERENCES msg_message(id),
                    UNIQUE (room_id, user_id)
                )
                """,
            )
            _execute(
                conn,
                """
                CREATE TABLE IF NOT EXISTS msg_file (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    message_id INTEGER NOT NULL,
                    file_path TEXT NOT NULL,
                    original_name TEXT NOT NULL,
                    file_size INTEGER,
                    content_type VARCHAR(128),
                    uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    uploaded_by_user_id INTEGER NOT NULL,
                    FOREIGN KEY (message_id) REFERENCES msg_message(id),
                    FOREIGN KEY (uploaded_by_user_id) REFERENCES org_user(id)
                )
                """,
            )
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_room_type ON msg_room(room_type)")
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_room_direct_key ON msg_room(direct_key)")
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_room_member_user_id ON msg_room_member(user_id)")
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_message_room_id ON msg_message(room_id)")
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_message_sender_id ON msg_message(sender_user_id)")
            logger.info('Chat tables are ready')
    except Exception:
        logger.exception('Failed to initialize chat tables')
        raise
