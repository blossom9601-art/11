"""Diagnose script tags in authority_records SPA response."""
import re
from app import create_app

app = create_app()
client = app.test_client()
client.post('/login', data={'employee_id': 'admin', 'password': 'admin1234!'})

r = client.get('/p/dc_authority_records', headers={'X-Requested-With': 'blossom-spa'})
html = r.data.decode('utf-8')

# Find all script tags
for m in re.finditer(r'<script[^>]*>', html):
    tag = m.group(0)
    # Get a bit of context after
    end = html.find('</script>', m.end())
    if end == -1:
        end = m.end() + 100
    content = html[m.end():end]
    if 'src=' in tag:
        print(f'  EXTERNAL: {tag}')
    else:
        print(f'  INLINE: {tag} -> {content[:80]}...')

# Check if init() is in the JS file
js_path = 'static/js/6.datacenter/6-1.access/6-1-4.authority_records/1.authority_records_list.js'
js_text = open(js_path, encoding='utf-8').read()
# Check for init call at end
last_lines = js_text.strip().split('\n')[-5:]
print('\n--- Last 5 lines of JS ---')
for line in last_lines:
    print(line)

# Check if readyState check is correct
idx = js_text.find("readyState==='loading'")
if idx >= 0:
    print(f'\nreadyState check at pos {idx}:')
    print(js_text[idx-10:idx+150])
