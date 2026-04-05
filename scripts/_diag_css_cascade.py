"""Diagnose CSS cascade for .form-row on the access control page."""
import sys, logging, re
logging.disable(logging.CRITICAL)
sys.path.insert(0, '.')

from app import create_app
app = create_app()
c = app.test_client()
c.post('/api/login', json={'username': 'admin', 'password': 'admin'})
r = c.get('/p/dc_access_control')
html = r.data.decode('utf-8')

# 1) CSS load order
css_links = re.findall(r'href=["\']([^"\']*\.css[^"\']*)["\']', html)
print("=== CSS Load Order ===")
for i, link in enumerate(css_links, 1):
    print(f"  {i}. {link}")

# 2) form-row and form-row-wide rules per file
import urllib.request
print("\n=== Relevant CSS Rules (gap/margin/flex on .form-row) ===")
for link in css_links:
    url = f'http://localhost:8080{link}' if link.startswith('/') else link
    try:
        css_text = urllib.request.urlopen(url).read().decode('utf-8')
    except Exception as e:
        print(f"  SKIP {link}: {e}")
        continue
    fname = link.split('/')[-1].split('?')[0]
    # Simple regex to find rules
    for m in re.finditer(r'([^{}]*?)\{([^}]*)\}', css_text):
        sel = m.group(1).strip().split('\n')[-1].strip()
        props = m.group(2).strip()
        if not sel:
            continue
        # Only show form-row related selectors with spacing props
        if 'form-row' in sel and any(k in props for k in ['gap', 'margin', 'flex', 'padding']):
            print(f"  [{fname}] {sel}")
            for prop in props.replace(';', ';\n').split('\n'):
                prop = prop.strip()
                if prop and any(k in prop for k in ['gap', 'margin', 'flex', 'padding']):
                    print(f"    -> {prop}")
