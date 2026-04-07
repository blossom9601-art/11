#!/usr/bin/env python3
"""Bump _hardware_detail.js, blossom.js, blossom.css versions in templates."""
import glob, re, os

os.chdir(os.path.join(os.path.dirname(__file__), '..'))

replacements = [
    (r'_hardware_detail\.js\?v=[^"\'>\s]+', '_hardware_detail.js?v=1.2.0'),
    (r'blossom\.js\?v=[^"\'>\s]+', 'blossom.js?v=20260406_tab'),
    (r'blossom\.css\?v=[^"\'>\s]+', 'blossom.css?v=1.2.4'),
]

files = glob.glob('app/templates/**/*.html', recursive=True)
total = 0
for f in files:
    text = open(f, encoding='utf-8').read()
    new = text
    for pat, repl in replacements:
        new = re.sub(pat, repl, new)
    if new != text:
        with open(f, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(new)
        total += 1
        print(f'  {f}')

print(f'\n{total} files updated.')
