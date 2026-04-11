#!/bin/bash
sshpass -p '123456' ssh -o StrictHostKeyChecking=no root@192.168.56.105 << 'ENDSSH'

echo "=== SPA Boot code on server (deployed blossom.js) ==="
sed -n '4235,4310p' /opt/blossom/lumina/web/static/js/blossom.js

echo ""
echo "=== __spaSwapMain on server ==="
grep -n '__spaSwapMain\|__spaLoadScripts\|replaceWith\|main-content' /opt/blossom/lumina/web/static/js/blossom.js | head -30

echo ""
echo "=== Check if blossom-query scripts exist ==="
ls -la /opt/blossom/lumina/web/static/js/blossom-query*.js 2>/dev/null

echo ""
echo "=== Full SPA simulation: fetch dashboard with session, check main content ==="
python3 -c "
import requests, re
s = requests.Session()
s.verify = False
# Login
s.post('https://192.168.56.105/login', data={'employee_id':'admin','password':'admin1234!'})
# SPA boot: fetch /p/dashboard with SPA header  
r = s.get('https://192.168.56.105/p/dashboard', headers={'X-Requested-With':'blossom-spa'})
print('Status:', r.status_code)
print('Content-Type:', r.headers.get('Content-Type'))
print('CSP:', r.headers.get('Content-Security-Policy', 'NONE'))

# Check for <main> in response
body = r.text
main_match = re.search(r'<main[^>]*class=\"main-content\"[^>]*>(.*?)</main>', body, re.DOTALL)
if main_match:
    main_inner = main_match.group(1)
    print('Main content length:', len(main_inner))
    # Is it the skeleton or actual content?
    has_skeleton = 'spa-skeleton' in main_inner
    has_dashboard = 'dashboard-sections' in main_inner or 'kpi-' in main_inner
    print('Has skeleton:', has_skeleton)
    print('Has dashboard content:', has_dashboard)
    # First 200 chars  
    print('Main preview:', main_inner[:300])
else:
    # Maybe data-spa-boot?
    boot_match = re.search(r'data-spa-boot', body)
    print('Has data-spa-boot:', bool(boot_match))
    print('No main-content found')
    # Show first 500 chars
    print('Body preview:', body[:500])

print()
print('=== Script tags in response ===')
scripts = re.findall(r'<script[^>]*(?:src=\"([^\"]+)\")?[^>]*>', body)
for s_src in scripts:
    print(' script:', s_src if s_src else '(inline)')
" 2>/dev/null

echo ""
echo "=== Check response headers for /p/dashboard (browser visit, no SPA header) ==="
python3 -c "
import requests
s = requests.Session()
s.verify = False
s.post('https://192.168.56.105/login', data={'employee_id':'admin','password':'admin1234!'})
r = s.get('https://192.168.56.105/p/dashboard')
print('Status:', r.status_code)
print('Content-Type:', r.headers.get('Content-Type'))
body = r.text
has_boot = 'data-spa-boot' in body
has_blossom_js = 'blossom.js' in body
print('Has data-spa-boot:', has_boot)
print('Has blossom.js:', has_blossom_js)
# Check CSS links
import re
css_links = re.findall(r'href=\"([^\"]+\.css[^\"]*)', body)
print('CSS links:', css_links)
# Check scripts
scripts = re.findall(r'src=\"([^\"]+\.js[^\"]*)', body)
print('Script links:', scripts)
" 2>/dev/null
ENDSSH
