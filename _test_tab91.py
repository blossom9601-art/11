import requests

s = requests.Session()
s.post('http://127.0.0.1:8080/auth/login', data={'user_id': 'admin', 'password': 'admin'})

# Set category context
s.get('http://127.0.0.1:8080/p/cat_business_group_system?group_id=1')

# SPA request
r = s.get('http://127.0.0.1:8080/p/cat_business_group_system',
          headers={'X-Requested-With': 'blossom-spa'})
d = r.text
print('STATUS:', r.status_code)
print('PRESET:', 'data-preset' in d)
print('TABS:', 'server-detail-tab-btn' in d)
print('PGSIZE:', 't91-page-size' in d)

if 'data-preset' in d:
    import re
    m = re.search(r'data-preset="([^"]+)"', d)
    print('PRESET_VAL:', m.group(1) if m else 'N/A')
    m2 = re.search(r'data-api-base="([^"]+)"', d)
    print('API_BASE:', m2.group(1) if m2 else 'N/A')
