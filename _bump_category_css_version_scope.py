from pathlib import Path
import re

ROOT = Path('app/templates/9.category')
TARGET_DIRS = [
    '9-2.hardware',
    '9-3.software',
    '9-4.component',
    '9-5.company',
    '9-6.customer',
    '9-7.vendor',
]
NEW_VER = '20260414e'

pattern = re.compile(r'/static/css/category2\.css(?:\?v=[^"\']+)?')
changed = []

for d in TARGET_DIRS:
    base = ROOT / d
    if not base.exists():
        continue
    for html in base.rglob('1.*_list.html'):
        text = html.read_text(encoding='utf-8')
        new_text, n = pattern.subn(f'/static/css/category2.css?v={NEW_VER}', text)
        if n > 0 and new_text != text:
            html.write_text(new_text, encoding='utf-8', newline='\n')
            changed.append(str(html).replace('\\', '/'))

print(f'changed={len(changed)}')
for p in changed:
    print(p)
