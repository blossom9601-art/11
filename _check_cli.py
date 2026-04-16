import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.106", username="root", password="123456", timeout=10)

# Check AP server routes/CLI
cmds = [
    "wc -l /opt/blossom/lumina/ap/server.py",
    "grep -n 'route\\|cli\\|command\\|api/' /opt/blossom/lumina/ap/server.py | head -60",
    "find /opt/blossom/lumina -name '*.py' | sort",
]
for cmd in cmds:
    stdin, stdout, stderr = c.exec_command(cmd)
    print(f"--- {cmd[:70]} ---")
    print(stdout.read().decode().strip())
    print()
c.close()
