from pathlib import Path

src = Path('static/js/common/info-message.js')
dst = Path('static/js/common/info-message-v2.js')
dst.write_text(src.read_text(encoding='utf-8'), encoding='utf-8', newline='\n')

root = Path('app/templates')
old = '/static/js/common/info-message.js?v=1.0.11'
new = '/static/js/common/info-message-v2.js?v=20260413a'

changed = 0
for p in root.rglob('*.html'):
    text = p.read_text(encoding='utf-8')
    if old in text:
        p.write_text(text.replace(old, new), encoding='utf-8', newline='\n')
        changed += 1

print('changed_templates=', changed)
