import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

checks = [
    ('blossom-web 상태', 'systemctl status blossom-web.service --no-pager -l | head -20'),
    ('lumina-web 상태', 'systemctl status lumina-web.service --no-pager -l | head -20'),
    ('포트 사용', 'ss -tlnp | grep -E "800[01]"'),
    ('gunicorn 프로세스', 'ps aux | grep gunicorn | grep -v grep'),
    ('blossom-web 서비스파일', 'cat /etc/systemd/system/blossom-web.service'),
    ('nginx 캐시설정', 'grep -n "proxy_cache\\|proxy_buffering\\|expires\\|Cache-Control" /etc/nginx/conf.d/blossom-lumina.conf || echo "(없음)"'),
    ('brand.js 기본값', 'grep -n "기본값" /opt/blossom/web/static/js/authentication/11-3.admin/11-3-3.setting/10.brand.js || echo "(파일에 기본값 없음)"'),
    ('brand.html 기본값', 'grep -n "기본값" /opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html || echo "(파일에 기본값 없음)"'),
    ('nginx서빙 brand.js', 'curl -sk https://127.0.0.1/static/js/authentication/11-3.admin/11-3-3.setting/10.brand.js 2>/dev/null | grep "기본값" || echo "(nginx서빙에도 기본값 없음)"'),
    ('nginx 서버블록', 'grep -n "listen\\|server_name\\|proxy_pass\\|location" /etc/nginx/conf.d/blossom-lumina.conf'),
    ('nginx static 설정', 'grep -A3 "location.*static" /etc/nginx/conf.d/blossom-lumina.conf'),
    ('blossom enabled?', 'systemctl is-enabled blossom-web.service'),
    ('lumina enabled?', 'systemctl is-enabled lumina-web.service'),
    ('사이드바 메뉴 관련', 'grep -rn "파일관리\\|file.management\\|file_management" /opt/blossom/web/static/js/blossom.js || echo "(blossom.js에 없음)"'),
    ('사이드바 메뉴 DB', "sqlite3 /opt/blossom/web/instance/blossom.db \".tables\" 2>/dev/null || echo '(테이블 목록 실패)'"),
]

for label, cmd in checks:
    print(f'\n=== {label} ===')
    _, o, e = ssh.exec_command(cmd)
    out = o.read().decode('utf-8', errors='replace').strip()
    err = e.read().decode('utf-8', errors='replace').strip()
    if out: print(out)
    if err and 'grep' not in err: print(f'[stderr] {err}')

ssh.close()
