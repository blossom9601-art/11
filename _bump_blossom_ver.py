"""Bump blossom.js version string in all HTML templates."""
import os, re

ROOT = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_DIR = os.path.join(ROOT, 'app', 'templates')

OLD = 'blossom.js?v=20260412_sidebar_deleg'
NEW = 'blossom.js?v=20260412_terms'

count = 0
for dirpath, dirs, files in os.walk(TEMPLATE_DIR):
    for fn in files:
        if not fn.endswith('.html'):
            continue
        fp = os.path.join(dirpath, fn)
        text = open(fp, encoding='utf-8').read()
        if OLD in text:
            text = text.replace(OLD, NEW)
            with open(fp, 'w', encoding='utf-8', newline='\n') as f:
                f.write(text)
            count += 1
            print(f'  updated: {os.path.relpath(fp, ROOT)}')

print(f'\nDone: {count} files updated')
