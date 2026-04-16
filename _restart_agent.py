"""Reset and restart agent on ttt4."""
import paramiko
import time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.109", username="root", password="123456", timeout=10)

# Reset failure limiter and start
for cmd in ["systemctl reset-failed lumina-agent", "systemctl start lumina-agent"]:
    stdin, stdout, stderr = c.exec_command(cmd)
    stdout.channel.recv_exit_status()
    print(f"OK: {cmd}")

time.sleep(6)

stdin, stdout, stderr = c.exec_command("systemctl status lumina-agent --no-pager")
print(stdout.read().decode())

stdin, stdout, stderr = c.exec_command("journalctl -u lumina-agent -n 10 --no-pager --output=cat")
print(stdout.read().decode())

c.close()
