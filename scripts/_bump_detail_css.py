"""Bump all detail.css?v=4.XX references to v=4.35"""
import os, re

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
templates_dir = os.path.join(root, 'app', 'templates')

count = 0
for dirpath, dirnames, filenames in os.walk(templates_dir):
    for fn in filenames:
        if not fn.endswith('.html'):
            continue
        fpath = os.path.join(dirpath, fn)
        text = open(fpath, encoding='utf-8').read()
        if 'detail.css?v=' not in text:
            continue
        new_text = re.sub(r'detail\.css\?v=4\.\d+', 'detail.css?v=4.35', text)
        if new_text != text:
            with open(fpath, 'w', encoding='utf-8', newline='\n') as f:
                f.write(new_text)
            count += 1
            rel = os.path.relpath(fpath, root)
            print(f'  updated: {rel}')

print(f'\nTotal files updated: {count}')
