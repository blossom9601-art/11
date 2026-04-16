#!/usr/bin/env python3
"""Unify NTP + Timezone on all Lumina servers: Asia/Seoul + 2.rocky.pool.ntp.org"""
import paramiko

SERVERS = [
    {"name": "ttt1 (DB)",  "ip": "192.168.56.107"},
    {"name": "ttt2 (AP)",  "ip": "192.168.56.106"},
    {"name": "ttt3 (WEB)", "ip": "192.168.56.108"},
]

TIMEZONE = "Asia/Seoul"
NTP_POOL = "2.rocky.pool.ntp.org"

CMD = (
    # 1) Set timezone
    "timedatectl set-timezone {tz}; "
    # 2) Replace chrony.conf server/pool lines
    "sed -i '/^server /d;/^pool /d' /etc/chrony.conf; "
    "sed -i '1i\\pool {pool} iburst' /etc/chrony.conf; "
    # 3) Enable NTP + restart chronyd
    "timedatectl set-ntp true; "
    "systemctl restart chronyd; "
    # 4) Force sync
    "chronyc makestep; "
    # 5) Verify
    "echo '=== RESULT ==='; "
    "timedatectl; "
    "echo '---'; "
    "chronyc tracking; "
    "echo '---'; "
    "grep -E '^(server|pool) ' /etc/chrony.conf"
).format(tz=TIMEZONE, pool=NTP_POOL)

for s in SERVERS:
    print("=" * 60)
    print(s["name"], s["ip"])
    print("=" * 60)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(s["ip"], username="root", password="123456", timeout=5)
        _, stdout, stderr = ssh.exec_command(CMD, timeout=15)
        print(stdout.read().decode())
        err = stderr.read().decode().strip()
        if err:
            print("STDERR:", err)
    except Exception as e:
        print("ERROR:", e)
    finally:
        ssh.close()

print("\nDONE")
