import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# 1) 전체 리스닝 포트 확인
_, o, _ = ssh.exec_command('ss -tlnp | grep -E "LISTEN"')
print('=== LISTENING PORTS ===')
print(o.read().decode())

# 2) systemd 서비스 목록 (blossom, lumina 관련)
_, o, _ = ssh.exec_command('systemctl list-units --type=service --state=running | grep -iE "blossom|lumina"')
print('=== SERVICES ===')
print(o.read().decode())

# 3) gunicorn 프로세스 확인
_, o, _ = ssh.exec_command('ps aux | grep gunicorn | grep -v grep')
print('=== GUNICORN PROCESSES ===')
print(o.read().decode())

# 4) blossom-web gunicorn config (bind port)
_, o, _ = ssh.exec_command('cat /opt/blossom/web/gunicorn_blossom.conf.py 2>/dev/null')
print('=== blossom gunicorn config ===')
print(o.read().decode())

# 5) lumina gunicorn config 확인
_, o, _ = ssh.exec_command('cat /opt/blossom/lumina/web/gunicorn*.conf.py 2>/dev/null; cat /opt/lumina/web/gunicorn*.conf.py 2>/dev/null')
print('=== lumina gunicorn config ===')
print(o.read().decode())

# 6) systemd service 파일들
_, o, _ = ssh.exec_command('cat /usr/lib/systemd/system/blossom-web.service 2>/dev/null')
print('=== blossom-web.service ===')
print(o.read().decode())

_, o, _ = ssh.exec_command('systemctl list-unit-files | grep -iE "blossom|lumina"')
print('=== unit files ===')
print(o.read().decode())

ssh.close()
