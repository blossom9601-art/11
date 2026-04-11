#!/bin/bash
sshpass -p '123456' ssh -o StrictHostKeyChecking=no root@192.168.56.105 << 'ENDSSH'

echo "=== 1) SPA에서 알림 페이지 요청 시 반환되는 HTML 확인 ==="
python3 -c "
import requests, re
s = requests.Session()
s.verify = False
s.post('https://192.168.56.105/login', data={'employee_id':'admin','password':'admin1234!'})

# SPA fetch (blossom.js가 하는 것과 동일)
r = s.get('https://192.168.56.105/addon/notifications', headers={'X-Requested-With':'blossom-spa'})
print('Status:', r.status_code)

body = r.text
# Check <main> tag classes
main_match = re.search(r'<main[^>]*class=\"([^\"]+)\"', body)
if main_match:
    print('Main classes:', main_match.group(1))
else:
    print('No main tag found')

# Check page-header content
header_match = re.search(r'<div class=\"page-header\">(.*?)</div>', body, re.DOTALL)
if header_match:
    print('Page header:', header_match.group(1)[:200])

# Check CSS links in response
css_links = re.findall(r'href=\"([^\"]+\.css[^\"]*)', body)
print('CSS links:', css_links)

# Check script tags
scripts = re.findall(r'src=\"([^\"]+\.js[^\"]*)', body)
print('Script links:', scripts[:10])
" 2>/dev/null

echo ""
echo "=== 2) 직접 문제 확인 — served CSS의 alarm-page 존재 확인 ==="
python3 -c "
import requests
s = requests.Session()
s.verify = False
s.post('https://192.168.56.105/login', data={'employee_id':'admin','password':'admin1234!'})
r = s.get('https://192.168.56.105/static/css/blossom.css?v=1.2.4')
css = r.text
# Check alarm-page styles
idx = css.find('.alarm-page .page-header h1')
if idx >= 0:
    print('alarm-page h1 style found at char', idx)
    print('Snippet:', css[idx:idx+100])
else:
    print('WARNING: alarm-page h1 style NOT FOUND!')
    
# Check generic page-header h1
idx2 = css.find('.page-header h1')
if idx2 >= 0:
    print('Generic page-header h1 found at char', idx2)
    print('Snippet:', css[idx2:idx2+100])
" 2>/dev/null

echo ""
echo "=== 3) addon_notifications 라우트 확인 ==="
grep -n 'addon_notifications' /opt/blossom/lumina/web/app/routes/main.py

echo ""
echo "=== 4) 알림 TEMPLATE_MAP 확인 ==="
grep -n 'addon_notifications\|alarm' /opt/blossom/lumina/web/app/routes/pages.py | head -5

echo ""
echo "=== 5) 실제 라우트: /addon/notifications 직접 방문(SPA shell) ==="
python3 -c "
import requests, re
s = requests.Session()
s.verify = False
s.post('https://192.168.56.105/login', data={'employee_id':'admin','password':'admin1234!'})
r = s.get('https://192.168.56.105/addon/notifications')
body = r.text
has_spa_boot = 'data-spa-boot' in body
has_alarm_page = 'alarm-page' in body
print('Has data-spa-boot:', has_spa_boot)
print('Has alarm-page class:', has_alarm_page)
print('blossom.css loaded:', 'blossom.css' in body)
# Show the main tag
main_match = re.search(r'<main[^>]*>', body)
if main_match:
    print('Main tag:', main_match.group(0))
" 2>/dev/null
ENDSSH
