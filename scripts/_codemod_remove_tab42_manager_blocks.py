"""Remove duplicated Tab42 (Manager) blocks from legacy per-page detail JS.

These legacy scripts historically contained a large "Run ONLY on Manager tab" block.
Manager logic has been consolidated into /static/js/_detail/tab42-manager.js.

This codemod strips the manager-only block between the marker lines:
- contains "Run ONLY on Manager tab"
- contains "end manager-only block"

It replaces the entire block with a single comment line.

Usage:
  C:/.../.venv/Scripts/python.exe scripts/_codemod_remove_tab42_manager_blocks.py
  C:/.../.venv/Scripts/python.exe scripts/_codemod_remove_tab42_manager_blocks.py --check
"""

from __future__ import annotations

import argparse
import codecs
import re
from pathlib import Path

START_SUB = "Run ONLY on Manager tab"
END_SUB = "end manager-only block"
REPLACEMENT = "// Manager tab logic moved to shared /static/js/_detail/tab42-manager.js"


def _read_text_preserve_bom(path: Path) -> tuple[str, bool]:
    raw = path.read_bytes()
    has_bom = raw.startswith(codecs.BOM_UTF8)
    text = raw.decode("utf-8-sig" if has_bom else "utf-8")
    return text, has_bom


def _write_text_preserve_bom(path: Path, text: str, has_bom: bool) -> None:
    raw = (codecs.BOM_UTF8 if has_bom else b"") + text.encode("utf-8")
    path.write_bytes(raw)


def strip_manager_block(path: Path) -> bool:
    text, has_bom = _read_text_preserve_bom(path)

    start = text.find(START_SUB)
    if start < 0:
        return False

    end = text.find(END_SUB, start)
    if end < 0:
        raise ValueError(f"Missing end marker in {path}")

    # Remove whole lines containing the markers (inclusive).
    start_line_start = text.rfind("\n", 0, start)
    start_line_start = 0 if start_line_start < 0 else start_line_start + 1

    end_line_end = text.find("\n", end)
    end_line_end = len(text) if end_line_end < 0 else end_line_end + 1

    # Preserve indentation and newline style.
    indent = re.match(r"[\t ]*", text[start_line_start:]).group(0)
    newline = "\r\n" if "\r\n" in text else "\n"
    replacement = indent + REPLACEMENT + newline

    new_text = text[:start_line_start] + replacement + text[end_line_end:]
    if new_text == text:
        return False

    _write_text_preserve_bom(path, new_text, has_bom)
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Do not write changes; just report")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]

    globs = [
        "static/js/4.governance/4-4.vpn_policy/**/2.vpn_detail.js",
        "static/js/4.governance/4-5.dedicatedline_policy/**/2.*_detail.js",
        "static/js/9.category/9-1.business/9-1-5.work_group/2.work_group_detail.js",
    ]

    files: list[Path] = []
    for pat in globs:
        files.extend(root.glob(pat))

    # Deterministic order.
    files = sorted(set(files))

    changed = 0
    for path in files:
        try:
            text, _has_bom = _read_text_preserve_bom(path)
            if START_SUB not in text:
                continue
            if END_SUB not in text:
                raise ValueError(f"Start marker found but end marker missing in {path}")

            if args.check:
                print(f"[would-change] {path.relative_to(root)}")
                changed += 1
            else:
                if strip_manager_block(path):
                    print(f"[changed] {path.relative_to(root)}")
                    changed += 1
        except Exception as exc:
            print(f"[error] {path.relative_to(root)}: {exc}")
            return 2

    print(f"Done. {'Would change' if args.check else 'Changed'} {changed} file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
