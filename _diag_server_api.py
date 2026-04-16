import requests, urllib3
urllib3.disable_warnings()

s = requests.Session()
s.get('https://192.168.56.108/login', verify=False, timeout=15)
s.post('https://192.168.56.108/login',
    data={'employee_id': 'admin', 'password': 'admin1234!'},
    verify=False, timeout=15)

# Test server list API
apis = [
    '/api/servers',
    '/api/servers?page=1&per_page=20',
    '/api/hardware/servers',
    '/api/hardware/servers?page=1&per_page=20',
]
for api in apis:
    r = s.get(f'https://192.168.56.108{api}', verify=False, timeout=10,
              headers={'X-Requested-With': 'XMLHttpRequest'})
    print(f'{api}: {r.status_code}')
    if r.status_code == 200:
        try:
            j = r.json()
            print(f'  keys: {list(j.keys())[:10]}')
            if 'error' in j:
                print(f'  error: {j["error"]}')
            if 'success' in j:
                print(f'  success: {j["success"]}')
        except:
            print(f'  body: {r.text[:200]}')
    else:
        print(f'  body: {r.text[:300]}')
