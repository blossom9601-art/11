import logging
import json
from flask import current_app
from sqlalchemy import text
from app.models import db

logger = logging.getLogger(__name__)


def _execute(conn, statement: str) -> None:
    conn.execute(text(statement))


def _execute_with_params(conn, statement: str, params: dict) -> None:
    conn.execute(text(statement), params)


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

            _execute(
                conn,
                """
                CREATE TABLE IF NOT EXISTS msg_pinned_message (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    room_id INTEGER NOT NULL,
                    message_id INTEGER NOT NULL,
                    pinned_by_user_id INTEGER NOT NULL,
                    pinned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    note VARCHAR(255),
                    FOREIGN KEY (room_id) REFERENCES msg_room(id),
                    FOREIGN KEY (message_id) REFERENCES msg_message(id),
                    FOREIGN KEY (pinned_by_user_id) REFERENCES org_user(id),
                    UNIQUE (room_id, message_id)
                )
                """,
            )
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_pinned_message_room_id ON msg_pinned_message(room_id)")

            _execute(
                conn,
                """
                CREATE TABLE IF NOT EXISTS msg_message_reaction (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    message_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    emoji VARCHAR(32) NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (message_id) REFERENCES msg_message(id),
                    FOREIGN KEY (user_id) REFERENCES org_user(id),
                    UNIQUE (message_id, user_id, emoji)
                )
                """,
            )
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_reaction_message_id ON msg_message_reaction(message_id)")
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_reaction_user_id ON msg_message_reaction(user_id)")

            _execute(
                conn,
                """
                CREATE TABLE IF NOT EXISTS msg_conversation (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_type VARCHAR(16) NOT NULL,
                    visibility VARCHAR(16) NOT NULL DEFAULT 'private',
                    title VARCHAR(255),
                    description TEXT,
                    owner_user_id INTEGER NOT NULL,
                    parent_conversation_id INTEGER,
                    parent_message_id INTEGER,
                    dm_key VARCHAR(255) UNIQUE,
                    last_message_id INTEGER,
                    last_message_preview TEXT,
                    last_message_at TEXT,
                    is_archived INTEGER NOT NULL DEFAULT 0,
                    is_deleted INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    created_by INTEGER NOT NULL,
                    updated_at TEXT,
                    updated_by INTEGER,
                    FOREIGN KEY (owner_user_id) REFERENCES org_user(id),
                    FOREIGN KEY (parent_conversation_id) REFERENCES msg_conversation(id),
                    FOREIGN KEY (created_by) REFERENCES org_user(id),
                    FOREIGN KEY (updated_by) REFERENCES org_user(id)
                )
                """,
            )
            _execute(
                conn,
                """
                CREATE TABLE IF NOT EXISTS msg_channel (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id INTEGER NOT NULL UNIQUE,
                    name VARCHAR(120) NOT NULL UNIQUE,
                    slug VARCHAR(140) UNIQUE,
                    channel_type VARCHAR(16) NOT NULL DEFAULT 'public',
                    description TEXT,
                    topic VARCHAR(255),
                    created_by INTEGER NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    archived_at TEXT,
                    FOREIGN KEY (conversation_id) REFERENCES msg_conversation(id),
                    FOREIGN KEY (created_by) REFERENCES org_user(id)
                )
                """,
            )
            _execute(
                conn,
                """
                CREATE TABLE IF NOT EXISTS msg_message_v2 (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id INTEGER NOT NULL,
                    sender_id INTEGER NOT NULL,
                    parent_message_id INTEGER,
                    root_message_id INTEGER,
                    content TEXT,
                    message_type VARCHAR(32) NOT NULL DEFAULT 'text',
                    status VARCHAR(16) NOT NULL DEFAULT 'active',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT,
                    edited_at TEXT,
                    deleted_at TEXT,
                    metadata_json TEXT,
                    FOREIGN KEY (conversation_id) REFERENCES msg_conversation(id),
                    FOREIGN KEY (sender_id) REFERENCES org_user(id),
                    FOREIGN KEY (parent_message_id) REFERENCES msg_message_v2(id),
                    FOREIGN KEY (root_message_id) REFERENCES msg_message_v2(id)
                )
                """,
            )
            _execute(
                conn,
                """
                CREATE TABLE IF NOT EXISTS msg_conversation_member (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    role VARCHAR(32) NOT NULL DEFAULT 'member',
                    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    left_at TEXT,
                    mute_until TEXT,
                    is_favorite INTEGER NOT NULL DEFAULT 0,
                    notification_level VARCHAR(32) NOT NULL DEFAULT 'all',
                    last_read_message_id INTEGER,
                    last_read_at TEXT,
                    unread_count_cached INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (conversation_id) REFERENCES msg_conversation(id),
                    FOREIGN KEY (user_id) REFERENCES org_user(id),
                    FOREIGN KEY (last_read_message_id) REFERENCES msg_message_v2(id),
                    UNIQUE (conversation_id, user_id)
                )
                """,
            )
            _execute(
                conn,
                """
                CREATE TABLE IF NOT EXISTS msg_attachment (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    message_id INTEGER NOT NULL,
                    file_name VARCHAR(255) NOT NULL,
                    file_size INTEGER,
                    file_type VARCHAR(120),
                    storage_key TEXT,
                    url TEXT NOT NULL,
                    preview_url TEXT,
                    checksum VARCHAR(128),
                    uploaded_by INTEGER NOT NULL,
                    uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (message_id) REFERENCES msg_message_v2(id),
                    FOREIGN KEY (uploaded_by) REFERENCES org_user(id)
                )
                """,
            )
            _execute(
                conn,
                """
                CREATE TABLE IF NOT EXISTS msg_message_read_status (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    message_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (message_id) REFERENCES msg_message_v2(id),
                    FOREIGN KEY (user_id) REFERENCES org_user(id),
                    UNIQUE (message_id, user_id)
                )
                """,
            )
            _execute(
                conn,
                """
                CREATE TABLE IF NOT EXISTS msg_mention (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    message_id INTEGER NOT NULL,
                    mentioned_user_id INTEGER,
                    mentioned_scope VARCHAR(32) NOT NULL DEFAULT 'user',
                    raw_token VARCHAR(120),
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (message_id) REFERENCES msg_message_v2(id),
                    FOREIGN KEY (mentioned_user_id) REFERENCES org_user(id)
                )
                """,
            )
            _execute(
                conn,
                """
                CREATE TABLE IF NOT EXISTS msg_notification (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    notification_type VARCHAR(32) NOT NULL,
                    reference_type VARCHAR(32) NOT NULL,
                    reference_id INTEGER NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    body TEXT,
                    is_read INTEGER NOT NULL DEFAULT 0,
                    delivered_at TEXT,
                    read_at TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES org_user(id)
                )
                """,
            )
            _execute(
                conn,
                """
                CREATE TABLE IF NOT EXISTS msg_chat_policy (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    policy_key VARCHAR(120) NOT NULL UNIQUE,
                    policy_group VARCHAR(64) NOT NULL,
                    value_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_by INTEGER,
                    FOREIGN KEY (updated_by) REFERENCES org_user(id)
                )
                """,
            )
            _execute(
                conn,
                """
                CREATE TABLE IF NOT EXISTS msg_audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    actor_user_id INTEGER,
                    action VARCHAR(64) NOT NULL,
                    target_type VARCHAR(32) NOT NULL,
                    target_id INTEGER,
                    before_json TEXT,
                    after_json TEXT,
                    ip_address VARCHAR(64),
                    user_agent TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (actor_user_id) REFERENCES org_user(id)
                )
                """,
            )
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_conversation_type_visibility ON msg_conversation(conversation_type, visibility)")
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_conversation_last_message_at ON msg_conversation(last_message_at)")
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_channel_name ON msg_channel(name)")
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_channel_type ON msg_channel(channel_type)")
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_conversation_member_user_id ON msg_conversation_member(user_id)")
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_message_v2_conversation_id ON msg_message_v2(conversation_id)")
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_message_v2_parent_message_id ON msg_message_v2(parent_message_id)")
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_notification_user_id ON msg_notification(user_id)")
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_mention_user_id ON msg_mention(mentioned_user_id)")
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_chat_policy_group ON msg_chat_policy(policy_group)")
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_audit_log_action_created_at ON msg_audit_log(action, created_at)")

            # v0.4.41: 채팅방 스코프 아이디어 / 업무리스트
            _execute(
                conn,
                """
                CREATE TABLE IF NOT EXISTS msg_room_idea (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    room_id INTEGER NOT NULL,
                    title VARCHAR(200) NOT NULL,
                    body TEXT,
                    created_by_user_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    is_deleted INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (room_id) REFERENCES msg_room(id)
                )
                """,
            )
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_room_idea_room_id ON msg_room_idea(room_id)")
            _execute(
                conn,
                """
                CREATE TABLE IF NOT EXISTS msg_room_task (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    room_id INTEGER NOT NULL,
                    title VARCHAR(200) NOT NULL,
                    description TEXT,
                    status VARCHAR(20) NOT NULL DEFAULT 'todo',
                    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
                    assignee_user_id INTEGER,
                    due_date TEXT,
                    created_by_user_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    completed_at TEXT,
                    is_deleted INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (room_id) REFERENCES msg_room(id)
                )
                """,
            )
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_room_task_room_id ON msg_room_task(room_id)")
            _execute(conn, "CREATE INDEX IF NOT EXISTS ix_msg_room_task_status ON msg_room_task(status)")

            default_policies = {
                'basic.chat_enabled': {'enabled': True},
                'basic.dm_enabled': {'enabled': True},
                'basic.channel_enabled': {'enabled': True},
                'channel.creation_scope': {'value': 'all_users'},
                'channel.allow_private_channel': {'enabled': True},
                'channel.allow_external_invite': {'enabled': False},
                'message.edit_window_minutes': {'value': 30},
                'message.allow_delete': {'enabled': True},
                'message.read_receipt_enabled': {'enabled': True},
                'file.max_upload_mb': {'value': 50},
                'file.allowed_extensions': {'value': ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'zip']},
                'file.preview_enabled': {'enabled': True},
                'notification.mention_enabled': {'enabled': True},
                'notification.channel_broadcast_limit': {'value': 'admins_only'},
                'notification.quiet_hours': {'enabled': False, 'start': '22:00', 'end': '07:00'},
                'retention.message_days': {'value': 365},
                'retention.file_days': {'value': 180},
                'audit.message_delete_log': {'enabled': True},
                'audit.file_upload_log': {'enabled': True},
                'audit.admin_view_permission': {'value': 'chat.system.admin'},
            }
            for policy_key, policy_value in default_policies.items():
                row = conn.execute(
                    text("SELECT 1 FROM msg_chat_policy WHERE policy_key = :policy_key LIMIT 1"),
                    {'policy_key': policy_key},
                ).fetchone()
                if row:
                    continue
                group_key = policy_key.split('.', 1)[0]
                _execute_with_params(
                    conn,
                    """
                    INSERT INTO msg_chat_policy (policy_key, policy_group, value_json)
                    VALUES (:policy_key, :policy_group, :value_json)
                    """,
                    {
                        'policy_key': policy_key,
                        'policy_group': group_key,
                        'value_json': json.dumps(policy_value, ensure_ascii=False),
                    },
                )
            logger.info('Chat tables are ready')
    except Exception:
        logger.exception('Failed to initialize chat tables')
        raise
