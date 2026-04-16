from pathlib import Path
import re

ROOT = Path('app/templates')
PATTERN = re.compile(r'(/static/js/common/info-message\.js\?v=)([^"\'\s>]+)')
TARGET = '1.0.11'

changed_files = []
replaced_count = 0

for path in ROOT.rglob('*.html'):
    text = path.read_text(encoding='utf-8')

    def _repl(match):
        nonlocal_replaced[0] += 1
        return match.group(1) + TARGET

    nonlocal_replaced = [0]
    new_text = PATTERN.sub(_repl, text)
    if new_text != text:
        path.write_text(new_text, encoding='utf-8', newline='\n')
        changed_files.append(path)
        replaced_count += nonlocal_replaced[0]

print(f'changed_files={len(changed_files)} replaced={replaced_count}')
for p in changed_files:
    print(p.as_posix())
