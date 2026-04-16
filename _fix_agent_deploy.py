"""Fix agent.py on ttt4 and restart."""
import paramiko
import os
import time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.109", username="root", password="123456", timeout=10)

# Upload fixed agent.py
sftp = c.open_sftp()
sftp.put(os.path.join("agents", "linux", "agent.py"), "/opt/blossom/lumina/agent/agent.py")
sftp.close()

# Fix CRLF
cmd = "sed -i 's/\\r$//' /opt/blossom/lumina/agent/agent.py"
stdin, stdout, stderr = c.exec_command(cmd)
stdout.channel.recv_exit_status()

# Restart agent
stdin, stdout, stderr = c.exec_command("systemctl restart lumina-agent")
stdout.channel.recv_exit_status()

time.sleep(5)

# Check status
stdin, stdout, stderr = c.exec_command("systemctl status lumina-agent --no-pager | head -15")
print(stdout.read().decode())

stdin, stdout, stderr = c.exec_command("journalctl -u lumina-agent -n 8 --no-pager --since='1 min ago'")
print(stdout.read().decode())

c.close()
print("Done.")
