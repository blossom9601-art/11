import os
import sqlite3
from typing import List
from urllib.parse import urlparse

from flask import current_app


def _project_root(app) -> str:
    return os.path.abspath(os.path.join(app.root_path, os.pardir))


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    override = app.config.get('NETWORK_IP_POLICY_SQLITE_PATH')
    if override:
        return os.path.abspath(override)
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        return os.path.join(app.instance_path, 'network_ip_policy.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    netloc = parsed.netloc or ''
    if path in (':memory:', '/:memory:'):
        return os.path.join(app.instance_path, 'network_ip_policy.db')
    if netloc and netloc not in ('', 'localhost'):
        path = f"//{netloc}{path}"
    path = path.lstrip('/')
    if os.path.isabs(path):
        return path
    return os.path.abspath(os.path.join(_project_root(app), path))


def _get_connection(app=None) -> sqlite3.Connection:
    app = app or current_app
    db_path = _resolve_db_path(app)
    os.makedirs(os.path.dirname(db_path) or '.', exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def suggest_network_ip_addresses(q: str, *, limit: int = 20, app=None) -> List[str]:
    query = (q or '').strip()
    if not query:
        return []
    try:
        lim = int(limit or 20)
    except (TypeError, ValueError):
        lim = 20
    lim = max(1, min(lim, 200))

    like = f"{query}%"
    with _get_connection(app) as conn:
        exists = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            ('network_ip_policy_address',),
        ).fetchone()
        if not exists:
            return []
        rows = conn.execute(
            """
            SELECT DISTINCT ip_address
            FROM network_ip_policy_address
            WHERE ip_address LIKE ?
            ORDER BY ip_address
            LIMIT ?
            """,
            (like, lim),
        ).fetchall()
    return [str(r['ip_address']) for r in rows if r and r['ip_address']]
