"""nginx 정적 파일 캐시 정책 수정 + reload"""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# 1) immutable 캐시 → must-revalidate로 변경
cmds = [
    "sed -i 's/expires 7d;/expires 1h;/' /etc/nginx/conf.d/blossom-lumina.conf",
    'sed -i \'s/Cache-Control "public, immutable"/Cache-Control "public, must-revalidate"/\' /etc/nginx/conf.d/blossom-lumina.conf',
]
for c in cmds:
    _, o, e = ssh.exec_command(c)
    err = e.read().decode().strip()
    if err:
        print(f'sed error: {err}')

# 2) 변경 확인
_, o, _ = ssh.exec_command('grep -A3 "location /static" /etc/nginx/conf.d/blossom-lumina.conf | head -10')
print('=== 변경 후 static 블록 ===')
print(o.read().decode())

# 3) nginx 설정 테스트
_, o, e = ssh.exec_command('nginx -t 2>&1')
result = o.read().decode() + e.read().decode()
print(f'nginx -t: {result}')

# 4) nginx reload
_, o, e = ssh.exec_command('systemctl reload nginx')
e.read()

# 5) blossom-web 재시작
_, o, e = ssh.exec_command('systemctl restart blossom-web.service')
e.read()

import time
time.sleep(2)

_, o, _ = ssh.exec_command('systemctl is-active nginx')
print(f'nginx: {o.read().decode().strip()}')

_, o, _ = ssh.exec_command('systemctl is-active blossom-web.service')
print(f'blossom-web: {o.read().decode().strip()}')

# 6) 실제 응답 헤더로 캐시 정책 확인
_, o, _ = ssh.exec_command('curl -skI https://127.0.0.1/static/js/blossom.js | grep -i cache')
print(f'\nblossom.js 캐시 헤더:')
print(o.read().decode())

ssh.close()
print('완료.')
