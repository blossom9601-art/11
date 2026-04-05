"""Remove dead legacy tab09-maintenance blocks from detail JS files.

Many detail scripts now delegate tab09-maintenance to the shared module
`/static/js/_detail/tab09-maintenance.js` and keep the old implementation
under a `return;` statement.

This codemod deletes that unreachable legacy code while keeping the
surrounding IIFE structure intact.

Idempotent: safe to run multiple times.
"""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STATIC_JS = ROOT / "static" / "js"

MAINT_MARKER = "// ---------- Maintenance table interactions (tab09-maintenance) ----------"

SECTION_RE = re.compile(r"\n\s*//\s*-{10,}[^\n]*-{10,}\s*\n")
RETURN_TABLE_RE = re.compile(
    r"return;\s*(?:\r?\n)+\s*var\s+table\s*=\s*document\.getElementById\('mt-spec-table'\)"
)
IIFE_CLOSE_RE = re.compile(r"\n\s*\}\)\(\);\s*(?:\r?\n)")


def _find_line_start(text: str, idx: int) -> int:
    return text.rfind("\n", 0, idx) + 1


def process_file(path: Path) -> tuple[bool, str]:
    """Returns (changed, message)."""

    original = path.read_text(encoding="utf-8")
    text = original

    # Quick filter
    if MAINT_MARKER not in text:
        return False, "skip: no maintenance marker"

    changed = False
    offset = 0

    while True:
        m = RETURN_TABLE_RE.search(text, offset)
        if not m:
            break

        # Ensure this return belongs to a tab09-maintenance block.
        return_idx = m.start()
        marker_idx = text.rfind(MAINT_MARKER, 0, return_idx)
        if marker_idx < 0:
            offset = m.end()
            continue

        # Heuristic: ensure loader appears shortly before the return.
        window = text[max(marker_idx, return_idx - 1200) : return_idx]
        if "ensureTab09Maintenance" not in window:
            offset = m.end()
            continue

        # Find next section header after the return.
        sec = SECTION_RE.search(text, m.end())
        if not sec:
            # If no next section, fall back to end of file.
            next_section_idx = len(text)
        else:
            next_section_idx = sec.start()

        # Find the closing of the maintenance IIFE right before the next section.
        closes = list(IIFE_CLOSE_RE.finditer(text, m.end(), next_section_idx))
        if not closes:
            # Can't safely edit; move on.
            offset = m.end()
            continue

        close_start = closes[-1].start()

        # Delete from the start of the `return;` line up to the IIFE close.
        del_start = _find_line_start(text, return_idx)
        del_end = close_start

        if del_end <= del_start:
            offset = m.end()
            continue

        text = text[:del_start] + text[del_end:]
        changed = True
        offset = del_start + 1

    if not changed:
        return False, "skip: no matching dead block"

    if text != original:
        path.write_text(text, encoding="utf-8")

    return True, "updated"


def main() -> int:
    if not STATIC_JS.exists():
        raise SystemExit(f"static/js not found: {STATIC_JS}")

    js_files = sorted(STATIC_JS.rglob("*.js"))
    updated: list[Path] = []
    skipped = 0

    for path in js_files:
        changed, msg = process_file(path)
        if changed:
            updated.append(path)
        else:
            skipped += 1

    print(f"tab09 deadcode cleanup: updated={len(updated)} skipped={skipped} total={len(js_files)}")
    for p in updated:
        rel = p.relative_to(ROOT)
        print(f"  - {rel.as_posix()}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
