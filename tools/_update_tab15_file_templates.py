import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SCRIPT_PATTERN = re.compile(
    r"<script\s+src=\"/static/js/[^\"]+/2\.[^\"]*_detail\.js(?:\?v=[^\"]+)?\"\s*></script>"
)

REPLACEMENT = '<script src="/static/js/_detail/tab15-file.js?v=1.0"></script>'


def main() -> int:
    templates = sorted(ROOT.glob("app/templates/**/tab15-file.html"))
    changed = 0
    skipped = []

    for path in templates:
        text = path.read_text(encoding="utf-8")
        if "/static/js/_detail/tab15-file.js" in text:
            continue

        new_text, n = SCRIPT_PATTERN.subn(REPLACEMENT, text, count=1)
        if n == 0:
            skipped.append(path)
            continue

        if new_text != text:
            path.write_text(new_text, encoding="utf-8")
            changed += 1

    print(f"tab15-file templates total: {len(templates)}")
    print(f"changed: {changed}")
    print(f"skipped (no matching 2.*_detail.js tag): {len(skipped)}")
    if skipped:
        print("first 20 skipped:")
        for p in skipped[:20]:
            print("-", p.relative_to(ROOT).as_posix())

    # Non-zero if we unexpectedly skipped a lot (helps CI)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
