import requests, urllib3, re
urllib3.disable_warnings()
s = requests.Session()

# 1. Get login page + CSRF
r0 = s.get('https://192.168.56.108/auth/login', verify=False)
print('Login page:', r0.status_code)

# Extract CSRF token
csrf = re.findall(r'name="csrf_token"\s+value="([^"]+)"', r0.text)
if not csrf:
    csrf = re.findall(r"name='csrf_token'\s+value='([^']+)'", r0.text)
print('CSRF:', csrf[:1] if csrf else 'NONE')

# 2. Login with CSRF
data = {'username': 'admin', 'password': 'admin1234!'}
if csrf:
    data['csrf_token'] = csrf[0]
r1 = s.post('https://192.168.56.108/auth/login', data=data, verify=False, allow_redirects=True)
print('Login result:', r1.status_code, r1.url)

# 3. Fetch version page
r2 = s.get('https://192.168.56.108/p/admin_version', verify=False)
print('Version page:', r2.status_code, len(r2.text))

html = r2.text
checks = {
    'search-select': html.count('search-select'),
    'searchable_select.js': html.count('searchable_select'),
    'vr-status-filter': html.count('vr-status-filter'),
    'data-searchable-scope': html.count('data-searchable-scope'),
    'version.js?v=4.2.7': html.count('version.js?v=4.2.7'),
    'version.js?v=4.2.5': html.count('version.js?v=4.2.5'),
}
for k, v in checks.items():
    status = 'OK' if v > 0 else 'MISSING'
    print(f'  {k}: {v} [{status}]')

# Show the select filter area if exists
idx = html.find('vr-status-filter')
if idx > 0:
    print('\n--- status filter context ---')
    print(html[max(0,idx-200):idx+200])
else:
    # Show what's in tab-header-right
    idx2 = html.find('tab-header-right')
    if idx2 > 0:
        print('\n--- tab-header-right context ---')
        print(html[idx2:idx2+500])
    else:
        print('\n--- first 500 chars ---')
        print(html[:500])
