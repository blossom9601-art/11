from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app import create_app
from app.services.network_ad_diagram_service import list_network_ad_diagrams
from app.services.network_ad_service import LOG_TABLE_NAME, _get_connection, append_network_ad_log


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    except Exception:
        return None


def _has_create_log(ad_id: int, entity_id: int) -> bool:
        with _get_connection() as conn:
                row = conn.execute(
                        f"""
                        SELECT 1
                        FROM {LOG_TABLE_NAME}
                        WHERE ad_id = ?
                            AND tab_key = 'gov_ad_policy_file'
                            AND entity = 'DIAGRAM'
                            AND action = 'CREATE'
                            AND entity_id = ?
                        LIMIT 1
                        """,
                        (int(ad_id), int(entity_id)),
                ).fetchone()
                return row is not None


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Backfill missing AD 구성/파일 CREATE logs into 변경이력. "
            "Safe to run multiple times (idempotent by entity_id check)."
        )
    )
    parser.add_argument("--ad-id", type=int, required=True, help="network_ad_policy.ad_id")
    parser.add_argument(
        "--since-hours",
        type=float,
        default=24.0,
        help="Only backfill items created within this many hours (UTC).",
    )
    parser.add_argument("--actor", type=str, default="system", help="Actor name stored in logs")

    args = parser.parse_args()

    app = create_app()
    app.app_context().push()

    cutoff = datetime.utcnow() - timedelta(hours=float(args.since_hours or 0))
    items = list_network_ad_diagrams(ad_id=int(args.ad_id))

    created = 0
    skipped_existing = 0
    skipped_old = 0

    for item in items:
        entity_id = int(item.get("id") or 0)
        if entity_id <= 0:
            continue

        created_at = _parse_dt(item.get("created_at"))
        if created_at and created_at < cutoff:
            skipped_old += 1
            continue

        if _has_create_log(int(args.ad_id), entity_id):
            skipped_existing += 1
            continue

        append_network_ad_log(
            int(args.ad_id),
            tab_key="gov_ad_policy_file",
            entity="DIAGRAM",
            entity_id=entity_id,
            action="CREATE",
            actor=(args.actor or "system").strip() or "system",
            message=f"구성/파일 등록 ({item.get('file_name') or ''})".strip(),
            diff={"created": item},
        )
        created += 1

    print(
        f"Backfill done for ad_id={int(args.ad_id)}. "
        f"created={created}, skipped_existing={skipped_existing}, skipped_old={skipped_old}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
