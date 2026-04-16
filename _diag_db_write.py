import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# 1. Check exact file permissions after fix
_, o, _ = ssh.exec_command('ls -la /opt/blossom/web/instance/', timeout=5)
print("=== instance/ permissions ===")
print(o.read().decode())

# 2. Check SELinux context
_, o, _ = ssh.exec_command('ls -laZ /opt/blossom/web/instance/', timeout=5)
print("=== SELinux context ===")
print(o.read().decode())

# 3. Test write from lumina-web user
_, o, e = ssh.exec_command(
    'sudo -u lumina-web python3 -c "import sqlite3; c=sqlite3.connect(\'/opt/blossom/web/instance/dev_blossom.db\'); c.execute(\'SELECT 1\'); print(\'READ OK\'); c.execute(\'CREATE TABLE IF NOT EXISTS _test_write (id INTEGER)\'); print(\'WRITE OK\'); c.execute(\'DROP TABLE IF EXISTS _test_write\'); c.close()"',
    timeout=10)
print("=== Write test as lumina-web ===")
print(o.read().decode())
err = e.read().decode()
if err.strip(): print("ERR:", err)

# 4. Full journal log for the 500 error
_, o, _ = ssh.exec_command(
    "journalctl -u blossom-web --no-pager -n 80 | grep -B2 -A10 'readonly\\|OperationalError\\|Traceback'",
    timeout=10)
print("=== Error trace ===")
print(o.read().decode()[-3000:])

ssh.close()
