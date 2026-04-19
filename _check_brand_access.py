import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# Blossom(8001)에서 brand 라우트 접근 테스트
_, o, _ = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8001/admin/auth/brand')
print('Blossom(8001) /admin/auth/brand:', o.read().decode())

# Lumina(8000)에서 brand 라우트 접근 테스트
_, o, _ = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/admin/auth/brand')
print('Lumina(8000) /admin/auth/brand:', o.read().decode())

# Blossom(8001)에서 brand API 테스트
_, o, _ = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8001/api/brand-settings')
print('Blossom(8001) /api/brand-settings:', o.read().decode())

# 443 -> brand 접속 테스트
_, o, _ = ssh.exec_command('curl -ks -o /dev/null -w "%{http_code}" https://localhost/admin/auth/brand')
print('nginx:443 /admin/auth/brand:', o.read().decode())

# 9601 -> brand 접속 테스트
_, o, _ = ssh.exec_command('curl -ks -o /dev/null -w "%{http_code}" https://localhost:9601/admin/auth/brand')
print('nginx:9601 /admin/auth/brand:', o.read().decode())

# 443 설정 메뉴 접속 경로 확인
_, o, _ = ssh.exec_command('curl -ks https://localhost/admin/auth/brand 2>&1 | head -5')
print('\n=== 443 brand page content ===')
print(o.read().decode())

ssh.close()
