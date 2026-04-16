import requests, urllib3
urllib3.disable_warnings()

s = requests.Session()
s.get('https://192.168.56.108/login', verify=False, timeout=15)
s.post('https://192.168.56.108/login',
    data={'employee_id': 'admin', 'password': 'admin1234!'},
    verify=False, timeout=15)

# Test the exact API the JS calls
r = s.get('https://192.168.56.108/api/hardware/onpremise/assets?page_size=50',
          verify=False, timeout=10,
          headers={'X-Requested-With': 'XMLHttpRequest'})
print(f'Status: {r.status_code}')
print(f'Headers: Content-Type={r.headers.get("Content-Type")}')
print(f'Body: {r.text[:500]}')

# Also try without params
r2 = s.get('https://192.168.56.108/api/hardware/onpremise/assets',
           verify=False, timeout=10)
print(f'\nNo params - Status: {r2.status_code}')
print(f'Body: {r2.text[:500]}')
