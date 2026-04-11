#!/bin/bash
sshpass -p '123456' ssh -o StrictHostKeyChecking=no root@192.168.56.105 << 'ENDSSH'
python3 -c "
import requests, re
s = requests.Session()
s.verify = False
s.post('https://192.168.56.105/login', data={'employee_id':'admin','password':'admin1234!'})
r = s.get('https://192.168.56.105/addon/notifications', headers={'X-Requested-With':'blossom-spa'})
body = r.text
scripts = re.findall(r'<script[^>]*src=\"([^\"]+)\"[^>]*>', body)
print('Script SRCs:')
for s in scripts:
    print(' ', s)
print()
print('Has lottie:', 'lottie' in body)
print('Has 2.alarm.js:', '2.alarm.js' in body)
print('Has alarm-page:', 'alarm-page' in body)
" 2>/dev/null
ENDSSH
