import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app import create_app


def main() -> int:
    needle = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
    app = create_app()
    rules = sorted([r.rule for r in app.url_map.iter_rules()])

    if needle:
        rules = [r for r in rules if needle in r]

    for r in rules:
        print(r)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
