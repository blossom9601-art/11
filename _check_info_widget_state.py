import requests
import urllib3
import re

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

base = 'https://192.168.56.108'

html = requests.get(base + '/p/wf_designer_manage', verify=False, timeout=8).text
m = re.search(r'data-info-key="([^"]+)"', html)
key = m.group(1) if m else 'NONE'
print('info_key=', key)

s = requests.Session()
s.verify = False
s.post(base + '/login', data={'employee_id': 'admin', 'password': 'admin1234!'}, timeout=8)
if key != 'NONE':
    r = s.get(base + '/api/info-messages/' + key, timeout=8)
    print('api_status=', r.status_code)
    print('api_body=', r.text[:1000])
