"""Diagnose why authority_records empty state doesn't show."""
import re
from app import create_app

app = create_app()
client = app.test_client()
client.post('/login', data={'employee_id': 'admin', 'password': 'admin1234!'})

# Get the SPA fragment
r = client.get('/p/dc_authority_records', headers={'X-Requested-With': 'blossom-spa'})
html = r.data.decode('utf-8')
print(f'Status: {r.status_code}, Length: {len(html)}')

# Check system-empty
count = html.count('system-empty')
print(f'system-empty occurrences: {count}')

# Find system-empty div
for m in re.finditer(r'id="system-empty"', html):
    s = max(0, m.start() - 20)
    e = min(len(html), m.end() + 120)
    print(f'At pos {m.start()}: ...{html[s:e]}...')

# Check JS file reference
for m in re.finditer(r'authority_records[^"]*\.js', html):
    print(f'JS ref: {m.group(0)}')

# Compare with authority_control
r2 = client.get('/p/dc_authority_control', headers={'X-Requested-With': 'blossom-spa'})
html2 = r2.data.decode('utf-8')
count2 = html2.count('system-empty')
print(f'\nauthority_control system-empty occurrences: {count2}')

# Check API
r3 = client.get('/api/datacenter/access/authority-records')
print(f'\nAPI response: {r3.status_code} {r3.data.decode("utf-8")[:200]}')
