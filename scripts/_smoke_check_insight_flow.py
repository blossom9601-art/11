"""Smoke check: Insight list storage + counters.

This script inserts a test row into the insight_item table via the service layer,
then reads it back and bumps counters. It does NOT test UI login or browser CSV.
"""

from __future__ import annotations

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


from app import create_app
from app.services.insight_item_service import (
    bump_insight_counter,
    create_insight_item,
    list_insight_items,
)


def main() -> None:
    app = create_app()
    with app.app_context():
        item = create_insight_item(category="trend", title="SMOKE-TEST: 동향", author="tester")
        print("CREATED", item)

        items, total = list_insight_items(category="trend", q="SMOKE-TEST", limit=10, offset=0)
        print("LIST_TOTAL", total)
        print("LIST_ITEMS", items)

        bumped_v = bump_insight_counter(item_id=item["id"], field="views")
        bumped_l = bump_insight_counter(item_id=item["id"], field="likes")
        print("BUMP_VIEWS", bumped_v)
        print("BUMP_LIKES", bumped_l)


if __name__ == "__main__":
    main()
