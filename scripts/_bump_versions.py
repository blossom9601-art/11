"""Bump blossom.css version and server list JS versions in templates.
Safe UTF-8 read/write approach.
"""
import os, re

root = r'c:\Users\ME\Desktop\blossom'
templates_dir = os.path.join(root, 'app', 'templates')

# 1. Bump blossom.css?v=1.2.2 -> v=1.2.3
css_old = 'blossom.css?v=1.2.2'
css_new = 'blossom.css?v=1.2.3'
css_count = 0

for dirpath, dirs, files in os.walk(templates_dir):
    for f in files:
        if not f.endswith('.html'):
            continue
        fp = os.path.join(dirpath, f)
        text = open(fp, encoding='utf-8').read()
        if css_old in text:
            text = text.replace(css_old, css_new)
            with open(fp, 'w', encoding='utf-8', newline='\n') as fh:
                fh.write(text)
            css_count += 1

print(f'blossom.css: {css_count} files bumped ({css_old} -> {css_new})')

# 2. Bump server list JS versions
js_bumps = [
    ('1.onpremise_list.js?v=1.2.36', '1.onpremise_list.js?v=1.2.37'),
    ('1.cloud_list.js?v=1.2.36', '1.cloud_list.js?v=1.2.37'),
    ('1.frame_list.js?v=1.2.36', '1.frame_list.js?v=1.2.37'),
    ('1.workstation_list.js?v=1.2.36', '1.workstation_list.js?v=1.2.37'),
]

for old_ver, new_ver in js_bumps:
    count = 0
    for dirpath, dirs, files in os.walk(templates_dir):
        for f in files:
            if not f.endswith('.html'):
                continue
            fp = os.path.join(dirpath, f)
            text = open(fp, encoding='utf-8').read()
            if old_ver in text:
                text = text.replace(old_ver, new_ver)
                with open(fp, 'w', encoding='utf-8', newline='\n') as fh:
                    fh.write(text)
                count += 1
    if count:
        print(f'{old_ver.split("?")[0]}: {count} files bumped')
    else:
        print(f'{old_ver.split("?")[0]}: not found (checking current version...)')

# Verify: check what versions the 4 server list templates currently use
server_templates = [
    'app/templates/2.hardware/2-1.server/2-1-1.onpremise/1.onpremise_list.html',
    'app/templates/2.hardware/2-1.server/2-1-2.cloud/1.cloud_list.html',
    'app/templates/2.hardware/2-1.server/2-1-3.frame/1.frame_list.html',
    'app/templates/2.hardware/2-1.server/2-1-4.workstation/1.workstation_list.html',
]
print('\n=== Current JS versions in server list templates ===')
for rel in server_templates:
    fp = os.path.join(root, rel)
    if not os.path.exists(fp):
        print(f'  MISSING: {rel}')
        continue
    text = open(fp, encoding='utf-8').read()
    matches = re.findall(r'(1\.\w+_list\.js\?v=[\d.]+)', text)
    for m in matches:
        print(f'  {os.path.basename(fp)}: {m}')
