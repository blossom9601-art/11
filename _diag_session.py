import requests, urllib3
urllib3.disable_warnings()

s = requests.Session()

# 1. Login
r = s.get('https://192.168.56.108/login', verify=False, timeout=15)
print('GET /login:', r.status_code)

r2 = s.post('https://192.168.56.108/login',
    data={'employee_id': 'admin', 'password': 'admin1234!'},
    verify=False, allow_redirects=False, timeout=15)
print('POST /login:', r2.status_code, 'Loc:', r2.headers.get('Location', ''))

# Follow redirect
if r2.status_code == 302:
    loc = r2.headers['Location']
    if not loc.startswith('http'):
        loc = 'https://192.168.56.108' + loc
    r3 = s.get(loc, verify=False, timeout=15)
    print('Follow redirect:', r3.status_code, r3.url)

# 2. Check session cookies
print('\nCookies:')
for c in s.cookies:
    print(f'  {c.name}={c.value[:30]}... domain={c.domain} path={c.path} secure={c.secure}')

# 3. Try heartbeat
r4 = s.get('https://192.168.56.108/api/session/heartbeat', verify=False, timeout=10,
           headers={'X-Requested-With': 'XMLHttpRequest'}, allow_redirects=False)
print(f'\nHeartbeat: {r4.status_code}')
if r4.status_code >= 300:
    print('  Location:', r4.headers.get('Location', ''))
    print('  Body:', r4.text[:200])

# 4. Try dashboard
r5 = s.get('https://192.168.56.108/dashboard', verify=False, timeout=15, allow_redirects=False)
print(f'\nDashboard: {r5.status_code}')
if r5.status_code >= 300:
    print('  Location:', r5.headers.get('Location', ''))
