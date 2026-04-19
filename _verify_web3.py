import requests, urllib3
urllib3.disable_warnings()
s = requests.Session()

# 1. Login
r1 = s.post('https://192.168.56.108/login',
            data={'employee_id': 'admin', 'password': 'admin1234!'},
            verify=False, allow_redirects=True)
print('Login:', r1.status_code, r1.url)

# 2. Fetch version page as SPA XHR (how the browser actually loads it)
r2 = s.get('https://192.168.56.108/admin/auth/version',
           headers={'X-Requested-With': 'blossom-spa'},
           verify=False)
print('Version page (SPA):', r2.status_code, len(r2.text))

html = r2.text
checks = {
    'search-select': html.count('search-select'),
    'searchable_select': html.count('searchable_select'),
    'vr-status-filter': html.count('vr-status-filter'),
    'data-searchable-scope': html.count('data-searchable-scope'),
    'version.js?v=4.2.7': html.count('version.js?v=4.2.7'),
    'version.js?v=4.2.5': html.count('version.js?v=4.2.5'),
    'edit-rn-status search-select': html.count('search-select" id="edit-rn-status"') + html.count("search-select' id='edit-rn-status'"),
}
for k, v in checks.items():
    tag = 'OK' if v > 0 else 'MISSING'
    print(f'  {k}: {v} [{tag}]')

# Show filter area
idx = html.find('vr-status-filter')
if idx > 0:
    print('\n--- status filter context ---')
    print(html[max(0,idx-200):idx+300])
else:
    print('\nERROR: vr-status-filter NOT FOUND in served HTML!')
    idx2 = html.find('tab-header-right')
    if idx2 > 0:
        print('--- tab-header-right ---')
        print(html[idx2:idx2+500])
