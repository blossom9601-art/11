"""Remove legacy per-tab blocks from *detail*.js files.

We migrated tab logic into separate scripts under static/js/_detail/tab*.js.
Many older *detail*.js files still include large IIFE blocks per tab, usually
introduced by a comment like:

  // ---------- Change Log table interactions (tab14-log) ----------

This codemod removes those tab blocks while preserving the surrounding
"basic info" logic and outer page wrappers.

Safety notes:
- Only removes blocks that start with a `(function` IIFE immediately after a
  tab marker comment and end at the matching outer `})();` (nesting-aware for
  nested IIFEs).
- Skips markers that appear inside /* ... */ block comments.

Usage:
  python scripts/codemod_remove_detail_tab_blocks.py --check
  python scripts/codemod_remove_detail_tab_blocks.py --write

Exit codes:
  --check: 0 if no changes needed, 1 if changes would be made
"""

from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path


TAB_MARKER_RE = re.compile(r"^\s*//\s*-{2,}.*\(\s*tab\d{2}[^)]*\)\s*-{2,}\s*$")
IIFE_OPEN_RE = re.compile(r"^\s*\(function\b")
IIFE_CLOSE_RE = re.compile(r"^\s*\}\)\(\)\;\s*$")  # matches `})();`


@dataclass
class FileResult:
    path: Path
    changed: bool
    removed_blocks: int


def iter_candidate_files(root: Path) -> list[Path]:
    files = sorted(root.glob("static/js/**/*detail*.js"))
    out: list[Path] = []
    for p in files:
        # Skip shared tab modules
        if "\\static\\js\\_detail\\" in str(p) or "/static/js/_detail/" in p.as_posix():
            continue
        out.append(p)
    return out


def _update_block_comment_state(line: str, in_block: bool) -> bool:
    # Best-effort toggle for /* ... */. Ignores string literal edge-cases.
    i = 0
    while i < len(line):
        if not in_block and line.startswith("/*", i):
            in_block = True
            i += 2
            continue
        if in_block and line.startswith("*/", i):
            in_block = False
            i += 2
            continue
        i += 1
    return in_block


def remove_tab_blocks(text: str) -> tuple[str, int]:
    lines = text.splitlines(keepends=True)
    out: list[str] = []

    in_block_comment = False
    i = 0
    removed = 0

    while i < len(lines):
        line = lines[i]
        # Track block comment state before evaluating markers.
        in_block_comment = _update_block_comment_state(line, in_block_comment)

        if not in_block_comment and TAB_MARKER_RE.match(line):
            # Look ahead for the IIFE start.
            j = i + 1
            # keep marker indentation and blank lines? We remove marker too.
            while j < len(lines) and lines[j].strip() == "":
                # preserve a single blank line between sections by skipping extras
                j += 1
            if j >= len(lines) or not IIFE_OPEN_RE.match(lines[j]):
                # Not the expected pattern; keep marker line.
                out.append(line)
                i += 1
                continue

            # Remove from marker line (i) through matching outer IIFE close.
            depth = 0
            saw_open = False
            k = j
            while k < len(lines):
                ln = lines[k]
                # crude block comment tracking within the tab block
                # (most of these blocks are plain JS, not huge comment bodies)
                if IIFE_OPEN_RE.match(ln):
                    depth += 1
                    saw_open = True
                if IIFE_CLOSE_RE.match(ln):
                    depth -= 1
                    if saw_open and depth == 0:
                        # consume this close line and stop
                        k += 1
                        break
                k += 1

            # If we didn't find a clean end, don't modify.
            if not saw_open or depth != 0:
                out.append(line)
                i += 1
                continue

            removed += 1
            # Insert a small spacer if previous output doesn't end with blank line.
            if out and not out[-1].endswith("\n"):
                out[-1] = out[-1] + "\n"
            if out and out[-1].strip() != "":
                out.append("\n")
            out.append("      // [Tabs moved to /static/js/_detail/tab*.js]\n")
            out.append("\n")

            i = k
            continue

        out.append(line)
        i += 1

    new_text = "".join(out)
    # Keep file ending newline if it had one.
    if text.endswith("\n") and not new_text.endswith("\n"):
        new_text += "\n"
    return new_text, removed


def process_file(path: Path, write: bool) -> FileResult:
    original = path.read_text(encoding="utf-8")
    updated, removed = remove_tab_blocks(original)
    changed = updated != original
    if changed and write:
        path.write_text(updated, encoding="utf-8")
    return FileResult(path=path, changed=changed, removed_blocks=removed)


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="limit number of files (0 = no limit)")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    files = iter_candidate_files(root)
    if args.limit and args.limit > 0:
        files = files[: args.limit]

    results: list[FileResult] = []
    for p in files:
        res = process_file(p, write=args.write)
        if res.changed or res.removed_blocks:
            results.append(res)

    changed = [r for r in results if r.changed]
    total_blocks = sum(r.removed_blocks for r in results)

    print(f"Scanned {len(files)} files")
    print(f"Would change {len(changed)} files")
    print(f"Removed {total_blocks} tab blocks")
    for r in changed[:50]:
        print(f"- {r.path.as_posix()} (removed {r.removed_blocks})")
    if len(changed) > 50:
        print(f"... and {len(changed) - 50} more")

    if args.check:
        return 1 if len(changed) else 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
