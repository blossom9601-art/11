import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'cost_opex_hardware_config'


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
    path = path.lstrip('/')
    if os.path.isabs(path):
        return path
    return os.path.abspath(os.path.join(_project_root(app), path))


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


def init_cost_opex_hardware_config_table(app=None) -> None:
    app = app or current_app
    with _get_connection(app) as conn:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                owner_key TEXT PRIMARY KEY,
                memo TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()
        logger.info('%s table ready', TABLE_NAME)


def get_config(*, owner_key: str, app=None) -> Dict[str, Any]:
    owner_key = (owner_key or '').strip()
    if not owner_key:
        return {
            'owner_key': '',
            'memo': '',
            'created_at': None,
            'updated_at': None,
        }

    init_cost_opex_hardware_config_table(app)
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT owner_key, memo, created_at, updated_at FROM {TABLE_NAME} WHERE owner_key = ?",
            (owner_key,),
        ).fetchone()
        if not row:
            return {
                'owner_key': owner_key,
                'memo': '',
                'created_at': None,
                'updated_at': None,
            }
        return {
            'owner_key': row['owner_key'],
            'memo': row['memo'] or '',
            'created_at': row['created_at'],
            'updated_at': row['updated_at'],
        }


def upsert_config(*, owner_key: str, memo: str, app=None) -> Dict[str, Any]:
    owner_key = (owner_key or '').strip()
    if not owner_key:
        raise ValueError('owner_key is required')

    init_cost_opex_hardware_config_table(app)
    now = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    memo = (memo or '').strip()

    with _get_connection(app) as conn:
        conn.execute(
            f"""
            INSERT INTO {TABLE_NAME} (owner_key, memo, created_at, updated_at)
            VALUES (?, ?, COALESCE((SELECT created_at FROM {TABLE_NAME} WHERE owner_key = ?), CURRENT_TIMESTAMP), ?)
            ON CONFLICT(owner_key) DO UPDATE SET
                memo = excluded.memo,
                updated_at = excluded.updated_at
            """,
            (owner_key, memo, owner_key, now),
        )
        conn.commit()

    return get_config(owner_key=owner_key, app=app)
