"""Diagnose agent.py on ttt4."""
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.109", username="root", password="123456", timeout=10)

# Check current imports in agent.py
stdin, stdout, stderr = c.exec_command("head -35 /opt/blossom/lumina/agent/agent.py")
print("=== agent.py lines 1-35 ===")
print(stdout.read().decode())

# Check directory structure
stdin, stdout, stderr = c.exec_command("find /opt/blossom/lumina/agent -type f | sort")
print("=== file structure ===")
print(stdout.read().decode())

# Try running directly
stdin, stdout, stderr = c.exec_command("cd /opt/blossom/lumina/agent && python3 -c 'import sys; sys.path.insert(0, \".\"); sys.path.insert(0, \"..\"); from collectors.interface import InterfaceCollector; print(\"OK\")'")
print("=== direct import test ===")
print(stdout.read().decode())
print(stderr.read().decode())

# Latest journal
stdin, stdout, stderr = c.exec_command("journalctl -u lumina-agent -n 5 --no-pager --output=cat")
print("=== latest journal ===")
print(stdout.read().decode())

c.close()
