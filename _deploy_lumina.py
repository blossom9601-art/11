"""Deploy updated Lumina web app (app_factory.py) to ttt3."""
import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# 1. Upload to __init__.py (the actual entry point)
print("[1/3] Uploading app_factory.py -> __init__.py...")
sftp = ssh.open_sftp()
sftp.put('agents/web/app_factory.py', '/opt/blossom/lumina/web/app/__init__.py')
sftp.close()
print("  Done")

# 2. Clear pycache
print("[2/3] Clearing pycache...")
ssh.exec_command('rm -rf /opt/blossom/lumina/web/app/__pycache__ /opt/blossom/lumina/web/__pycache__', timeout=5)[1].read()
print("  Done")

# 3. Restart
print("[3/3] Restarting lumina-web service...")
ssh.exec_command('systemctl restart lumina-web', timeout=10)[1].read()
time.sleep(3)

_, o, _ = ssh.exec_command('systemctl is-active lumina-web', timeout=5)
status = o.read().decode().strip()
print(f"  Service: {status}")

if status == "active":
    _, o, _ = ssh.exec_command('curl -sk https://127.0.0.1:9601/health', timeout=5)
    print(f"  Health: {o.read().decode().strip()}")

    _, o, _ = ssh.exec_command('curl -sk https://127.0.0.1:9601/login', timeout=5)
    login_html = o.read().decode()
    print(f"  Login lang=en: {'lang=\"en\"' in login_html}")
    print(f"  No Korean: {all(ord(c) < 0xAC00 or ord(c) > 0xD7A3 for c in login_html)}")
    print(f"  English subtitle: {'Administrator authentication required' in login_html}")

    # Login and check settings
    _, o, _ = ssh.exec_command(
        'curl -sk -c /tmp/lck.txt -X POST https://127.0.0.1:9601/login '
        '-d "emp_no=admin&password=admin1234!" -o /dev/null -w "%{http_code}"',
        timeout=5)
    print(f"  Login POST: {o.read().decode()}")

    _, o, _ = ssh.exec_command(
        'curl -sk -b /tmp/lck.txt https://127.0.0.1:9601/settings -o /dev/null -w "%{http_code}"',
        timeout=5)
    print(f"  /settings: {o.read().decode()}")

    _, o, _ = ssh.exec_command(
        'curl -sk -b /tmp/lck.txt https://127.0.0.1:9601/settings',
        timeout=5)
    settings_html = o.read().decode()
    print(f"  NTP Config present: {'NTP Configuration' in settings_html}")
    print(f"  Settings title: {'Lumina' in settings_html and 'Settings' in settings_html}")

    print("\nDeployment successful!")
else:
    print("\n[ERROR] Service not active!")
    _, o, _ = ssh.exec_command('journalctl -u lumina-web --no-pager -n 30', timeout=5)
    print(o.read().decode())

ssh.close()
