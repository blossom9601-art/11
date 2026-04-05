from __future__ import annotations

import sqlite3
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
ROOT_DB = REPO_ROOT / "dev_blossom.db"
INSTANCE_DB = REPO_ROOT / "instance" / "dev_blossom.db"


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS org_department (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dept_code TEXT NOT NULL UNIQUE,
    dept_name TEXT NOT NULL,
    description TEXT,
    manager_name TEXT,
    manager_emp_no TEXT,
    member_count INTEGER DEFAULT 0,
    hw_count INTEGER DEFAULT 0,
    sw_count INTEGER DEFAULT 0,
    remark TEXT,
    parent_dept_code TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_at TEXT,
    updated_by TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_org_department_is_deleted ON org_department(is_deleted);
CREATE INDEX IF NOT EXISTS idx_org_department_parent ON org_department(parent_dept_code);
CREATE INDEX IF NOT EXISTS idx_org_department_name ON org_department(dept_name);
"""


def _open(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    return conn


def main() -> None:
    if not ROOT_DB.exists():
        raise SystemExit(f"source DB not found: {ROOT_DB}")

    with _open(INSTANCE_DB) as dst:
        dst.executescript(SCHEMA_SQL)
        dst.commit()

    with _open(ROOT_DB) as src, _open(INSTANCE_DB) as dst:
        src_rows = src.execute(
            "SELECT id, dept_code, dept_name, description, manager_name, manager_emp_no, member_count, hw_count, sw_count, remark, parent_dept_code, created_at, created_by, updated_at, updated_by, is_deleted FROM org_department"
        ).fetchall()

        inserted = 0
        for r in src_rows:
            dst.execute(
                """
                INSERT OR IGNORE INTO org_department
                    (id, dept_code, dept_name, description, manager_name, manager_emp_no, member_count, hw_count, sw_count, remark, parent_dept_code, created_at, created_by, updated_at, updated_by, is_deleted)
                VALUES
                    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    r["id"],
                    r["dept_code"],
                    r["dept_name"],
                    r["description"],
                    r["manager_name"],
                    r["manager_emp_no"],
                    r["member_count"],
                    r["hw_count"],
                    r["sw_count"],
                    r["remark"],
                    r["parent_dept_code"],
                    r["created_at"],
                    r["created_by"],
                    r["updated_at"],
                    r["updated_by"],
                    r["is_deleted"],
                ),
            )
            if dst.total_changes:
                inserted += 1

        # Backfill org_user.department_id using dept_code or dept_name matches
        dept_map = {
            (row["dept_code"] or "").strip().lower(): row["id"]
            for row in dst.execute("SELECT id, dept_code FROM org_department").fetchall()
            if row["dept_code"]
        }
        name_map = {
            (row["dept_name"] or "").strip().lower(): row["id"]
            for row in dst.execute("SELECT id, dept_name FROM org_department").fetchall()
            if row["dept_name"]
        }

        users = dst.execute(
            "SELECT id, department FROM org_user WHERE department_id IS NULL AND department IS NOT NULL"
        ).fetchall()
        updated = 0
        for u in users:
            token = (u["department"] or "").strip().lower()
            if not token:
                continue
            dept_id = dept_map.get(token) or name_map.get(token)
            if not dept_id:
                continue
            dst.execute(
                "UPDATE org_user SET department_id = ? WHERE id = ?",
                (int(dept_id), int(u["id"])),
            )
            if dst.total_changes:
                updated += 1

        dst.commit()

        dst_count = dst.execute("SELECT COUNT(*) FROM org_department").fetchone()[0]
        dst_users_dept_id = dst.execute(
            "SELECT COUNT(*) FROM org_user WHERE department_id IS NOT NULL"
        ).fetchone()[0]

    print("source db:", str(ROOT_DB))
    print("target db:", str(INSTANCE_DB))
    print("departments copied:", inserted)
    print("department_id backfilled users:", updated)
    print("target org_department rows:", dst_count)
    print("target org_user with department_id:", dst_users_dept_id)


if __name__ == "__main__":
    main()
