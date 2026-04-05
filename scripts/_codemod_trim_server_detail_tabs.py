"""Trim legacy in-page tab implementations from server detail JS files.

This codemod removes everything from the first occurrence of a marker comment:
  // ---------- Change Log table interactions (tab14-log) ----------

and replaces it with a short note + the correct closing braces.

Usage:
  .venv/Scripts/python.exe scripts/_codemod_trim_server_detail_tabs.py \
    static/js/.../2.cloud_detail.js \
    static/js/.../2.frame_detail.js
"""

from __future__ import annotations

import argparse
from pathlib import Path

MARKER = "// ---------- Change Log table interactions (tab14-log) ----------"


def trim_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    idx = text.find(MARKER)
    if idx == -1:
        return False

    head = text[:idx].rstrip() + "\n"

    # Choose closure based on known file.
    name = path.name.lower()
    if name == "2.frame_detail.js":
        tail = (
            "\n      // Tab behaviors moved to /static/js/_detail/tabXX-*.js\n\n"
            "  });\n\n"
            "  // No modal APIs to expose\n"
            "})();\n"
        )
    else:
        # cloud/onpremise/workstation variants typically don't wrap everything in DOMContentLoaded.
        tail = (
            "\n    // Tab behaviors moved to /static/js/_detail/tabXX-*.js\n\n"
            "  // No modal APIs to expose\n"
            "})();\n"
        )

    path.write_text(head + tail, encoding="utf-8")
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="+", help="JS files to trim")
    args = parser.parse_args()

    changed: list[str] = []
    skipped: list[str] = []

    for raw in args.files:
        p = Path(raw)
        if not p.exists():
            skipped.append(f"missing: {p}")
            continue
        if trim_file(p):
            changed.append(str(p))
        else:
            skipped.append(f"marker not found: {p}")

    if changed:
        print("Trimmed:")
        for c in changed:
            print(" -", c)
    if skipped:
        print("Skipped:")
        for s in skipped:
            print(" -", s)


if __name__ == "__main__":
    main()
