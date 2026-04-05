"""
15개 하드웨어 상세 페이지에 누락된 system.css 참조를 복원합니다.
blossom.css 뒤, detail.css 앞에 system.css를 삽입합니다.
"""
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATES = os.path.join(BASE, 'app', 'templates', '2.hardware')

BLOSSOM_LINE = '<link rel="stylesheet" href="/static/css/blossom.css?v=1.2.3">'
SYSTEM_LINE  = '<link rel="stylesheet" href="/static/css/system.css?v=4.32">'
DETAIL_LINE  = '<link rel="stylesheet" href="/static/css/detail.css?v=4.32">'

fixed = []
skipped = []
errors = []

for root, dirs, files in os.walk(TEMPLATES):
    for fname in files:
        if not fname.startswith('2.') or not fname.endswith('_detail.html'):
            continue
        fpath = os.path.join(root, fname)
        text = open(fpath, encoding='utf-8').read()

        # 이미 system.css가 있으면 스킵
        if 'system.css' in text:
            skipped.append(fpath)
            continue

        # blossom.css → detail.css 사이에 system.css 삽입
        old = f'{BLOSSOM_LINE}\n    {DETAIL_LINE}'
        new = f'{BLOSSOM_LINE}\n    {SYSTEM_LINE}\n    {DETAIL_LINE}'

        if old in text:
            text = text.replace(old, new)
            with open(fpath, 'w', encoding='utf-8', newline='\n') as f:
                f.write(text)
            fixed.append(fpath)
        else:
            errors.append(fpath)

print(f"\n=== system.css 복원 결과 ===")
print(f"수정됨: {len(fixed)}")
for p in fixed:
    print(f"  ✅ {os.path.relpath(p, BASE)}")
print(f"이미 있음 (스킵): {len(skipped)}")
for p in skipped:
    print(f"  ⏭ {os.path.relpath(p, BASE)}")
if errors:
    print(f"패턴 불일치: {len(errors)}")
    for p in errors:
        print(f"  ❌ {os.path.relpath(p, BASE)}")
