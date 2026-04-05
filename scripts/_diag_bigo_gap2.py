"""Diagnose 비고 label-to-textarea gap vs normal label-to-input gap."""
import sys, logging, re
logging.disable(logging.CRITICAL)
sys.path.insert(0, '.')
from app import create_app

app = create_app()
c = app.test_client()
c.post('/api/login', json={'username': 'admin', 'password': 'admin'})

# 1) Get rendered HTML
r = c.get('/p/dc_access_control')
html = r.data.decode('utf-8')

# Find ALL form-row divs in the 물품 반출 section
idx_start = html.find('물품 반출')
idx_end = html.find('</form>', idx_start)
section = html[idx_start:idx_end]

print("=== 물품 반출 section form-row elements ===")
for m in re.finditer(r'<div class="form-row[^"]*"[^>]*>.*?</div>', section, re.DOTALL):
    snippet = m.group()[:200]
    print(snippet)
    print()

# 2) Get served CSS - extract ALL rules affecting .form-row
r2 = c.get('/static/css/center.css')
css = r2.data.decode('utf-8')
print("=== CSS rules with form-row (gap/margin/padding/display) ===")
for i, line in enumerate(css.split('\n'), 1):
    if re.search(r'\.form-row', line) and re.search(r'gap|margin|padding|display', line):
        print(f"  L{i}: {line.strip()[:120]}")

print()
print("=== CSS rules with form-grid (gap) ===")
for i, line in enumerate(css.split('\n'), 1):
    if re.search(r'\.form-grid', line) and 'gap' in line:
        print(f"  L{i}: {line.strip()[:120]}")

print()
print("=== CSS rules with textarea ===")
for i, line in enumerate(css.split('\n'), 1):
    if 'textarea' in line.lower():
        print(f"  L{i}: {line.strip()[:120]}")

# 3) Check blossom.css too
r3 = c.get('/static/css/blossom.css')
blossom_css = r3.data.decode('utf-8')
print()
print("=== blossom.css rules with textarea ===")
for i, line in enumerate(blossom_css.split('\n'), 1):
    if 'textarea' in line.lower() and not line.strip().startswith('/*'):
        print(f"  L{i}: {line.strip()[:120]}")

print()
print("=== blossom.css rules with form-row ===")
for i, line in enumerate(blossom_css.split('\n'), 1):
    if re.search(r'\.form-row', line):
        print(f"  L{i}: {line.strip()[:120]}")

print()
print("=== CSS version in HTML ===")
for m in re.finditer(r'center\.css\?v=[^"]+', html):
    print(f"  {m.group()}")
