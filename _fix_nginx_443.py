import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

CONF = '/etc/nginx/conf.d/blossom-lumina.conf'

# 1) 백업
ssh.exec_command(f'cp {CONF} {CONF}.bak3')
print('[1] 백업 완료')

# 2) HTTPS 서버 블록에 443 리스닝 추가
# 현재: listen 9601 ssl http2; → 443도 추가
cmd = r"""sed -i '/listen       9601 ssl http2;/{
    i\    listen       443 ssl http2;
}' """ + CONF

_, o, e = ssh.exec_command(cmd)
err = e.read().decode()
if err:
    print(f'[ERROR] sed 443 ipv4: {err}')

cmd2 = r"""sed -i '/listen       \[::]:9601 ssl http2;/{
    i\    listen       [::]:443 ssl http2;
}' """ + CONF

_, o, e = ssh.exec_command(cmd2)
err = e.read().decode()
if err:
    print(f'[ERROR] sed 443 ipv6: {err}')

print('[2] 443 리스닝 추가 완료')

# 3) 방화벽에 443 추가
_, o, e = ssh.exec_command('firewall-cmd --add-port=443/tcp --permanent 2>/dev/null; firewall-cmd --reload 2>/dev/null')
print('[3] 방화벽 443 추가:', o.read().decode().strip(), e.read().decode().strip())

# 4) 변경 확인
_, o, _ = ssh.exec_command(f'grep -n "listen" {CONF}')
print('[4] listen 라인 확인:')
print(o.read().decode())

# 5) nginx 문법 검사
_, o, e = ssh.exec_command('nginx -t 2>&1')
result = o.read().decode() + e.read().decode()
print(f'[5] nginx -t: {result}')

if 'test is successful' in result:
    # 6) nginx reload
    ssh.exec_command('systemctl reload nginx')
    print('[6] nginx reload 완료')

    # 7) 접속 테스트 - 443
    _, o, _ = ssh.exec_command('curl -kI https://localhost/ 2>&1 | head -10')
    print('[7] curl https://localhost:443:')
    print(o.read().decode())

    # 8) 접속 테스트 - 9601
    _, o, _ = ssh.exec_command('curl -kI https://localhost:9601/ 2>&1 | head -10')
    print('[8] curl https://localhost:9601:')
    print(o.read().decode())
else:
    print('[ABORT] nginx 문법 오류 — 롤백')
    ssh.exec_command(f'cp {CONF}.bak3 {CONF}')

ssh.close()
