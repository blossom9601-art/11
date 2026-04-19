"""Bump CSS version strings in HTML templates - UTF-8 safe."""
import os
import re

template_dir = os.path.join(os.path.dirname(__file__), 'app', 'templates')
spa_dir = os.path.dirname(__file__)

# Version bump rules: (pattern, replacement)
rules = [
    (r'detail-common\.css\?v=1\.0', 'detail-common.css?v=1.1'),
    (r'detail\.css\?v=4\.\d+', 'detail.css?v=4.37'),
    (r'propro\.css\?v=[\d.]+', 'propro.css?v=2.6'),
]

# Collect all HTML files
html_files = []
for root, dirs, files in os.walk(template_dir):
    for f in files:
        if f.endswith('.html'):
            html_files.append(os.path.join(root, f))

# Also include root SPA files
for f in ['_tab03_spa.html', '_tab13_spa.html']:
    fp = os.path.join(spa_dir, f)
    if os.path.exists(fp):
        html_files.append(fp)

updated = 0
for fpath in html_files:
    with open(fpath, 'r', encoding='utf-8') as fh:
        content = fh.read()
    
    new_content = content
    for pattern, replacement in rules:
        new_content = re.sub(pattern, replacement, new_content)
    
    if new_content != content:
        with open(fpath, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(new_content)
        updated += 1
        rel = os.path.relpath(fpath, spa_dir)
        print(f'  Updated: {rel}')

print(f'\nTotal updated: {updated}')
