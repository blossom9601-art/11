import requests, urllib3
urllib3.disable_warnings()
s = requests.Session()

# 1. Login with correct field names
r1 = s.post('https://192.168.56.108/login', 
            data={'employee_id': 'admin', 'password': 'admin1234!'},
            verify=False, allow_redirects=True)
print('Login:', r1.status_code, r1.url)

# 2. Fetch version page
r2 = s.get('https://192.168.56.108/p/admin_version', verify=False)
print('Version page:', r2.status_code, len(r2.text))

html = r2.text
checks = {
    'search-select': html.count('search-select'),
    'searchable_select': html.count('searchable_select'),
    'vr-status-filter': html.count('vr-status-filter'),
    'data-searchable-scope': html.count('data-searchable-scope'),
    'version.js?v=4.2.7': html.count('version.js?v=4.2.7'),
    'version.js?v=4.2.5': html.count('version.js?v=4.2.5'),
    'edit-rn-status': html.count('edit-rn-status'),
}
for k, v in checks.items():
    tag = 'OK' if v > 0 else 'MISSING'
    print(f'  {k}: {v} [{tag}]')

# Show filter area
idx = html.find('vr-status-filter')
if idx > 0:
    print('\n--- status filter context ---')
    print(html[max(0,idx-150):idx+250])
else:
    idx2 = html.find('tab-header-right')
    if idx2 > 0:
        print('\n--- tab-header-right ---')
        print(html[idx2:idx2+400])
    else:
        print('\nNot version page. Title area:')
        print(html[:800])
