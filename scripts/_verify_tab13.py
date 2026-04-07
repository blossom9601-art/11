import re
from app import create_app
app = create_app()
c = app.test_client()

# 1. detail.css served
r = c.get('/static/css/detail.css')
css = r.data.decode('utf-8')
for pat in ['#pk-download-btn', '#pk-page-size-wrap']:
    idx = css.find(pat)
    if idx > -1:
        print(f'OK detail.css: {css[max(0,idx-5):idx+70].strip()}')
    else:
        print(f'MISSING in detail.css: {pat}')

# 2. HTML served
r2 = c.get('/p/hw_server_onpremise_package')
print(f'HTML status: {r2.status_code}')
if r2.status_code == 302:
    print(f'  redirects to: {r2.headers.get("Location")}')
elif r2.status_code == 200:
    html = r2.data.decode('utf-8')
    checks = [
        ('pk-page-size-wrap', 'id="pk-page-size-wrap"'),
        ('detail.css v=4.35', 'detail.css?v=4.35'),
        ('tab13-package.css v=1.6', 'tab13-package.css?v=1.6'),
        ('pk-download-btn', 'id="pk-download-btn"'),
    ]
    for label, needle in checks:
        print(f'  {label}: {"OK" if needle in html else "MISSING"}')
    # Extract CSS link versions
    for m in re.finditer(r'<link[^>]*href="([^"]*\.css[^"]*)"', html):
        print(f'  CSS link: {m.group(1)}')
