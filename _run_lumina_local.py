#!/usr/bin/env python3
"""Run Lumina web dashboard locally (HTTP, port 9601) with SQLite."""

import sys, os, sqlite3
from datetime import datetime

ROOT = os.path.dirname(__file__)
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "agents", "web"))

DB_PATH = os.path.join(ROOT, "instance", "lumina_local.db")


def _init_db():
    """Create tables + sample data if DB doesn't exist."""
    fresh = not os.path.exists(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS collected_hosts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hostname TEXT,
            os_type TEXT,
            is_active INTEGER DEFAULT 1,
            last_seen TEXT,
            approval_status TEXT DEFAULT 'pending',
            approved_by TEXT,
            approved_at TEXT
        );
        CREATE TABLE IF NOT EXISTS collected_interfaces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            host_id INTEGER,
            ip_address TEXT
        );
        CREATE TABLE IF NOT EXISTS collected_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            host_id INTEGER,
            username TEXT
        );
        CREATE TABLE IF NOT EXISTS collected_packages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            host_id INTEGER,
            name TEXT
        );
    """)
    if fresh:
        conn.commit()
    conn.close()


class _DictRow(dict):
    """sqlite3.Row → dict wrapper."""
    pass


class _SQLiteCursor:
    """Thin wrapper to make sqlite3 cursor behave like pymysql DictCursor."""
    def __init__(self, conn):
        self._conn = conn
        self._cur = conn.cursor()
        self.rowcount = 0

    def execute(self, sql, params=None):
        # NOW() → datetime('now','localtime')
        sql = sql.replace("NOW()", "datetime('now','localtime')")
        sql = sql.replace("SELECT NOW() as db_now",
                          "SELECT datetime('now','localtime') as db_now")
        # %s → ?
        sql = sql.replace("%s", "?")
        if params:
            self._cur.execute(sql, params)
        else:
            self._cur.execute(sql)
        self.rowcount = self._cur.rowcount

    def fetchone(self):
        row = self._cur.fetchone()
        if row is None:
            return None
        return dict(row)

    def fetchall(self):
        return [dict(r) for r in self._cur.fetchall()]


class _SQLiteConn:
    """Thin wrapper to make sqlite3 connection behave like pymysql."""
    def __init__(self, path):
        self._conn = sqlite3.connect(path)
        self._conn.row_factory = sqlite3.Row

    def cursor(self):
        return _SQLiteCursor(self._conn)

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


def _get_db_local():
    return _SQLiteConn(DB_PATH)


# Init DB before importing app
_init_db()

import agents.web.app_factory as af
af.get_db = _get_db_local          # monkey-patch

from agents.web.app_factory import create_app

app = create_app()
app.config["DEBUG"] = True
app.static_folder = os.path.join(ROOT, "static")
app.static_url_path = "/static"

if __name__ == "__main__":
    print("Lumina local -> http://127.0.0.1:9601")
    print("Login: admin / admin1234!")
    print("DB: %s" % DB_PATH)
    app.run(host="127.0.0.1", port=9601, debug=True)
