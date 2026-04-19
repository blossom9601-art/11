import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

CONF = '/etc/nginx/conf.d/blossom-lumina.conf'

# 1) 백업
_, o, e = ssh.exec_command(f'cp {CONF} {CONF}.bak2')
e.read()
print('[1] 백업 완료')

# 2) $host → $http_host 치환 (proxy_set_header Host 라인만)
cmd = f"sed -i 's/proxy_set_header Host.*\\$host;/proxy_set_header Host              $http_host;/g' {CONF}"
_, o, e = ssh.exec_command(cmd)
err = e.read().decode()
if err:
    print(f'[ERROR] sed: {err}')
else:
    print('[2] proxy_set_header Host $http_host 치환 완료')

# 3) 변경 확인
_, o, _ = ssh.exec_command(f'grep -n "proxy_set_header Host" {CONF}')
print('[3] 변경 확인:')
print(o.read().decode())

# 4) nginx 문법 검사
_, o, e = ssh.exec_command('nginx -t 2>&1')
result = o.read().decode() + e.read().decode()
print(f'[4] nginx -t: {result}')

if 'test is successful' in result:
    # 5) nginx reload
    _, o, e = ssh.exec_command('systemctl reload nginx')
    e.read()
    print('[5] nginx reload 완료')

    # 6) 접속 테스트
    _, o, _ = ssh.exec_command('curl -kI https://localhost:9601/ 2>&1')
    print('[6] curl 테스트:')
    print(o.read().decode())
else:
    print('[ABORT] nginx 문법 오류 — 롤백')
    ssh.exec_command(f'cp {CONF}.bak2 {CONF}')

ssh.close()
