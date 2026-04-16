import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# 1. Remove stale /dev_blossom.db at filesystem root (created by the bug)
print("=== Cleaning up stale /dev_blossom.db ===")
for f in ['/dev_blossom.db', '/dev_blossom.db-wal', '/dev_blossom.db-shm']:
    _, o, _ = ssh.exec_command(f'rm -f {f}', timeout=5)
    o.read()
print("Done")

# 2. Also clean up the stale DB in project root (not instance/)
print("\n=== Cleaning up stale /opt/blossom/web/dev_blossom.db ===")
for f in ['/opt/blossom/web/dev_blossom.db', '/opt/blossom/web/dev_blossom.db-wal', '/opt/blossom/web/dev_blossom.db-shm']:
    _, o, _ = ssh.exec_command(f'rm -f {f}', timeout=5)
    o.read()
print("Done")

# 3. Restart the service
print("\n=== Restarting blossom-web ===")
_, o, _ = ssh.exec_command('systemctl restart blossom-web', timeout=10)
o.read()

import time
time.sleep(3)

# 4. Check service status
_, o, _ = ssh.exec_command('systemctl is-active blossom-web', timeout=5)
status = o.read().decode().strip()
print(f"Service status: {status}")

# 5. Test live API via NGINX
_, o, _ = ssh.exec_command(
    'curl -sk -c /tmp/ck.txt -X POST https://127.0.0.1/api/auth/login '
    '-H "Content-Type: application/json" '
    '-d \'{"employee_id":"admin","password":"admin1234!"}\'',
    timeout=10)
print(f"\nLogin: {o.read().decode()[:100]}")

_, o, _ = ssh.exec_command(
    'curl -sk -b /tmp/ck.txt https://127.0.0.1/api/hardware/onpremise/assets',
    timeout=10)
result = o.read().decode()
print(f"API result: {result[:300]}")

ssh.close()
