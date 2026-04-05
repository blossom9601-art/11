from __future__ import annotations

from pathlib import Path
import re


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    templates = sorted(root.glob("app/templates/**/tab09-maintenance.html"))

    pages_py = root / "app" / "routes" / "pages.py"

    print(f"tab09-maintenance.html files: {len(templates)}")

    id_bad: list[Path] = []
    key_suspicious: list[tuple[Path, list[str]]] = []

    key_re = re.compile(
        r"url_for\(\s*['\"]pages\.show['\"]\s*,\s*key\s*=\s*['\"]([^'\"]+)['\"]"
    )

    for path in templates:
        text = path.read_text(encoding="utf-8", errors="replace")

        if 'id="mt-spec-table"' not in text and "id='mt-spec-table'" not in text:
            id_bad.append(path)

        keys = key_re.findall(text)
        maint_keys = [k for k in keys if "maintenance" in k]
        if maint_keys and any("_maintenance" not in k for k in maint_keys):
            key_suspicious.append((path, maint_keys))

    print(f"id mt-spec-table BAD: {len(id_bad)}")
    print(f"maintenance key suspicious: {len(key_suspicious)}")

    if id_bad:
        print("--- id_bad ---")
        for p in id_bad:
            print(p.relative_to(root).as_posix())

    if key_suspicious:
        print("--- key_suspicious ---")
        for p, keys in key_suspicious:
            rel = p.relative_to(root).as_posix()
            print(f"{rel}: {keys}")

    # Also verify the actual page keys used for tab09 templates.
    if pages_py.exists():
        pages_text = pages_py.read_text(encoding="utf-8", errors="replace")
        pairs = re.findall(
            r"'([^']+)':\s*'([^']*/tab09-maintenance\\.html)'",
            pages_text,
        )
        print(f"pages.py tab09 route mappings: {len(pairs)}")
        bad_keys = [k for (k, _tpl) in pairs if "_maintenance" not in k]
        if bad_keys:
            print(f"pages.py bad keys (missing _maintenance): {len(bad_keys)}")
            for k in bad_keys:
                print(" ", k)
        else:
            print("pages.py bad keys (missing _maintenance): 0")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
