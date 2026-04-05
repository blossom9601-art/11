"""
Service layer for Vendor Maintenance SLA items.

Tables:
    biz_vendor_maintenance_sla         – SLA line items (구분, SLA항목, 가중치 …)
    biz_vendor_maintenance_sla_criteria – SLA 기준 detail per item
    biz_sla_grade                       – 등급 기준표 (static lookup, no UI)
"""

import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from flask import current_app

logger = logging.getLogger(__name__)

SLA_TABLE = 'biz_vendor_maintenance_sla'
CRITERIA_TABLE = 'biz_vendor_maintenance_sla_criteria'
GRADE_TABLE = 'biz_sla_grade'
VENDOR_TABLE = 'biz_vendor_maintenance'


# ── helpers (mirror vendor_maintenance_service) ──────────────────────────────

def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _resolve_db_path(app=None) -> str:
    app = app or current_app
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
    if not uri.startswith('sqlite'):
        return os.path.join(app.instance_path, 'dev_blossom.db')
    parsed = urlparse(uri)
    path = parsed.path or ''
    if os.path.isabs(path):
        normalized = path.replace('\\', '/')
        if normalized.startswith('/') and normalized.count('/') == 1:
            return os.path.abspath(os.path.join(app.instance_path, normalized.lstrip('/')))
        return os.path.abspath(path)
    return os.path.abspath(os.path.join(app.instance_path, path.lstrip('/')))


def _get_connection(app=None):
    app = app or current_app
    db_path = _resolve_db_path(app)
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    return conn


# ── table init ───────────────────────────────────────────────────────────────

def init_vendor_maintenance_sla_tables(app=None):
    """Create SLA + SLA criteria + grade reference tables."""
    app = app or current_app
    with _get_connection(app) as conn:
        # SLA items
        conn.execute(f"""
            CREATE TABLE IF NOT EXISTS {SLA_TABLE} (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                vendor_id   INTEGER NOT NULL,
                category    TEXT,
                sla_item    TEXT NOT NULL,
                weight      INTEGER NOT NULL DEFAULT 0,
                expected_level TEXT,
                minimum_level  TEXT,
                sort_order  INTEGER NOT NULL DEFAULT 0,
                remark      TEXT,
                created_at  TEXT NOT NULL,
                created_by  TEXT NOT NULL,
                updated_at  TEXT,
                updated_by  TEXT,
                is_deleted  INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (vendor_id) REFERENCES {VENDOR_TABLE}(id)
            )
        """)
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{SLA_TABLE}_vendor ON {SLA_TABLE}(vendor_id)")
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{SLA_TABLE}_deleted ON {SLA_TABLE}(is_deleted)")

        # SLA criteria (1:1 with SLA item)
        conn.execute(f"""
            CREATE TABLE IF NOT EXISTS {CRITERIA_TABLE} (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                sla_id      INTEGER NOT NULL UNIQUE,
                purpose     TEXT,
                measurement_standard TEXT,
                target_expected TEXT,
                target_minimum  TEXT,
                measurement_method TEXT,
                measurement_period TEXT,
                report_frequency   TEXT,
                measurement_target TEXT,
                exception_criteria TEXT,
                etc         TEXT,
                created_at  TEXT NOT NULL,
                created_by  TEXT NOT NULL,
                updated_at  TEXT,
                updated_by  TEXT,
                FOREIGN KEY (sla_id) REFERENCES {SLA_TABLE}(id)
            )
        """)
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{CRITERIA_TABLE}_sla ON {CRITERIA_TABLE}(sla_id)")

        # Grade reference table (static seed)
        conn.execute(f"""
            CREATE TABLE IF NOT EXISTS {GRADE_TABLE} (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                min_score   INTEGER NOT NULL,
                max_score   INTEGER NOT NULL,
                grade       TEXT NOT NULL,
                label       TEXT NOT NULL
            )
        """)
        # Seed only if empty
        cur = conn.execute(f"SELECT COUNT(*) FROM {GRADE_TABLE}")
        if cur.fetchone()[0] == 0:
            conn.executemany(f"""
                INSERT INTO {GRADE_TABLE} (min_score, max_score, grade, label)
                VALUES (?, ?, ?, ?)
            """, [
                (95, 100, 'S', '탁월'),
                (90,  94, 'A', '우수'),
                (80,  89, 'B', '양호'),
                (70,  79, 'C', '미흡'),
                ( 0,  69, 'D', '개선필요'),
            ])
        conn.commit()


# ── SLA CRUD ─────────────────────────────────────────────────────────────────

def _row_to_dict(row) -> dict:
    return dict(row) if row else {}


def list_sla_items(vendor_id: int, app=None) -> List[dict]:
    app = app or current_app
    with _get_connection(app) as conn:
        rows = conn.execute(f"""
            SELECT * FROM {SLA_TABLE}
            WHERE vendor_id = ? AND is_deleted = 0
            ORDER BY sort_order, id
        """, (vendor_id,)).fetchall()
        return [_row_to_dict(r) for r in rows]


def get_sla_item(sla_id: int, app=None) -> Optional[dict]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(f"SELECT * FROM {SLA_TABLE} WHERE id = ? AND is_deleted = 0", (sla_id,)).fetchone()
        return _row_to_dict(row) if row else None


