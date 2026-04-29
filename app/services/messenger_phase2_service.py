"""Phase 2 messenger schema bootstrap.

Creates tables for:
- Event Bridge: evt_source / evt_rule / evt_log
- Access Approval: acc_approval_line / acc_target / acc_request / acc_approval
- Push Device: push_device / push_log

The runtime always uses SQLAlchemy, but Blossom historically bootstraps
ancillary domains via raw `CREATE TABLE IF NOT EXISTS` so dev SQLite stays in
sync without requiring an Alembic migration round-trip on first boot.
"""
from __future__ import annotations

import logging

from flask import current_app
from sqlalchemy import text

from app.models import db

logger = logging.getLogger(__name__)


def _exec(conn, statement: str) -> None:
    conn.execute(text(statement))


def init_messenger_phase2_tables(app=None) -> None:
    """Create Phase 2 messenger tables on dev SQLite (idempotent)."""
    app = app or current_app
    if getattr(app, 'config', {}).get('TESTING'):
        return
    engine = db.engine if app else db.get_engine()
    try:
        with engine.begin() as conn:
            # ---- Event Bridge -------------------------------------------------
            _exec(conn, """
                CREATE TABLE IF NOT EXISTS evt_source (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR(120) NOT NULL,
                    kind VARCHAR(32) NOT NULL DEFAULT 'custom',
                    webhook_token VARCHAR(64) NOT NULL UNIQUE,
                    secret VARCHAR(128),
                    ip_allowlist TEXT,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    description TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    created_by INTEGER,
                    updated_at TEXT,
                    updated_by INTEGER
                )
            """)
            _exec(conn, "CREATE INDEX IF NOT EXISTS ix_evt_source_is_active ON evt_source(is_active)")

            _exec(conn, """
                CREATE TABLE IF NOT EXISTS evt_rule (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_id INTEGER,
                    name VARCHAR(160) NOT NULL,
                    priority INTEGER NOT NULL DEFAULT 100,
                    match_json TEXT NOT NULL,
                    severity VARCHAR(16) NOT NULL DEFAULT 'info',
                    target_channel_id INTEGER,
                    target_conversation_id INTEGER,
                    mention_user_ids TEXT,
                    title_template VARCHAR(255),
                    body_template TEXT,
                    action_buttons TEXT,
                    dedupe_key_template VARCHAR(255),
                    dedupe_window_sec INTEGER NOT NULL DEFAULT 30,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    created_by INTEGER,
                    updated_at TEXT
                )
            """)
            _exec(conn, "CREATE INDEX IF NOT EXISTS ix_evt_rule_source_priority ON evt_rule(source_id, priority, is_active)")

            _exec(conn, """
                CREATE TABLE IF NOT EXISTS evt_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_id INTEGER NOT NULL,
                    rule_id INTEGER,
                    raw_payload TEXT NOT NULL,
                    normalized_payload TEXT,
                    severity VARCHAR(16),
                    dedupe_key VARCHAR(255),
                    message_id INTEGER,
                    status VARCHAR(16) NOT NULL DEFAULT 'received',
                    error_msg TEXT,
                    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    processed_at TEXT
                )
            """)
            _exec(conn, "CREATE INDEX IF NOT EXISTS ix_evt_log_source_received ON evt_log(source_id, received_at)")
            _exec(conn, "CREATE INDEX IF NOT EXISTS ix_evt_log_dedupe_key_received ON evt_log(dedupe_key, received_at)")
            _exec(conn, "CREATE INDEX IF NOT EXISTS ix_evt_log_status ON evt_log(status)")

            # ---- Access Approval ---------------------------------------------
            _exec(conn, """
                CREATE TABLE IF NOT EXISTS acc_approval_line (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR(120) NOT NULL,
                    steps_json TEXT NOT NULL,
                    is_default INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT
                )
            """)

            _exec(conn, """
                CREATE TABLE IF NOT EXISTS acc_target (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR(160) NOT NULL,
                    kind VARCHAR(32) NOT NULL,
                    endpoint VARCHAR(255),
                    description TEXT,
                    approval_line_id INTEGER,
                    notify_channel_id INTEGER,
                    default_ttl_min INTEGER NOT NULL DEFAULT 60,
                    max_ttl_min INTEGER NOT NULL DEFAULT 480,
                    allowed_hours_json TEXT,
                    ip_allowlist TEXT,
                    revoke_webhook_url VARCHAR(500),
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT
                )
            """)
            _exec(conn, "CREATE INDEX IF NOT EXISTS ix_acc_target_kind ON acc_target(kind)")
            _exec(conn, "CREATE INDEX IF NOT EXISTS ix_acc_target_is_active ON acc_target(is_active)")

            _exec(conn, """
                CREATE TABLE IF NOT EXISTS acc_request (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    requester_id INTEGER NOT NULL,
                    target_id INTEGER NOT NULL,
                    reason TEXT NOT NULL,
                    requested_ttl_min INTEGER NOT NULL DEFAULT 60,
                    is_emergency INTEGER NOT NULL DEFAULT 0,
                    status VARCHAR(16) NOT NULL DEFAULT 'pending',
                    current_step INTEGER NOT NULL DEFAULT 1,
                    approved_at TEXT,
                    activated_at TEXT,
                    expires_at TEXT,
                    revoked_at TEXT,
                    revoked_by INTEGER,
                    revoke_reason TEXT,
                    source_message_id INTEGER,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT
                )
            """)
            _exec(conn, "CREATE INDEX IF NOT EXISTS ix_acc_request_requester_status ON acc_request(requester_id, status)")
            _exec(conn, "CREATE INDEX IF NOT EXISTS ix_acc_request_target_status ON acc_request(target_id, status)")
            _exec(conn, "CREATE INDEX IF NOT EXISTS ix_acc_request_status_expires ON acc_request(status, expires_at)")

            _exec(conn, """
                CREATE TABLE IF NOT EXISTS acc_approval (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_id INTEGER NOT NULL,
                    step INTEGER NOT NULL,
                    approver_id INTEGER NOT NULL,
                    decision VARCHAR(16) NOT NULL,
                    comment TEXT,
                    decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """)
            _exec(conn, "CREATE INDEX IF NOT EXISTS ix_acc_approval_request_step ON acc_approval(request_id, step)")

            # ---- Push --------------------------------------------------------
            _exec(conn, """
                CREATE TABLE IF NOT EXISTS push_device (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    platform VARCHAR(16) NOT NULL,
                    device_token VARCHAR(512) NOT NULL UNIQUE,
                    device_name VARCHAR(120),
                    app_version VARCHAR(32),
                    os_version VARCHAR(32),
                    last_ip VARCHAR(64),
                    registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    revoked_at TEXT
                )
            """)
            _exec(conn, "CREATE INDEX IF NOT EXISTS ix_push_device_user_id ON push_device(user_id)")
            _exec(conn, "CREATE INDEX IF NOT EXISTS ix_push_device_revoked_at ON push_device(revoked_at)")

            _exec(conn, """
                CREATE TABLE IF NOT EXISTS push_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    notification_id INTEGER,
                    user_id INTEGER NOT NULL,
                    device_id INTEGER,
                    provider VARCHAR(16) NOT NULL DEFAULT 'fcm',
                    status VARCHAR(16) NOT NULL DEFAULT 'queued',
                    error_code VARCHAR(64),
                    error_msg TEXT,
                    attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    delivered_at TEXT
                )
            """)
            _exec(conn, "CREATE INDEX IF NOT EXISTS ix_push_log_user_attempted ON push_log(user_id, attempted_at)")
            _exec(conn, "CREATE INDEX IF NOT EXISTS ix_push_log_status ON push_log(status)")

            logger.info('Messenger Phase2 tables are ready')
    except Exception:
        logger.exception('Failed to initialize messenger phase2 tables')
        raise
