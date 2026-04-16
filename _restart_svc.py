#!/usr/bin/env python3
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=10)

# Check service status
_, so, _ = ssh.exec_command('systemctl status blossom-web --no-pager -l | head -20', timeout=10)
print("=== Service Status ===")
print(so.read().decode().strip())

# Restart service
_, so, se = ssh.exec_command('systemctl restart blossom-web', timeout=15)
print("\n=== Restart ===")
print(so.read().decode().strip())
err = se.read().decode().strip()
if err:
    print("ERR:", err)

# Check again
import time
time.sleep(3)
_, so, _ = ssh.exec_command('systemctl is-active blossom-web', timeout=10)
print("\n=== Active? ===")
print(so.read().decode().strip())

ssh.close()
