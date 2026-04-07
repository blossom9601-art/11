import re

# 1. detail.css - pk rules
css = open('static/css/detail.css', encoding='utf-8').read()
for pat in ['#pk-download-btn.add-btn-icon', '#pk-page-size-wrap.page-size-selector']:
    idx = css.find(pat)
    if idx > -1:
        snippet = css[max(0,idx-30):idx+60].replace('\n',' ').strip()
        print(f'detail.css OK: ...{snippet}...')
    else:
        print(f'detail.css MISSING: {pat}')

# 2. HTML - id on page-size-selector
html = open('app/templates/layouts/tab13-package-shared.html', encoding='utf-8').read()
if 'id="pk-page-size-wrap"' in html:
    print('HTML OK: pk-page-size-wrap id present')
else:
    print('HTML MISSING: pk-page-size-wrap id')

# 3. CSS versions
m = re.search(r'detail\.css\?v=([^"]+)', html)
print(f'detail.css version: {m.group(1) if m else "NOT FOUND"}')
m2 = re.search(r'tab13-package\.css\?v=([^"]+)', html)
print(f'tab13-package.css version: {m2.group(1) if m2 else "NOT FOUND"}')

# 4. tab13-package.css - old rules removed?
pk_css = open('static/css/tab13-package.css', encoding='utf-8').read()
if 'pk-download-btn.add-btn-icon' in pk_css:
    print('tab13-package.css WARN: still has old download btn rule')
else:
    print('tab13-package.css OK: old rules removed')

# 5. colgroup check
import re as _re
cols = _re.findall(r'<col[^>]*>', html)
print(f'colgroup cols: {len(cols)}')
for i, c in enumerate(cols):
    print(f'  col[{i}]: {c}')