def create_sla_item(vendor_id: int, data: dict, actor: str = 'system', app=None) -> dict:
    app = app or current_app
    now = _now()
    with _get_connection(app) as conn:
        cur = conn.execute(f"""
            INSERT INTO {SLA_TABLE}
                (vendor_id, category, sla_item, weight, expected_level, minimum_level, sort_order, remark, created_at, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            vendor_id,
            data.get('category', ''),
            data.get('sla_item', ''),
            int(data.get('weight', 0)),
            data.get('expected_level', ''),
            data.get('minimum_level', ''),
            int(data.get('sort_order', 0)),
            data.get('remark', ''),
            now, actor,
        ))
        conn.commit()
        new_id = cur.lastrowid
        return get_sla_item(new_id, app) or {'id': new_id}


def update_sla_item(sla_id: int, data: dict, actor: str = 'system', app=None) -> Optional[dict]:
    app = app or current_app
    now = _now()
    fields = []
    vals = []
    for col in ('category', 'sla_item', 'weight', 'expected_level', 'minimum_level', 'sort_order', 'remark'):
        if col in data:
            fields.append(f"{col} = ?")
            vals.append(int(data[col]) if col in ('weight', 'sort_order') else data[col])
    if not fields:
        return get_sla_item(sla_id, app)
    fields.append("updated_at = ?")
    vals.append(now)
    fields.append("updated_by = ?")
    vals.append(actor)
    vals.append(sla_id)
    with _get_connection(app) as conn:
        conn.execute(f"UPDATE {SLA_TABLE} SET {', '.join(fields)} WHERE id = ? AND is_deleted = 0", vals)
        conn.commit()
    return get_sla_item(sla_id, app)


def delete_sla_item(sla_id: int, actor: str = 'system', app=None) -> bool:
    app = app or current_app
    now = _now()
    with _get_connection(app) as conn:
        conn.execute(f"UPDATE {SLA_TABLE} SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id = ?",
                     (now, actor, sla_id))
        conn.commit()
    return True


# ── SLA Criteria CRUD ────────────────────────────────────────────────────────

def get_sla_criteria(sla_id: int, app=None) -> Optional[dict]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(f"SELECT * FROM {CRITERIA_TABLE} WHERE sla_id = ?", (sla_id,)).fetchone()
        return _row_to_dict(row) if row else None


def upsert_sla_criteria(sla_id: int, data: dict, actor: str = 'system', app=None) -> dict:
    """Create or update SLA criteria for a given SLA item (1:1)."""
    app = app or current_app
    now = _now()
    existing = get_sla_criteria(sla_id, app)
    cols = ('purpose', 'measurement_standard', 'target_expected', 'target_minimum',
            'measurement_method', 'measurement_period', 'report_frequency',
            'measurement_target', 'exception_criteria', 'etc')

    with _get_connection(app) as conn:
        if existing:
            fields = []
            vals = []
            for c in cols:
                if c in data:
                    fields.append(f"{c} = ?")
                    vals.append(data[c])
            if fields:
                fields.append("updated_at = ?")
                vals.append(now)
                fields.append("updated_by = ?")
                vals.append(actor)
                vals.append(sla_id)
                conn.execute(f"UPDATE {CRITERIA_TABLE} SET {', '.join(fields)} WHERE sla_id = ?", vals)
                conn.commit()
        else:
            conn.execute(f"""
                INSERT INTO {CRITERIA_TABLE}
                    (sla_id, purpose, measurement_standard, target_expected, target_minimum,
                     measurement_method, measurement_period, report_frequency,
                     measurement_target, exception_criteria, etc, created_at, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                sla_id,
                data.get('purpose', ''),
                data.get('measurement_standard', ''),
                data.get('target_expected', ''),
                data.get('target_minimum', ''),
                data.get('measurement_method', ''),
                data.get('measurement_period', ''),
                data.get('report_frequency', ''),
                data.get('measurement_target', ''),
                data.get('exception_criteria', ''),
                data.get('etc', ''),
                now, actor,
            ))
            conn.commit()

    # Sync target values back to SLA item's expected_level / minimum_level
    te = data.get('target_expected')
    tm = data.get('target_minimum')
    if te is not None or tm is not None:
        with _get_connection(app) as conn:
            sync_fields = []
            sync_vals = []
            if te is not None:
                sync_fields.append('expected_level = ?')
                sync_vals.append(te)
            if tm is not None:
                sync_fields.append('minimum_level = ?')
                sync_vals.append(tm)
            sync_fields.append('updated_at = ?')
            sync_vals.append(now)
            sync_fields.append('updated_by = ?')
            sync_vals.append(actor)
            sync_vals.append(sla_id)
            conn.execute(f"UPDATE {SLA_TABLE} SET {', '.join(sync_fields)} WHERE id = ? AND is_deleted = 0", sync_vals)
            conn.commit()

    return get_sla_criteria(sla_id, app) or {}


# ── Grade lookup (read-only) ────────────────────────────────────────────────

def list_sla_grades(app=None) -> List[dict]:
    app = app or current_app
    with _get_connection(app) as conn:
        rows = conn.execute(f"SELECT * FROM {GRADE_TABLE} ORDER BY min_score DESC").fetchall()
        return [_row_to_dict(r) for r in rows]
