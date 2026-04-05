import urllib.request
import urllib.error

url = 'http://127.0.0.1:8080/api/me/profile'
req = urllib.request.Request(url, headers={'Accept': 'application/json'})

try:
    with urllib.request.urlopen(req, timeout=5) as r:
        print('STATUS', r.status)
        print(r.read(500).decode('utf-8', 'replace'))
except urllib.error.HTTPError as e:
    print('STATUS', e.code)
    print(e.read(500).decode('utf-8', 'replace'))
