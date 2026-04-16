import os, re

old_ver = 'blossom.js?v=20260411_csp'
new_ver = 'blossom.js?v=20260411_csp'

root = os.path.dirname(os.path.abspath(__file__))
changed = []

for dirpath, dirnames, filenames in os.walk(root):
    # Skip .venv, node_modules, .git
    skip = ['.venv', 'node_modules', '.git', '__pycache__']
    dirnames[:] = [d for d in dirnames if d not in skip]
    for fn in filenames:
        if not fn.endswith(('.html', '.py')):
            continue
        fpath = os.path.join(dirpath, fn)
        try:
            text = open(fpath, encoding='utf-8').read()
        except Exception:
            continue
        if old_ver not in text:
            continue
        new_text = text.replace(old_ver, new_ver)
        with open(fpath, 'w', encoding='utf-8', newline='\n') as f:
            f.write(new_text)
        changed.append(os.path.relpath(fpath, root))

print(f'Updated {len(changed)} files:')
for f in changed:
    print(f'  {f}')
