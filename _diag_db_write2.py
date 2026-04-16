import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# 1. Check Gunicorn process user
_, o, _ = ssh.exec_command('ps aux | grep -i "[g]unicorn.*blossom"', timeout=5)
print("=== Gunicorn processes ===")
print(o.read().decode())

# 2. Check systemd service User= directive
_, o, _ = ssh.exec_command('cat /etc/systemd/system/blossom-web.service', timeout=5)
print("=== blossom-web.service ===")
print(o.read().decode())

# 3. SELinux audit log for denied writes
_, o, _ = ssh.exec_command('ausearch -m avc --start recent 2>/dev/null || grep "avc.*denied" /var/log/audit/audit.log | tail -20', timeout=5)
print("=== SELinux AVC denials ===")
print(o.read().decode())

# 4. getenforce
_, o, _ = ssh.exec_command('getenforce', timeout=5)
print("=== SELinux mode ===")
print(o.read().decode())

# 5. Check if instance dir itself is writable by gunicorn user
_, o, _ = ssh.exec_command('stat -c "%U:%G %a %n" /opt/blossom/web/instance/ /opt/blossom/web/instance/dev_blossom.db /opt/blossom/web/instance/dev_blossom.db-wal /opt/blossom/web/instance/dev_blossom.db-shm', timeout=5)
print("=== Ownership & perms ===")
print(o.read().decode())

# 6. SELinux context on web/ parent dir
_, o, _ = ssh.exec_command('ls -laZ /opt/blossom/web/ | head -15', timeout=5)
print("=== web/ SELinux context ===")
print(o.read().decode())

ssh.close()
