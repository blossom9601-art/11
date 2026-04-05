"""Fix mojibake-encoded hw_network_type.network_type values in local SQLite DBs.

Why:
- Some rows were stored with broken encoding and return values like 'ȸ�����' instead of '회선장비'.
- The dedicated line (회선장비) add-modal filters models by network_type; mojibake makes dropdowns empty.

Safety:
- Makes a timestamped .bak copy before writing.
- Only updates rows that strongly look like the circuit/leased-line type mojibake.
- Idempotent.

Run:
  C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/fix_hw_network_type_mojibake.py
"""

from __future__ import annotations

import os
import shutil
import sqlite3
from datetime import datetime
from typing import Iterable, Tuple


PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
DB_CANDIDATES = [
    os.path.join(PROJECT_ROOT, "instance", "dev_blossom.db"),
    os.path.join(PROJECT_ROOT, "dev_blossom.db"),
]

TARGET_KO = "회선장비"


def _ts() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def _has_table(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1", (name,)
    ).fetchone()
    return bool(row)


def _looks_like_mojibake_circuit(raw: str) -> bool:
    s = (raw or "").strip()
    if not s:
        return False
    if s == "ȸ�����":
        return True
    has_replacement = "�" in s
    has_mojibake_glyph = any(ch in s for ch in "ȸ¼±ÀºÑñ")
    return has_replacement and has_mojibake_glyph


def _row_should_be_circuit(network_code: str, model_name: str, raw_type: str) -> bool:
    code = (network_code or "").strip().lower()
    name = (model_name or "").strip().lower()

    # Strong signals from code/name.
    if any(token in code for token in ("cir", "circuit", "dedicated", "leased")):
        return True
    if any(token in name for token in ("circuit", "dedicated", "leased", "회선", "전용")):
        return True

    # If type is mojibake-circuit and code/name aren't informative, still treat as circuit.
    return _looks_like_mojibake_circuit(raw_type)


def _backup_db(path: str) -> str:
    backup_path = f"{path}.bak_{_ts()}"
    shutil.copy2(path, backup_path)
    return backup_path


def fix_one_db(path: str) -> Tuple[int, int]:
    if not os.path.exists(path):
        return (0, 0)

    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        if not _has_table(conn, "hw_network_type"):
            return (0, 0)

        rows = conn.execute(
            "SELECT id, network_code, model_name, network_type "
            "FROM hw_network_type WHERE is_deleted=0"
        ).fetchall()

        candidates = []
        for r in rows:
            raw_type = (r["network_type"] or "").strip()
            if not raw_type:
                continue
            if raw_type == TARGET_KO:
                continue
            if not _looks_like_mojibake_circuit(raw_type):
                continue
            if not _row_should_be_circuit(r["network_code"], r["model_name"], raw_type):
                continue
            candidates.append(r["id"])

        before = len(candidates)
        if before == 0:
            return (0, 0)

        backup_path = _backup_db(path)
        print(f"[backup] {path} -> {backup_path}")

        conn.execute("BEGIN")
        conn.executemany(
            "UPDATE hw_network_type SET network_type=? WHERE id=?",
            [(TARGET_KO, _id) for _id in candidates],
        )
        conn.commit()

        after = conn.execute(
            "SELECT COUNT(*) FROM hw_network_type "
            "WHERE is_deleted=0 AND network_type=?",
            (TARGET_KO,),
        ).fetchone()[0]

        return (before, int(after))
    finally:
        conn.close()


def main() -> int:
    print("[fix] hw_network_type mojibake -> 정상 한글")
    total_fixed = 0
    for path in DB_CANDIDATES:
        if not os.path.exists(path):
            continue
        fixed, total_ko = fix_one_db(path)
        if fixed:
            total_fixed += fixed
            print(f"[ok] {path}: fixed_rows={fixed}, total_network_type='{TARGET_KO}' now={total_ko}")
        else:
            print(f"[skip] {path}: nothing to fix")

    if total_fixed:
        print(f"[done] total_fixed_rows={total_fixed}")
    else:
        print("[done] no changes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
