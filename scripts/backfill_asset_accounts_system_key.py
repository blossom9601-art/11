"""Backfill asset_account.system_key for legacy rows.

After adding system scoping (system_key) to tab05-account persistence, existing
rows created before the change will have system_key='' and therefore won't show
up in scoped views. This script migrates those rows safely.

Usage examples:

  # Dry-run: infer system_key for hardware scopes only
  .venv\\Scripts\\python.exe scripts\\backfill_asset_accounts_system_key.py --infer-hardware --dry-run

  # Apply: infer system_key for hardware scopes only
  .venv\\Scripts\\python.exe scripts\\backfill_asset_accounts_system_key.py --infer-hardware

  # Apply: explicitly assign a system_key for a specific scope+asset_id
  .venv\\Scripts\\python.exe scripts\\backfill_asset_accounts_system_key.py --scope onpremise --asset-id 123 --system-key WEB-01

Notes:
- For onpremise/cloud/workstation, system_key is inferred from hardware.system_name.
- For other scopes, you must supply --system-key (or extend this script).
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from dataclasses import dataclass
from typing import Optional

# Allow running as a script without installing the package.
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from app import create_app
from app.services import asset_account_service


@dataclass
class Row:
    id: int
    asset_scope: str
    asset_id: int


def _fetch_hardware_system_name(conn: sqlite3.Connection, asset_id: int) -> Optional[str]:
    try:
        row = conn.execute(
            """
            SELECT system_name, asset_name
            FROM hardware
            WHERE id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
            """,
            (int(asset_id),),
        ).fetchone()
        if not row:
            return None
        system_name = (row[0] or "").strip()
        asset_name = (row[1] or "").strip()
        return system_name or asset_name or None
    except Exception:
        return None


def main() -> int:
    ap = argparse.ArgumentParser(description="Backfill asset_account.system_key for legacy rows")
    ap.add_argument("--dry-run", action="store_true", help="Do not write changes; just report")

    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--infer-hardware", action="store_true", help="Infer system_key for onpremise/cloud/workstation from hardware.system_name")
    mode.add_argument("--scope", type=str, help="Asset scope to update (explicit mode)")

    ap.add_argument("--asset-id", type=int, help="Asset id to update (explicit mode)")
    ap.add_argument("--system-key", type=str, help="System key to set (explicit mode)")

    args = ap.parse_args()

    app = create_app("development")
    with app.app_context():
        db_path = asset_account_service._resolve_sqlite_db_path(app)

    updated = 0
    skipped = 0

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        # Ensure new schema exists.
        asset_account_service._ensure_schema(conn, db_path)

        if args.infer_hardware:
            scopes = ("onpremise", "cloud", "workstation")
            rows = conn.execute(
                """
                SELECT id, asset_scope, asset_id
                FROM asset_account
                WHERE (system_key IS NULL OR system_key = '')
                  AND is_deleted = 0
                  AND asset_scope IN (?,?,?)
                ORDER BY id ASC
                """,
                scopes,
            ).fetchall()

            for r in rows:
                row = Row(id=int(r["id"]), asset_scope=str(r["asset_scope"]), asset_id=int(r["asset_id"]))
                inferred = _fetch_hardware_system_name(conn, row.asset_id)
                system_key = asset_account_service._normalize_system_key(inferred or f"{row.asset_scope}:{row.asset_id}")

                if args.dry_run:
                    print(f"DRY  id={row.id} scope={row.asset_scope} asset_id={row.asset_id} -> system_key={system_key!r}")
                    updated += 1
                    continue

                conn.execute(
                    "UPDATE asset_account SET system_key = ? WHERE id = ? AND (system_key IS NULL OR system_key = '')",
                    (system_key, row.id),
                )
                updated += 1

            if not args.dry_run:
                conn.commit()

        else:
            scope = (args.scope or "").strip()
            asset_id = args.asset_id
            system_key_raw = args.system_key

            if not scope or asset_id is None or not (system_key_raw or "").strip():
                ap.error("Explicit mode requires --scope, --asset-id, and --system-key")

            system_key = asset_account_service._normalize_system_key(system_key_raw)

            rows = conn.execute(
                """
                SELECT id, asset_scope, asset_id
                FROM asset_account
                WHERE asset_scope = ? AND asset_id = ? AND is_deleted = 0
                  AND (system_key IS NULL OR system_key = '')
                ORDER BY id ASC
                """,
                (scope, int(asset_id)),
            ).fetchall()

            for r in rows:
                row = Row(id=int(r["id"]), asset_scope=str(r["asset_scope"]), asset_id=int(r["asset_id"]))
                if args.dry_run:
                    print(f"DRY  id={row.id} scope={row.asset_scope} asset_id={row.asset_id} -> system_key={system_key!r}")
                    updated += 1
                    continue

                conn.execute(
                    "UPDATE asset_account SET system_key = ? WHERE id = ? AND (system_key IS NULL OR system_key = '')",
                    (system_key, row.id),
                )
                updated += 1

            if not args.dry_run:
                conn.commit()

    print(f"DONE  updated={updated} skipped={skipped} dry_run={bool(args.dry_run)} db={db_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
