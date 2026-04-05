"""Shared helpers to compute HW/SW counts from asset tables.

The business "work_*" master tables store hw_count/sw_count columns, but for correctness
we derive counts from the actual asset tables:
- hardware
- software_asset (fallback) / server_software JOIN hardware (primary)

All functions are defensive: if tables/columns are missing, they return empty counts.
"""

from __future__ import annotations

import sqlite3
from typing import Dict


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    try:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1",
            (table_name,),
        ).fetchone()
        return row is not None
    except sqlite3.DatabaseError:
        return False


def counts_by_code(conn: sqlite3.Connection, *, asset_table: str, code_column: str) -> Dict[str, int]:
    """Return counts grouped by a code column for a given asset table.

    Expected schema:
    - asset_table has columns: code_column, is_deleted

    Returns: {code: count}
    """
    if not _table_exists(conn, asset_table):
        return {}

    sql = (
        f"SELECT {code_column} AS code, COUNT(1) AS cnt "
        f"FROM {asset_table} "
        f"WHERE is_deleted = 0 "
        f"  AND {code_column} IS NOT NULL "
        f"  AND TRIM({code_column}) != '' "
        f"GROUP BY {code_column}"
    )

    try:
        rows = conn.execute(sql).fetchall()
    except sqlite3.DatabaseError:
        return {}

    return _rows_to_dict(rows)


def sw_counts_via_hardware(conn: sqlite3.Connection, *, code_column: str) -> Dict[str, int]:
    """Count server_software rows grouped by hardware's work code column.

    server_software has no work_* codes itself; it references hardware via hardware_id.
    We JOIN server_software → hardware to resolve work codes.

    Falls back to software_asset table if server_software is unavailable.

    Returns: {code: count}
    """
    if _table_exists(conn, 'server_software') and _table_exists(conn, 'hardware'):
        sql = (
            f"SELECT h.{code_column} AS code, COUNT(1) AS cnt "
            f"FROM server_software s "
            f"JOIN hardware h ON s.hardware_id = h.id "
            f"WHERE h.is_deleted = 0 "
            f"  AND h.{code_column} IS NOT NULL "
            f"  AND TRIM(h.{code_column}) != '' "
            f"GROUP BY h.{code_column}"
        )
        try:
            rows = conn.execute(sql).fetchall()
            return _rows_to_dict(rows)
        except sqlite3.DatabaseError:
            pass

    # Fallback: try software_asset table directly
    return counts_by_code(conn, asset_table='software_asset', code_column=code_column)


def _rows_to_dict(rows) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for r in rows:
        try:
            code = (r["code"] if isinstance(r, sqlite3.Row) else r[0])
            cnt = (r["cnt"] if isinstance(r, sqlite3.Row) else r[1])
        except Exception:
            continue
        if code is None:
            continue
        code_str = str(code).strip()
        if not code_str:
            continue
        try:
            out[code_str] = int(cnt or 0)
        except Exception:
            out[code_str] = 0
    return out
