"""Diagnose the 비고 form-row-wide gap issue."""
import sys, logging, re
logging.disable(logging.CRITICAL)
sys.path.insert(0, '.')
from app import create_app

app = create_app()
c = app.test_client()
c.post('/api/login', json={'username': 'admin', 'password': 'admin'})

# 1) HTML structure
r = c.get('/p/dc_access_control')
html = r.data.decode('utf-8')
idx_start = html.find('물품 반출')
idx_end = html.find('</form>', idx_start)
section = html[idx_start:idx_end]

rows = re.findall(r'<div class="form-row[^"]*"[^>]*>.*?</div>', section, re.DOTALL)
print("=== HTML form-row elements in 물품 반출 ===")
for i, row in enumerate(rows):
    print(f"  ROW {i}: {row[:300]}")
print()

# 2) CSS rules
r2 = c.get('/static/css/center.css?v=1.1.4')
css = r2.data.decode('utf-8')

for pattern in ['textarea.form-input', '.form-row.form-row-wide', '.form-row {',
                '.form-grid {', '.form-grid{', '.form-input {']:
    idx = css.find(pattern)
    if idx >= 0:
        end = css.find('}', idx) + 1
        print(f"  CSS [{idx}]: {css[max(0,idx-5):end]}")
    else:
        print(f"  NOT FOUND: {pattern}")
print()

# 3) Check blossom.css for textarea rules
r3 = c.get('/static/css/blossom.css?v=1.2.3')
bcss = r3.data.decode('utf-8')
for pattern in ['textarea', '.form-row']:
    for m in re.finditer(re.escape(pattern), bcss):
        start = max(0, m.start() - 30)
        end = bcss.find('}', m.start()) + 1
        snippet = bcss[start:min(end, m.start()+200)]
        if 'task-form' not in snippet and '.form-group' not in snippet:
            print(f"  blossom.css [{m.start()}]: {snippet}")
