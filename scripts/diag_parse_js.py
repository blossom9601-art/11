import pathlib
import sys

import esprima


def main() -> int:
    if len(sys.argv) < 2:
        target = pathlib.Path("static/js/2.hardware/2-2.storage/2-2-4.ptl/2.ptl_detail.js")
    else:
        target = pathlib.Path(sys.argv[1])

    code = target.read_text(encoding="utf-8")

    try:
        esprima.parseScript(code, loc=True, tolerant=False)
    except Exception as exc:  # esprima.Error subclasses vary by version
        ln = getattr(exc, "lineNumber", None)
        col = getattr(exc, "column", None)
        print(f"PARSE_ERR: {type(exc).__name__}: {exc}")
        print(f"FILE: {target}")
        print(f"LOC: line={ln} col={col}")
        if ln:
            lines = code.splitlines()
            start = max(1, int(ln) - 8)
            end = min(len(lines), int(ln) + 8)
            for i in range(start, end + 1):
                prefix = ">>" if i == ln else "  "
                print(f"{prefix} {i:>5}: {lines[i - 1]}")
        return 1

    print("PARSE_OK")
    print(f"FILE: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
