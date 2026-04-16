import paramiko, sys

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=10)

def run(cmd, timeout=15):
    _, so, se = ssh.exec_command(cmd, timeout=timeout)
    out = so.read().decode('utf-8', 'ignore').strip()
    err = se.read().decode('utf-8', 'ignore').strip()
    return out, err

print('=== 1) journalctl: profile-related errors ===')
out, _ = run('journalctl -u blossom-web --no-pager -n 60 | grep -i "me.profile\\|profile_image\\|Failed to update\\|session.*expir\\|login_at\\|401\\|500"')
print(out or '(no matches)')

print('\n=== 2) journalctl: last 30 lines ===')
out, _ = run('journalctl -u blossom-web --no-pager -n 30')
print(out)

print('\n=== 3) blossom.js: initSettingsAvatarPickerFallback exists on remote? ===')
out, _ = run('grep -c "initSettingsAvatarPickerFallback" /opt/blossom/web/static/js/blossom.js')
print('count on remote:', out)

print('\n=== 4) 11-1-1.admin.js: key function lines ===')
out, _ = run('grep -n "updateMeProfile\\|profile_image\\|credentials\\|openPicker" /opt/blossom/web/static/js/authentication/11-1.setting/11-1-1.admin.js | head -20')
print(out)

print('\n=== 5) _login_at in __init__.py (session setter) ===')
out, _ = run('grep -n "_login_at" /opt/blossom/web/app/__init__.py | head -20')
print(out)

print('\n=== 6) me_profile route: normalization block on remote ===')
out, _ = run('sed -n "4595,4640p" /opt/blossom/web/app/routes/api.py')
print(out)

print('\n=== 7) nginx access log: recent POST /api/me/profile ===')
out, _ = run('grep "POST /api/me/profile" /var/log/nginx/access.log 2>/dev/null | tail -10 || echo "(no nginx access log or no matches)"')
print(out)

print('\n=== 8) gunicorn access log: any /api/me/profile ===')
out, _ = run('journalctl -u blossom-web --no-pager -n 200 | grep "api/me/profile" | tail -10')
print(out or '(no matches in gunicorn log)')

# 9) Test the actual API with a session - login first then POST
print('\n=== 9) Login + POST /api/me/profile curl test ===')
curl_cmd = (
    'COOKIE=$(curl -sk -X POST https://192.168.56.108/login '
    '-d "username=admin&password=admin123" -c /tmp/blossom_test.jar -b /tmp/blossom_test.jar -w "%{http_code}" -o /tmp/login_body.txt 2>&1); '
    'echo "Login HTTP: $COOKIE"; '
    'echo "Login body: $(cat /tmp/login_body.txt | head -5)"; '
    'POST_RESULT=$(curl -sk -X POST https://192.168.56.108/api/me/profile '
    '-H "Content-Type: application/json" '
    '-H "Accept: application/json" '
    '-b /tmp/blossom_test.jar '
    '-d \'{"profile_image":"/static/image/svg/profil/001-boy.svg"}\' '
    '-w "\\nHTTP_CODE:%{http_code}" 2>&1); '
    'echo "Profile POST result: $POST_RESULT"'
)
out, err = run(curl_cmd, timeout=20)
print(out)
if err:
    print('err:', err)

ssh.close()
print('\nDone.')
