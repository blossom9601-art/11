import re
from pathlib import Path

import pytest

import esprima


REPO_ROOT = Path(__file__).resolve().parents[1]


L2_L4_DETAIL_JS_FILES = [
    Path('static/js/2.hardware/2-4.network/2-4-1.l2/2.l2_detail.js'),
    Path('static/js/2.hardware/2-4.network/2-4-2.l4/2.l4_detail.js'),
]

L2_L4_TEMPLATES = [
    # L2
    Path('app/templates/2.hardware/2-4.network/2-4-1.l2/1.l2_list.html'),
    Path('app/templates/2.hardware/2-4.network/2-4-1.l2/2.l2_detail.html'),
    # L4
    Path('app/templates/2.hardware/2-4.network/2-4-2.l4/1.l4_list.html'),
    Path('app/templates/2.hardware/2-4.network/2-4-2.l4/2.l4_detail.html'),
]


def _read_text(rel_path: Path) -> str:
    path = REPO_ROOT / rel_path
    if not path.exists():
        raise AssertionError(f'Missing file: {rel_path.as_posix()}')
    return path.read_text(encoding='utf-8', errors='strict')


def test_l2_l4_detail_js_has_no_parse_errors():
    for rel in L2_L4_DETAIL_JS_FILES:
        code = _read_text(rel)

        # Guard against the previously observed breakage.
        assert '?.' not in code, f'Optional chaining found in {rel.as_posix()}'
        assert '??' not in code, f'Nullish coalescing found in {rel.as_posix()}'

        try:
            esprima.parseScript(code)
        except Exception as exc:
            pytest.fail(f'JS parse failed for {rel.as_posix()}: {exc}')


def test_l2_l4_templates_have_no_inline_script_blocks():
    # Inline <script> blocks are disallowed for these pages; only <script src="..."> is permitted.
    for rel in L2_L4_TEMPLATES:
        html = _read_text(rel)

        for match in re.finditer(r'<script\b([^>]*)>', html, flags=re.IGNORECASE):
            attrs = match.group(1) or ''
            if re.search(r'\bsrc\s*=', attrs, flags=re.IGNORECASE):
                continue
            pytest.fail(f'Inline <script> tag found in {rel.as_posix()}')
