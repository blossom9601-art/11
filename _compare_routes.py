import requests, urllib3
urllib3.disable_warnings()
s = requests.Session()
s.get('https://192.168.56.108/login', verify=False, timeout=15)
s.post('https://192.168.56.108/login', data={'employee_id':'admin','password':'admin1234!'}, verify=False, timeout=15)
r = s.get('https://192.168.56.108/__routes', verify=False, timeout=15)
data = r.json()
page_rules = [x for x in data['rules'] if x['endpoint'].startswith('main.') and 'GET' in x['methods']]
for p in sorted(page_rules, key=lambda x: x['rule']):
    print(f"{p['rule']:55s} {p['endpoint']}")
print(f"\nTotal page routes: {len(page_rules)}")

# Also compare with local
r2 = requests.get('http://127.0.0.1:8080/__routes', timeout=10)
if r2.status_code == 200:
    local_data = r2.json()
    local_pages = set(x['rule'] for x in local_data['rules'] if x['endpoint'].startswith('main.') and 'GET' in x['methods'])
    remote_pages = set(p['rule'] for p in page_rules)
    missing = local_pages - remote_pages
    if missing:
        print(f"\n=== LOCAL에만 있는 라우트 ({len(missing)}개) ===")
        for m in sorted(missing):
            print(f"  {m}")
    else:
        print("\n라우트 동일!")
    print(f"\nLocal pages: {len(local_pages)}, Remote pages: {len(remote_pages)}")
else:
    print("Local server not reachable (skip comparison)")
