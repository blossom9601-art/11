import re
from pathlib import Path

ROOT = Path(r"c:\Users\ME\Desktop\blossom")
VERSION = "20260415_cat_dup_remove1"

pattern = re.compile(r'(/static/js/blossom\.js)\?v=[^"\']+')
changed = []

for path in (ROOT / 'app' / 'templates' / '9.category').rglob('*.html'):
    text = path.read_text(encoding='utf-8')
    new_text, n = pattern.subn(rf"\1?v={VERSION}", text)
    if n:
        path.write_text(new_text, encoding='utf-8', newline='\n')
        changed.append(str(path.relative_to(ROOT)))

print('CHANGED', len(changed))
for item in changed:
    print(item)
