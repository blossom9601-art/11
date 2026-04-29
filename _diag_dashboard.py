import json, subprocess, sys

# Check Lottie JSON validity
try:
    with open('/opt/blossom/web/static/image/svg/free-animated-no-data.json') as f:
        d = json.load(f)
    print('JSON valid:', 'v=', d.get('v'), 'w=', d.get('w'), 'h=', d.get('h'), 'layers=', len(d.get('layers', [])))
except Exception as e:
    print('JSON ERROR:', e)

# Check nginx CSP
import os
for f in os.listdir('/etc/nginx/conf.d/'):
    if f.endswith('.conf'):
        txt = open('/etc/nginx/conf.d/' + f).read()
        for line in txt.splitlines():
            if 'content-security' in line.lower() or 'csp' in line.lower() or 'json' in line.lower():
                print(f + ':', line.strip())

# Check blossom-web service status
print('---SERVICE---')
os.system('systemctl is-active blossom-web')

# Check dashboard API response
print('---API---')
import urllib.request, ssl
ctx = ssl._create_unverified_context()
try:
    req = urllib.request.Request('https://localhost/api/dashboard/stats?range=1m')
    req.add_header('Cookie', '')
    resp = urllib.request.urlopen(req, context=ctx, timeout=5)
    data = json.loads(resp.read())
    print('success:', data.get('success'))
    charts = data.get('charts', {})
    for k in ['hardware', 'software', 'project']:
        items = charts.get(k, [])
        print(k + ':', len(items), 'items', items[:2] if items else '[]')
    print('maintenance:', bool(charts.get('maintenance')))
    print('task:', bool(charts.get('task')))
except Exception as e:
    print('API error:', e)
