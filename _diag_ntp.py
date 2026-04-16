#!/usr/bin/env python3
"""Diagnose NTP/time on all Lumina servers."""
import paramiko

servers = [
    {"name": "ttt1 (DB)",  "ip": "192.168.56.107"},
    {"name": "ttt2 (AP)",  "ip": "192.168.56.106"},
    {"name": "ttt3 (WEB)", "ip": "192.168.56.108"},
]

cmd = (
    "echo '=== DATE ==='; date; "
    "echo '=== TIMEDATECTL ==='; timedatectl 2>/dev/null; "
    "echo '=== CHRONY TRACKING ==='; chronyc tracking 2>/dev/null || echo 'chrony not running'; "
    "echo '=== CHRONY SOURCES ==='; chronyc sources 2>/dev/null || echo 'n/a'; "
    "echo '=== CHRONY CONF ==='; grep -E '^(server|pool) ' /etc/chrony.conf 2>/dev/null || echo 'no chrony.conf'"
)

for s in servers:
    print("=" * 60)
    print(s["name"], s["ip"])
    print("=" * 60)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(s["ip"], username="root", password="123456", timeout=5)
        _, stdout, stderr = ssh.exec_command(cmd, timeout=10)
        print(stdout.read().decode())
        err = stderr.read().decode().strip()
        if err:
            print("STDERR:", err)
    except Exception as e:
        print("ERROR:", e)
    finally:
        ssh.close()
