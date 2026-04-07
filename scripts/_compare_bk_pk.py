"""Compare backup vs package tab HTML: button/page-size positioning"""
from app import create_app
app = create_app()
c = app.test_client()

HEADERS = {'X-Requested-With': 'blossom-spa'}

# Fetch both tabs
bk = c.get('/p/hw_server_onpremise_backup', headers=HEADERS)
pk = c.get('/p/hw_server_onpremise_package', headers=HEADERS)

bk_html = bk.data.decode('utf-8')
pk_html = pk.data.decode('utf-8')

print(f'Backup: status={bk.status_code} len={len(bk_html)}')
print(f'Package: status={pk.status_code} len={len(pk_html)}')

import re

# Extract CSS links
for name, html in [('Backup', bk_html), ('Package', pk_html)]:
    print(f'\n=== {name} CSS links ===')
    for m in re.finditer(r'<link[^>]*href="([^"]*\.css[^"]*)"', html):
        print(f'  {m.group(1)}')

# Extract download button HTML
for name, html in [('Backup', bk_html), ('Package', pk_html)]:
    print(f'\n=== {name} download-btn ===')
    m = re.search(r'<button[^>]*id="[bp]k-download-btn"[^>]*>', html)
    if m:
        print(f'  {m.group(0)}')
    else:
        print('  NOT FOUND')

# Extract page-size-selector div
for name, html in [('Backup', bk_html), ('Package', pk_html)]:
    print(f'\n=== {name} page-size-selector ===')
    m = re.search(r'<div[^>]*class="page-size-selector"[^>]*>', html)
    if m:
        print(f'  {m.group(0)}')
    else:
        print('  NOT FOUND')

# Check detail.css for BOTH backup and package rules
css = c.get('/static/css/detail.css').data.decode('utf-8')
print('\n=== detail.css rules ===')
for pat in ['#bk-download-btn', '#bk-page-size-wrap', '#pk-download-btn', '#pk-page-size-wrap']:
    idx = css.find(pat)
    if idx > -1:
        line_start = css.rfind('\n', 0, idx) + 1
        line_end = css.find('\n', idx)
        print(f'  {css[line_start:line_end].strip()}')
    else:
        print(f'  MISSING: {pat}')

# Check tab13-package.css for interference
pk_css = c.get('/static/css/tab13-package.css').data.decode('utf-8')
print('\n=== tab13-package.css position rules ===')
for line in pk_css.split('\n'):
    if 'right' in line.lower() and ('page-size' in line or 'download' in line or 'btn-icon' in line):
        print(f'  INTERFERING: {line.strip()}')
if not any('right' in line.lower() and ('page-size' in line or 'download' in line) for line in pk_css.split('\n')):
    print('  (none - clean)')

# Check tab03-backup.css for comparison
bk_css = c.get('/static/css/tab03-backup.css').data.decode('utf-8')
print('\n=== tab03-backup.css position rules ===')
for line in bk_css.split('\n'):
    if 'right' in line.lower() and ('page-size' in line or 'download' in line or 'btn-icon' in line):
        print(f'  {line.strip()}')
