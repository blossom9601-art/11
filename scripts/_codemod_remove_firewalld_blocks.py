"""Codemod: remove legacy duplicated Firewalld tab blocks from detail.js files.

We remove the big inline IIFE that starts with:
  // ---------- Firewalld table interactions (tab08-firewalld) ----------

Reason: logic is centralized in /static/js/_detail/tab08-firewalld.js.

Safety notes:
- The codemod performs a lightweight JS-aware brace scan to find the end of the
  outer IIFE, so nested IIFEs inside the block won't terminate removal early.
- For the three server detail files (onpremise/cloud/workstation), we replace
  the legacy block with a tiny init stub to keep explicit storagePrefixFallback.

Run:
  .venv/Scripts/python.exe scripts/_codemod_remove_firewalld_blocks.py
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path


MARKER = "// ---------- Firewalld table interactions (tab08-firewalld) ----------"


@dataclass(frozen=True)
class ReplacementRule:
    suffix: str
    storage_prefix_fallback: str


SERVER_RULES: list[ReplacementRule] = [
    ReplacementRule(
        suffix=str(Path("static/js/2.hardware/2-1.server/2-1-1.onpremise/2.onpremise_detail.js")).replace("\\", "/"),
        storage_prefix_fallback="onpremise",
    ),
    ReplacementRule(
        suffix=str(Path("static/js/2.hardware/2-1.server/2-1-2.cloud/2.cloud_detail.js")).replace("\\", "/"),
        storage_prefix_fallback="cloud",
    ),
    ReplacementRule(
        suffix=str(Path("static/js/2.hardware/2-1.server/2-1-4.workstation/2.workstation_detail.js")).replace("\\", "/"),
        storage_prefix_fallback="workstation",
    ),
]


def _match_server_rule(posix_path: str) -> ReplacementRule | None:
    for rule in SERVER_RULES:
        if posix_path.endswith(rule.suffix):
            return rule
    return None


def _is_ident_char(ch: str) -> bool:
    return ch.isalnum() or ch in "_$"


def _find_iife_start(text: str, marker_index: int) -> int | None:
    # We expect: MARKER \n (function(){ ...
    # Find the first "(function" after the marker.
    idx = text.find("(function", marker_index)
    if idx == -1:
        return None
    return idx


def _find_open_brace(text: str, start_index: int) -> int | None:
    # Find the first '{' after start_index.
    i = start_index
    while i < len(text):
        ch = text[i]
        if ch == "{":
            return i
        i += 1
    return None


def _scan_to_matching_close_brace(text: str, open_brace_index: int) -> int | None:
    """Return index of matching '}' for the '{' at open_brace_index.

    Lightweight JS scanning: skips strings and comments.
    """

    i = open_brace_index
    depth = 0

    mode: str = "code"  # code | line_comment | block_comment | single | double | template
    template_expr_stack: list[int] = []  # brace depth within current ${...} expression

    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""

        if mode == "line_comment":
            if ch == "\n":
                mode = "code"
            i += 1
            continue

        if mode == "block_comment":
            if ch == "*" and nxt == "/":
                mode = "code"
                i += 2
                continue
            i += 1
            continue

        if mode == "single":
            if ch == "\\":
                i += 2
                continue
            if ch == "'":
                mode = "code"
            i += 1
            continue

        if mode == "double":
            if ch == "\\":
                i += 2
                continue
            if ch == '"':
                mode = "code"
            i += 1
            continue

        if mode == "template":
            if ch == "\\":
                i += 2
                continue
            if ch == "`":
                mode = "code"
                i += 1
                continue
            if ch == "$" and nxt == "{":
                template_expr_stack.append(1)
                mode = "code"
                i += 2
                continue
            i += 1
            continue

        # mode == "code"
        if ch == "/" and nxt == "/":
            mode = "line_comment"
            i += 2
            continue
        if ch == "/" and nxt == "*":
            mode = "block_comment"
            i += 2
            continue
        if ch == "'":
            mode = "single"
            i += 1
            continue
        if ch == '"':
            mode = "double"
            i += 1
            continue
        if ch == "`":
            mode = "template"
            i += 1
            continue

        if ch == "{":
            depth += 1
            if template_expr_stack:
                template_expr_stack[-1] += 1
        elif ch == "}":
            depth -= 1
            if template_expr_stack:
                template_expr_stack[-1] -= 1
                if template_expr_stack[-1] == 0:
                    template_expr_stack.pop()
                    mode = "template"
            if depth == 0:
                return i

        i += 1

    return None


def _consume_iife_suffix(text: str, close_brace_index: int) -> int:
    """Return end index (exclusive) after consuming '})();' (with whitespace)."""

    i = close_brace_index + 1
    while i < len(text) and text[i].isspace():
        i += 1

    # Expect ')();' with optional whitespace in between.
    # Accept common variants: '})();', '})()' + ';', '})();\n'
    def skip_ws(j: int) -> int:
        while j < len(text) and text[j].isspace():
            j += 1
        return j

    i = skip_ws(i)
    if i < len(text) and text[i] == ")":
        i += 1
        i = skip_ws(i)
    if i < len(text) and text[i] == "(":
        i += 1
        i = skip_ws(i)
    if i < len(text) and text[i] == ")":
        i += 1
        i = skip_ws(i)
    if i < len(text) and text[i] == ";":
        i += 1

    return i


def _strip_extra_blank_lines(s: str) -> str:
    # Avoid leaving huge blank gaps.
    while "\n\n\n" in s:
        s = s.replace("\n\n\n", "\n\n")
    return s


def process_file(path: Path) -> tuple[bool, int]:
    original = path.read_text(encoding="utf-8")
    text = original

    posix_path = path.as_posix()
    server_rule = _match_server_rule(posix_path)

    removed = 0
    start = 0
    while True:
        marker_index = text.find(MARKER, start)
        if marker_index == -1:
            break

        iife_start = _find_iife_start(text, marker_index)
        if iife_start is None:
            print(f"WARN: {path.as_posix()}: marker found but no '(function' start")
            break

        open_brace_index = _find_open_brace(text, iife_start)
        if open_brace_index is None:
            print(f"WARN: {path.as_posix()}: marker found but no '{{' after iife start")
            break

        close_brace_index = _scan_to_matching_close_brace(text, open_brace_index)
        if close_brace_index is None:
            print(f"WARN: {path.as_posix()}: failed to find matching '}}' for iife")
            break

        block_end = _consume_iife_suffix(text, close_brace_index)

        replacement = ""
        if server_rule is not None:
            replacement = (
                "\n"
                "      // Firewalld tab handled by /static/js/_detail/tab08-firewalld.js\n"
                "      try{\n"
                "        if(window.BlossomTab08Firewalld && typeof window.BlossomTab08Firewalld.init === 'function'){\n"
                f"          window.BlossomTab08Firewalld.init({{ storagePrefixFallback: '{server_rule.storage_prefix_fallback}' }});\n"
                "        }\n"
                "      }catch(_e){ }\n\n"
            )

        text = text[:marker_index] + replacement + text[block_end:]
        removed += 1
        start = marker_index + len(replacement)

    if text != original:
        text = _strip_extra_blank_lines(text)
        path.write_text(text, encoding="utf-8")
        return True, removed

    return False, 0


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    js_root = repo_root / "static" / "js"

    if not js_root.exists():
        print(f"ERROR: static/js not found at {js_root}")
        return 2

    js_files = sorted(js_root.rglob("*.js"))
    changed = 0
    removed_total = 0

    for path in js_files:
        did_change, removed = process_file(path)
        if did_change:
            changed += 1
            removed_total += removed

    print(f"Firewalld blocks removed: {removed_total}")
    print(f"Files changed: {changed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
