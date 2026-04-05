from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
TEMPLATES_ROOT = ROOT / 'app' / 'templates'
PAGES_PY = ROOT / 'app' / 'routes' / 'pages.py'


def find_tab09_templates() -> list[pathlib.Path]:
    return sorted(TEMPLATES_ROOT.glob('**/tab09-maintenance.html'))


def parse_pages_mapping() -> dict[str, str]:
    """Very small parser for the PAGES mapping: 'key': 'path',"""
    text = PAGES_PY.read_text(encoding='utf-8', errors='replace')
    pat = re.compile(r"^[ \t]*'(?P<key>[^']+)'\s*:\s*'(?P<path>[^']+)'\s*,\s*$")
    mapping: dict[str, str] = {}
    for line in text.splitlines():
        m = pat.match(line)
        if not m:
            continue
        mapping[m.group('key')] = m.group('path')
    return mapping


def main() -> int:
    templates = find_tab09_templates()
    if not templates:
        print('ERROR: no tab09-maintenance.html templates found')
        return 2

    mapping = parse_pages_mapping()
    inverse: dict[str, str] = {v: k for k, v in mapping.items()}

    bad = {
        'missing_mt_spec_table': [],
        'missing_blossom_js': [],
        'missing_pages_key': [],
        'pages_key_not_maintenance': [],
    }

    for path in templates:
        rel_from_templates = str(path.relative_to(TEMPLATES_ROOT)).replace('\\', '/')
        html = path.read_text(encoding='utf-8', errors='replace')

        if 'id="mt-spec-table"' not in html and "id='mt-spec-table'" not in html:
            bad['missing_mt_spec_table'].append(rel_from_templates)

        if '/static/js/blossom.js' not in html:
            bad['missing_blossom_js'].append(rel_from_templates)

        key = inverse.get(rel_from_templates)
        if not key:
            bad['missing_pages_key'].append(rel_from_templates)
        else:
            if '_maintenance' not in key:
                bad['pages_key_not_maintenance'].append(f"{key} -> {rel_from_templates}")

    total = len(templates)
    print(f"tab09-maintenance templates: {total}")

    any_bad = False
    for k, items in bad.items():
        if not items:
            continue
        any_bad = True
        print(f"\n[{k}] {len(items)}")
        for it in items:
            print(f"- {it}")

    if not any_bad:
        print('\nOK: all tab09-maintenance templates have mt-spec-table + blossom.js and are mapped to *_maintenance keys.')
        return 0

    return 1


if __name__ == '__main__':
    raise SystemExit(main())
