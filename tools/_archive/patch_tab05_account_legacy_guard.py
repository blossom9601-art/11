from __future__ import annotations

import re
from pathlib import Path

MARKER = "Account Management table interactions (tab05-account)"
GUARD_LINE = "if (window.__TAB05_ACCOUNT_API_HANDLED__ === true) return;"

# Match the common first line of the legacy tab05-account IIFE.
# We insert a guard right after it so the legacy block becomes inert when
# /static/js/_detail/tab05-account.js is loaded.
TABLE_LINE_RE = re.compile(
    r"(^[\t ]*)var table = document\.getElementById\('am-spec-table'\); if\(!table\) return;",
    re.MULTILINE,
)


def _has_bom(data: bytes) -> bool:
    return data.startswith(b"\xef\xbb\xbf")


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    js_root = root / "static" / "js"

    changed = 0
    skipped_already_guarded = 0
    skipped_no_match = 0
    skipped_no_marker = 0

    for path in js_root.rglob("*.js"):
        data = path.read_bytes()
        bom = _has_bom(data)
        text = data.decode("utf-8-sig")

        if MARKER not in text:
            skipped_no_marker += 1
            continue

        if GUARD_LINE in text:
            skipped_already_guarded += 1
            continue

        idx = text.find(MARKER)
        head = text[:idx]
        tail = text[idx:]

        # Insert guard only once (first match after marker).
        def repl(m: re.Match[str]) -> str:
            indent = m.group(1)
            return m.group(0) + "\n" + indent + GUARD_LINE

        new_tail, n = TABLE_LINE_RE.subn(repl, tail, count=1)
        if n != 1:
            skipped_no_match += 1
            continue

        new_text = head + new_tail
        new_bytes = (b"\xef\xbb\xbf" if bom else b"") + new_text.encode("utf-8")

        if new_bytes != data:
            path.write_bytes(new_bytes)
            changed += 1

    print(f"tab05-account legacy guard: changed={changed}")
    print(f"skipped_already_guarded={skipped_already_guarded}")
    print(f"skipped_no_match={skipped_no_match}")
    print(f"skipped_no_marker={skipped_no_marker}")

    # Non-zero exit if we found marker files but couldn't patch some.
    if skipped_no_match:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
