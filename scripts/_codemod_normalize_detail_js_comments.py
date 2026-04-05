"""Normalize comments in Blossom detail-tab JS modules.

What it does:
- Removes all JS comments (// line comments and /* block comments */) while preserving strings,
  regex literals, and template literals (including stripping comments inside ${...} expressions).
- Adds a unified header comment (1-5 lines) and minimal one-line section comments by feature.

Usage:
  C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/_codemod_normalize_detail_js_comments.py --write

Safety:
- Intended for the repo's own JS files under static/js/_detail.
- Produces deterministic output but does not try to reformat code.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional


DETAIL_DIR = Path(__file__).resolve().parents[1] / "static" / "js" / "_detail"


SUMMARY_BY_STEM: dict[str, str] = {
    "tab01-hardware": "Hardware detail tab behavior",
    "tab02-software": "Software detail tab behavior",
    "tab03-backup": "Backup detail tab behavior",
    "tab04-interface": "Interface tab behavior",
    "tab05-account": "Account management tab behavior",
    "tab06-authority": "Authority management tab behavior",
    "tab07-activate": "Activate procedure tab behavior",
    "tab08-firewalld": "Firewall (firewalld) tab behavior",
    "tab09-maintenance": "Maintenance tab behavior",
    "tab10-storage": "Storage tab behavior",
    "tab11-task": "Task tab behavior",
    "tab12-vulnerability": "Vulnerability tab behavior",
    "tab13-package": "Package tab behavior",
    "tab14-log": "Change-log tab behavior",
    "tab15-file": "File/diagram tab behavior",
    "tab21-frontbay": "Front bay tab behavior",
    "tab22-rearbay": "Rear bay tab behavior",
    "tab31-basic-storage": "Storage basic-info tab behavior",
    "tab32-assign-storage": "Storage assignment tab behavior",
    "tab33-assign-group": "Storage assignment-group tab behavior",
    "tab41-system": "System allocation tab behavior",
    "tab42-manager": "Manager tab behavior",
    "tab43-hardware": "Vendor hardware tab behavior",
    "tab44-software": "Vendor software tab behavior",
    "tab45-component": "Vendor component tab behavior",
    "tab52-communication": "Communication tab behavior",
    "tab53-vpn-policy": "VPN policy tab behavior",
}


REGEX_PREFIX_CHARS = set("([{:;,=!?&|+-*%^~<>\n")


def _last_non_ws_char(out: list[str]) -> str:
    for ch in reversed(out):
        if not ch.isspace():
            return ch
    return ""


def _prev_word(out: list[str]) -> str:
    i = len(out) - 1
    while i >= 0 and out[i].isspace():
        i -= 1
    j = i
    while j >= 0 and (out[j].isalnum() or out[j] in ("_", "$") ):
        j -= 1
    return "".join(out[j + 1 : i + 1])


def _looks_like_regex_start(out: list[str]) -> bool:
    prev = _last_non_ws_char(out)
    if not prev:
        return True
    if prev in REGEX_PREFIX_CHARS:
        return True
    # Keyword-based heuristic: after these, a regex literal is valid.
    w = _prev_word(out)
    if w in {"return", "case", "throw", "else", "do", "in", "of", "yield", "await", "typeof", "void", "delete", "new"}:
        return True
    return False


@dataclass
class StripResult:
    text: str
    changed: bool


def strip_js_comments(src: str) -> StripResult:
    out: list[str] = []
    i = 0
    n = len(src)

    state: str = "normal"  # normal|line|block|sq|dq|regex|tpl
    regex_in_class = False
    escaped = False

    in_tpl_expr = False
    tpl_brace_depth = 0

    changed = False

    def ch(offset: int = 0) -> str:
        j = i + offset
        return src[j] if 0 <= j < n else ""

    while i < n:
        c = src[i]
        d = ch(1)

        if state == "normal":
            if in_tpl_expr and c == "{":
                tpl_brace_depth += 1
                out.append(c)
                i += 1
                continue
            if in_tpl_expr and c == "}":
                tpl_brace_depth -= 1
                out.append(c)
                i += 1
                if tpl_brace_depth <= 0:
                    in_tpl_expr = False
                    state = "tpl"
                continue

            if c == "/" and d == "/":
                state = "line"
                changed = True
                i += 2
                continue
            if c == "/" and d == "*":
                state = "block"
                changed = True
                i += 2
                continue

            if c == "'":
                state = "sq"
                escaped = False
                out.append(c)
                i += 1
                continue
            if c == '"':
                state = "dq"
                escaped = False
                out.append(c)
                i += 1
                continue
            if c == "`":
                state = "tpl"
                escaped = False
                out.append(c)
                i += 1
                continue

            if c == "/" and _looks_like_regex_start(out):
                state = "regex"
                regex_in_class = False
                escaped = False
                out.append(c)
                i += 1
                continue

            out.append(c)
            i += 1
            continue

        if state == "line":
            # Consume until newline; preserve newline.
            if c == "\r" or c == "\n":
                out.append(c)
                state = "normal"
            i += 1
            continue

        if state == "block":
            # Consume until */; preserve newlines to avoid token-joining.
            if c == "*" and d == "/":
                state = "normal"
                i += 2
                continue
            if c == "\r" or c == "\n":
                out.append(c)
            i += 1
            continue

        if state in ("sq", "dq"):
            out.append(c)
            if escaped:
                escaped = False
            else:
                if c == "\\":
                    escaped = True
                elif state == "sq" and c == "'":
                    state = "normal"
                elif state == "dq" and c == '"':
                    state = "normal"
            i += 1
            continue

        if state == "regex":
            out.append(c)
            if escaped:
                escaped = False
                i += 1
                continue

            if c == "\\":
                escaped = True
                i += 1
                continue

            if c == "[":
                regex_in_class = True
                i += 1
                continue
            if c == "]" and regex_in_class:
                regex_in_class = False
                i += 1
                continue

            if c == "/" and not regex_in_class:
                # regex literal ended; consume flags
                i += 1
                while i < n and (src[i].isalpha()):
                    out.append(src[i])
                    i += 1
                state = "normal"
                continue

            i += 1
            continue

        if state == "tpl":
            out.append(c)
            if escaped:
                escaped = False
                i += 1
                continue

            if c == "\\":
                escaped = True
                i += 1
                continue

            if c == "`":
                state = "normal"
                i += 1
                continue

            if c == "$" and d == "{":
                # Enter template expression. We want to strip comments inside it.
                out.append("{")
                i += 2
                in_tpl_expr = True
                tpl_brace_depth = 1
                state = "normal"
                continue

            i += 1
            continue

        # Fallback (should not happen)
        out.append(c)
        i += 1

    return StripResult(text="".join(out), changed=changed)


def build_header(stem: str) -> str:
    summary = SUMMARY_BY_STEM.get(stem, "Detail tab behavior")
    # 1-5 lines of explanation comment (as requested)
    return (
        "/*\n"
        f" * {stem}.js\n"
        f" * {summary}.\n"
        " */\n\n"
    )


def _insert_before_first(patterns: Iterable[str], section_line: str, text: str) -> str:
    for pat in patterns:
        m = None
        try:
            m = __import__("re").search(pat, text, flags=__import__("re").MULTILINE)
        except Exception:
            m = None
        if m:
            idx = m.start()
            return text[:idx] + section_line + text[idx:]
    return text


def add_section_comments(stem: str, text: str) -> str:
    import re

    # Never insert section comments before the unified header.
    header_m = re.match(r"\A/\*[\s\S]*?\*/\s*\r?\n\r?\n", text)
    base_anchor = header_m.end() if header_m else 0

    # Prefer inserting section markers inside the IIFE body.
    iife_m = re.search(r"\(\s*function\b[^\{]*\{", text[base_anchor:])
    if iife_m:
        body_anchor = base_anchor + iife_m.end()
        nl = re.search(r"\r\n|\r|\n", text[body_anchor:])
        if nl:
            body_anchor = body_anchor + nl.end()
    else:
        body_anchor = base_anchor

    # Insert after "use strict" if present; otherwise at the IIFE body start.
    strict_m = re.search(r"^\s*(['\"])use strict\1\s*;\s*$", text[body_anchor:], flags=re.MULTILINE)
    if strict_m:
        strict_end = body_anchor + strict_m.end()
        nl2 = re.search(r"\r\n|\r|\n", text[strict_end:])
        anchor = strict_end + (nl2.end() if nl2 else 0)
    else:
        anchor = body_anchor

    def detect_indent(start: int) -> str:
        m = re.search(r"^([ \t]+)\S", text[start:], flags=re.MULTILINE)
        return m.group(1) if m else ""

    indent = detect_indent(anchor)

    def insert_after_anchor(section: str) -> None:
        nonlocal text, anchor
        ins = indent + section + "\n\n"
        text = text[:anchor] + ins + text[anchor:]
        anchor += len(ins)

    # Basic layout: always add a utilities section marker.
    insert_after_anchor("// Utilities")

    # API
    text = _insert_before_first(
        patterns=[
            r"^\s*async\s+function\s+api\w*\s*\(",
            r"^\s*function\s+api\w*\s*\(",
            r"^\s*async\s+function\s+\w*Api\w*\s*\(",
            r"^\s*function\s+\w*Api\w*\s*\(",
        ],
        section_line="\n" + indent + "// API\n",
        text=text,
    )

    # Modals
    text = _insert_before_first(
        patterns=[
            r"^\s*function\s+openModal\w*\s*\(",
            r"^\s*function\s+closeModal\w*\s*\(",
        ],
        section_line="\n" + indent + "// Modal\n",
        text=text,
    )

    # CSV
    text = _insert_before_first(
        patterns=[
            r"^\s*function\s+\w*EscapeCSV\s*\(",
            r"^\s*function\s+\w*ExportCSV\s*\(",
            r"^\s*function\s+exportCSV\s*\(",
            r"^\s*function\s+downloadCSV\s*\(",
        ],
        section_line="\n" + indent + "// CSV\n",
        text=text,
    )

    # Pagination
    text = _insert_before_first(
        patterns=[
            r"^\s*(?:var|let|const)\s+\w*State\s*=\s*\{\s*page\s*:\s*\d+\s*,\s*pageSize\s*:\s*\d+\s*\}",
            r"^\s*(?:var|let|const)\s+\w*State\s*=\s*\{\s*page\s*:\s*\d+",
            r"^\s*(?:var|let|const)\s+\w*pageSize\w*\s*=\s*",
        ],
        section_line="\n" + indent + "// Pagination\n",
        text=text,
    )

    # Init
    text = _insert_before_first(
        patterns=[
            r"^\s*function\s+init\w*\s*\(",
            r"^\s*function\s+autoInit\s*\(",
        ],
        section_line="\n" + indent + "// Init\n",
        text=text,
    )

    return text


def normalize_file(path: Path) -> tuple[str, bool]:
    original = path.read_text(encoding="utf-8")

    # Remove any leading BOM to avoid duplicating it.
    bom = "\ufeff"
    has_bom = original.startswith(bom)
    src = original[len(bom) :] if has_bom else original

    stripped = strip_js_comments(src).text
    # Remove leading whitespace-only blank lines left behind after stripping top-of-file comments.
    import re
    stripped = re.sub(r"\A(?:[ \t]*\r?\n)+", "", stripped)
    stem = path.stem

    normalized = build_header(stem) + stripped.lstrip("\r\n")
    normalized = add_section_comments(stem, normalized)

    if has_bom:
        normalized = bom + normalized

    return normalized, (normalized != original)


def iter_targets() -> list[Path]:
    if not DETAIL_DIR.exists():
        raise SystemExit(f"Detail dir not found: {DETAIL_DIR}")
    return sorted([p for p in DETAIL_DIR.glob("*.js") if p.is_file()])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="Write changes in-place")
    ap.add_argument("--check", action="store_true", help="Exit non-zero if changes are needed")
    args = ap.parse_args()

    targets = iter_targets()
    changed_files: list[Path] = []

    for p in targets:
        new_text, changed = normalize_file(p)
        if changed:
            changed_files.append(p)
            if args.write:
                p.write_text(new_text, encoding="utf-8")

    if args.check and changed_files:
        print("Needs changes:")
        for p in changed_files:
            print(" -", p)
        return 1

    if args.write:
        print(f"Updated {len(changed_files)} file(s) under {DETAIL_DIR}")
    else:
        print(f"Would update {len(changed_files)} file(s) under {DETAIL_DIR}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
