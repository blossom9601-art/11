#!/usr/bin/env python3
"""Check current Lumina state: DB agents, services, configs on all 3 servers."""
import paramiko

SERVERS = [
    {"name": "ttt1 (DB)",  "ip": "192.168.56.107"},
    {"name": "ttt2 (AP)",  "ip": "192.168.56.106"},
    {"name": "ttt3 (WEB)", "ip": "192.168.56.108"},
]

def ssh_run(ip, cmd):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(ip, username="root", password="123456", timeout=5)
        _, stdout, stderr = ssh.exec_command(cmd, timeout=15)
        return stdout.read().decode("utf-8", errors="replace")
    except Exception as e:
        return "ERROR: %s" % e
    finally:
        ssh.close()

# 1) DB server — check collected_hosts count
print("=" * 60)
print("1. DB Agent Count (ttt1)")
print("=" * 60)
print(ssh_run("192.168.56.107",
    "mysql -u root lumina -e 'SELECT COUNT(*) AS agent_count FROM collected_hosts;' 2>/dev/null || echo 'DB not accessible'"))

print(ssh_run("192.168.56.107",
    "mysql -u root lumina -e 'SELECT id, hostname, approval_status, last_seen FROM collected_hosts ORDER BY id;' 2>/dev/null || echo 'N/A'"))

# 2) All servers — check installed RPMs, services, key files
for s in SERVERS:
    print("=" * 60)
    print(s["name"], s["ip"])
    print("=" * 60)

    cmds = [
        ("RPM Packages", "rpm -qa | grep -i lumina | sort 2>/dev/null || echo 'no rpm'"),
        ("Services", "systemctl list-units --type=service --all | grep lumina 2>/dev/null || echo 'no lumina services'"),
        ("Key Dirs", "ls -la /opt/blossom/lumina/ 2>/dev/null || echo '/opt/blossom/lumina not found'"),
        ("Config", "ls -la /etc/blossom/lumina/ 2>/dev/null || echo 'no config dir'"),
        ("Chrony", "grep -E '^(server|pool) ' /etc/chrony.conf 2>/dev/null || echo 'no chrony.conf'"),
        ("Admin PW", "cat /var/lib/blossom/lumina/web/admin_pw 2>/dev/null || echo 'no pw file'"),
    ]

    for label, cmd in cmds:
        print("--- %s ---" % label)
        print(ssh_run(s["ip"], cmd))

print("DONE")
