from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

MARKER = "Account Management table interactions (tab05-account)"

# Files to never touch
SKIP_PARTS = {
    str(Path("static/js/_detail/tab05-account.js")).replace("\\", "/"),
    str(Path("static/js/tab05_account_global_api.js")).replace("\\", "/"),
}


def _has_bom(data: bytes) -> bool:
    return data.startswith(b"\xef\xbb\xbf")


def _is_escaped(text: str, i: int) -> bool:
    # whether text[i] is escaped by an odd number of backslashes
    bs = 0
    j = i - 1
    while j >= 0 and text[j] == "\\":
        bs += 1
        j -= 1
    return (bs % 2) == 1


@dataclass
class Block:
    start: int
    end: int


def _skip_ws(text: str, i: int) -> int:
    n = len(text)
    while i < n and text[i].isspace():
        i += 1
    return i


def _consume_line_start(text: str, i: int) -> int:
    # move i to beginning of line
    j = text.rfind("\n", 0, i)
    return 0 if j < 0 else j + 1


def _consume_line_end(text: str, i: int) -> int:
    j = text.find("\n", i)
    return len(text) if j < 0 else j + 1


def _find_iife_after(text: str, i: int) -> int | None:
    # find the first "(function" after i
    m = re.search(r"\(function\b", text[i:])
    if not m:
        return None
    return i + m.start()

# NOTE: We must NOT treat callback uses like `arr.map(function(){...})` as IIFE starts.
# Those appear extremely frequently and would break nesting detection.
#
# We only consider IIFEs that begin at statement-level, i.e. the line starts with
# something like `(function(){ ...` or `;(function(){ ...`.
IIFE_START_LINE_RE = re.compile(r"^\s*;?\s*\(function\b")
IIFE_START_BANG_LINE_RE = re.compile(r"^\s*;?\s*!\s*function\b")

# Common IIFE endings:
# - `})();`  (from `(function(){...})();`)
# - `}());`  (from `(function(){...}());`)
# - `}();`   (from `!function(){...}();`)
IIFE_END_LINE_RE = re.compile(
    r"^\s*\}\)\s*\(\s*\)\s*;?\s*(?:\/\/.*)?$"
    r"|^\s*\}\s*\(\s*\)\s*\)\s*;?\s*(?:\/\/.*)?$"
    r"|^\s*\}\s*\(\s*\)\s*;?\s*(?:\/\/.*)?$"
)


def _remove_one_block(text: str, marker_index: int) -> tuple[str, bool]:
    # Remove from the marker line start through the end of the following IIFE.
    start = _consume_line_start(text, marker_index)
    marker_line_end = _consume_line_end(text, marker_index)

    # Work line-by-line from the marker line to find the IIFE start and its end.
    lines = text[start:].splitlines(keepends=True)
    base = start

    iife_started = False
    nesting = 0
    current_offset = 0
    end_abs: int | None = None

    for line in lines:
        if not iife_started:
            # Find the first IIFE start after the marker line.
            if base + current_offset < marker_line_end:
                current_offset += len(line)
                continue
            if IIFE_START_LINE_RE.match(line) or IIFE_START_BANG_LINE_RE.match(line):
                iife_started = True
                nesting += 1
        else:
            if IIFE_START_LINE_RE.match(line) or IIFE_START_BANG_LINE_RE.match(line):
                nesting += 1
            if IIFE_END_LINE_RE.match(line):
                nesting -= 1
                if nesting <= 0:
                    end_abs = base + current_offset + len(line)
                    break

        current_offset += len(line)

    if end_abs is None:
        return text, False

    # Expand end to include one trailing blank line (if present)
    end_line = end_abs
    while end_line < len(text) and text[end_line] in ("\r", "\n", " ", "\t"):
        # stop after consuming at most one blank line
        if text[end_line] == "\n":
            # peek ahead: if next is also newline, allow it, else stop
            # We'll break after one extra newline sequence.
            j = end_line
            while j < len(text) and text[j] in ("\r", "\n"):
                j += 1
            end_line = j
            break
        end_line += 1

    new_text = text[:start] + text[end_line:]
    new_text = re.sub(r"\n{4,}", "\n\n\n", new_text)
    return new_text, True


def remove_legacy_blocks(text: str) -> tuple[str, int]:
    count = 0
    while True:
        idx = text.find(MARKER)
        if idx < 0:
            break
        text, removed = _remove_one_block(text, idx)
        if not removed:
            break
        count += 1
    return text, count


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    js_root = root / "static" / "js"

    changed_files = 0
    removed_blocks_total = 0
    failed_files: list[str] = []

    for path in js_root.rglob("*.js"):
        rel = path.relative_to(root).as_posix()
        if any(rel.endswith(p) for p in SKIP_PARTS):
            continue

        data = path.read_bytes()
        bom = _has_bom(data)
        text = data.decode("utf-8-sig")

        if MARKER not in text:
            continue

        new_text, removed = remove_legacy_blocks(text)
        if removed == 0 and MARKER in text:
            failed_files.append(rel)
            continue

        if new_text != text:
            new_bytes = (b"\xef\xbb\xbf" if bom else b"") + new_text.encode("utf-8")
            path.write_bytes(new_bytes)
            changed_files += 1
            removed_blocks_total += removed

    print(f"remove_tab05_account_legacy_blocks: changed_files={changed_files}")
    print(f"removed_blocks_total={removed_blocks_total}")
    if failed_files:
        print("FAILED_FILES:")
        for f in failed_files[:50]:
            print(f"- {f}")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
