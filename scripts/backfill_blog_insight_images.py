"""Backfill Blog.image_data_url to valid /static/image/insight/* URLs.

- Fixes existing rows that point to stale/non-existent files.
- Assigns a deterministic image per post id (stable across runs).

Run:
  C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/backfill_blog_insight_images.py
"""

from __future__ import annotations

import os
import sys

# Allow running as: python.exe scripts/backfill_blog_insight_images.py
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app import create_app
from app.models import db, Blog


def list_insight_image_urls(static_folder: str) -> list[str]:
    insight_dir = os.path.join(static_folder, 'image', 'insight')
    if not os.path.isdir(insight_dir):
        return []

    exts = ('.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg')
    names: list[str] = []
    for name in os.listdir(insight_dir):
        if not name or name.startswith('.'):
            continue
        low = name.lower()
        if not low.endswith(exts):
            continue
        full = os.path.join(insight_dir, name)
        if os.path.isfile(full):
            names.append(name)
    names.sort()
    return [f"/static/image/insight/{n}" for n in names]


def pick_deterministic(urls: list[str], seed: str) -> str:
    if not urls:
        return ''
    s = (seed or '').strip()
    if not s:
        return urls[0]
    h = 0
    for ch in s:
        h = ((h * 31) + ord(ch)) & 0xFFFFFFFF
    return urls[h % len(urls)]


def is_valid_insight_url(urls: list[str], url: str) -> bool:
    u = (url or '').strip()
    if not u:
        return False
    if u.startswith('data:image/'):
        return True
    if not u.startswith('/static/image/insight/'):
        return False
    base = os.path.basename(u.split('?', 1)[0])
    allowed = {os.path.basename(x) for x in urls}
    return base in allowed


def normalize(urls: list[str], url: str, seed: str) -> str:
    u = (url or '').strip()
    if not u:
        return pick_deterministic(urls, seed)
    if u.startswith('data:image/'):
        return u
    if is_valid_insight_url(urls, u):
        base = os.path.basename(u.split('?', 1)[0])
        return f"/static/image/insight/{base}"
    return pick_deterministic(urls, seed)


def main() -> int:
    app = create_app()
    with app.app_context():
        urls = list_insight_image_urls(app.static_folder)
        if not urls:
            print('No insight images found in static/image/insight')
            return 2

        rows = Blog.query.order_by(Blog.id.asc()).all()
        changed = 0
        scanned = 0

        for r in rows:
            scanned += 1
            cur = (r.image_data_url or '').strip()
            next_url = normalize(urls, cur, str(r.id))
            # Only backfill non-data urls (keep data:image as-is)
            if (cur or '') != (next_url or '') and not (cur.startswith('data:image/') if cur else False):
                r.image_data_url = next_url or None
                changed += 1

        if changed:
            db.session.commit()
        print(f"Scanned {scanned} rows, updated {changed} rows")
        return 0


if __name__ == '__main__':
    raise SystemExit(main())
