"""Fix agent log directory permissions on ttt4 and restart."""
import paramiko
import time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.109", username="root", password="123456", timeout=10)

# Check agent.conf log settings
stdin, stdout, stderr = c.exec_command("cat /etc/blossom/lumina/agent.conf")
print("=== agent.conf ===")
print(stdout.read().decode())

# Create log directory with proper ownership
cmds = [
    "mkdir -p /var/log/blossom/lumina/agent",
    "chown -R lumina:lumina /var/log/blossom/lumina",
    "mkdir -p /var/lib/blossom/lumina/agent",
    "chown -R lumina:lumina /var/lib/blossom/lumina/agent",
    # Also fix old path
    "mkdir -p /var/log/lumina",
    "chown -R lumina:lumina /var/log/lumina",
]
for cmd in cmds:
    stdin, stdout, stderr = c.exec_command(cmd)
    stdout.channel.recv_exit_status()
    print(f"  OK: {cmd}")

# Restart agent
stdin, stdout, stderr = c.exec_command("systemctl restart lumina-agent")
stdout.channel.recv_exit_status()
time.sleep(5)

# Check status
stdin, stdout, stderr = c.exec_command("systemctl status lumina-agent --no-pager | head -15")
print(stdout.read().decode())

stdin, stdout, stderr = c.exec_command("journalctl -u lumina-agent -n 8 --no-pager --output=cat --since='30 sec ago'")
print(stdout.read().decode())

c.close()
print("Done.")
