from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Tok:
    ch: str
    line: int
    col: int
    idx: int


def main() -> int:
    js_path = Path(r"c:\Users\ME\Desktop\blossom\static\js\9.category\9-5.company\9-5-1.center\1.center_list.js")
    s = js_path.read_text(encoding="utf-8")

    opens = {"(": ")", "{": "}", "[": "]"}
    closes = {")": "(",
        "}": "{",
        "]": "[",
    }

    stack: list[Tok] = []
    line = 1
    col = 1
    mode: str | None = None  # None, sq, dq, bt, lc, bc

    i = 0
    while i < len(s):
        ch = s[i]
        nxt = s[i + 1] if i + 1 < len(s) else ""

        if ch == "\n":
            line += 1
            col = 1
            if mode == "lc":
                mode = None
            i += 1
            continue

        if mode == "lc":
            i += 1
            col += 1
            continue

        if mode == "bc":
            if ch == "*" and nxt == "/":
                mode = None
                i += 2
                col += 2
                continue
            i += 1
            col += 1
            continue

        if mode in {"sq", "dq", "bt"}:
            if ch == "\\":
                i += 2
                col += 2
                continue
            if (mode == "sq" and ch == "'") or (mode == "dq" and ch == '"') or (mode == "bt" and ch == "`"):
                mode = None
                i += 1
                col += 1
                continue
            i += 1
            col += 1
            continue

        # comments
        if ch == "/" and nxt == "/":
            mode = "lc"
            i += 2
            col += 2
            continue
        if ch == "/" and nxt == "*":
            mode = "bc"
            i += 2
            col += 2
            continue

        # strings
        if ch == "'":
            mode = "sq"
            i += 1
            col += 1
            continue
        if ch == '"':
            mode = "dq"
            i += 1
            col += 1
            continue
        if ch == "`":
            mode = "bt"
            i += 1
            col += 1
            continue

        # braces
        if ch in opens:
            stack.append(Tok(ch=ch, line=line, col=col, idx=i))
        elif ch in closes:
            need = closes[ch]
            if not stack or stack[-1].ch != need:
                top = stack[-1] if stack else None
                print(f"MISMATCH closing {ch!r} at {line}:{col} (top={top})")
                return 2
            stack.pop()

        i += 1
        col += 1

    print("END")
    print("mode_end:", mode)
    print("stack_depth:", len(stack))
    print("stack_tail:", stack[-8:])

    if stack:
        t = stack[-1]
        start = max(0, t.idx - 120)
        end = min(len(s), t.idx + 240)
        ctx = s[start:end]
        print("\nContext around last unclosed token:")
        print(ctx)

    print("\nTail of file:")
    print(s[-300:])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
