"""
Patch bay JS files:
  1. Add data-placeholder="업무 이름" / "시스템 이름" to searchable selects
  2. Change default option text 업무명→업무 이름, 시스템명→시스템 이름
Patch bay HTML files:
  3. Remove fixed width from 유형/공간 cols → all equal
"""
import re, sys, os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

JS_FILES = [
    'static/js/_detail/tab21-frontbay.js',
    'static/js/_detail/tab22-rearbay.js',
]
HTML_FILES = [
    'app/templates/layouts/tab21-frontbay-shared.html',
    'app/templates/layouts/tab22-rearbay-shared.html',
]

changes = 0

# ─── JS files ───
for path in JS_FILES:
    text = open(path, encoding='utf-8').read()
    orig = text

    # 1) Add data-placeholder to bay-work-select selects
    #    title="업무명">  →  title="업무명" data-placeholder="업무 이름">
    text = text.replace(
        'title="업무명">',
        'title="업무명" data-placeholder="업무 이름">'
    )

    # 2) Add data-placeholder to bay-system-select selects
    #    title="시스템명"  →  title="시스템명" data-placeholder="시스템 이름"
    #    (careful: some have  title="시스템명" disabled  and some  title="시스템명">)
    text = text.replace(
        'title="시스템명"',
        'title="시스템명" data-placeholder="시스템 이름"'
    )

    # 3) Change default option text: disabled>업무명</option> → disabled>업무 이름</option>
    text = text.replace('disabled>업무명</option>', 'disabled>업무 이름</option>')

    # 4) Change default option text: disabled>시스템명</option> → disabled>시스템 이름</option>
    text = text.replace('disabled>시스템명</option>', 'disabled>시스템 이름</option>')

    if text != orig:
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
        diff_count = sum(1 for a, b in zip(text, orig) if a != b) + abs(len(text) - len(orig))
        print(f'[OK] {path}: patched ({diff_count} char diff)')
        changes += 1
    else:
        print(f'[SKIP] {path}: no changes needed')

# ─── HTML files ───
for path in HTML_FILES:
    text = open(path, encoding='utf-8').read()
    orig = text

    # Remove fixed width from 유형/공간 cols so all equal-col share same width
    text = text.replace(
        '<col class="equal-col" style="width: 120px;"><!-- 유형 -->',
        '<col class="equal-col"><!-- 유형 -->'
    )
    text = text.replace(
        '<col class="equal-col" style="width: 120px;"><!-- 공간 -->',
        '<col class="equal-col"><!-- 공간 -->'
    )

    if text != orig:
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
        print(f'[OK] {path}: removed fixed widths')
        changes += 1
    else:
        print(f'[SKIP] {path}: no changes needed')

print(f'\nDone. {changes} file(s) patched.')
if changes == 0:
    sys.exit(1)
