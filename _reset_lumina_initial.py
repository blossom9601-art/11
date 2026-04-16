#!/usr/bin/env python3
"""Reset Lumina to RPM first-boot state: clean DB + fix chrony on all servers."""
import paramiko

def ssh_run(ip, cmd):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(ip, username="root", password="123456", timeout=5)
    _, stdout, stderr = ssh.exec_command(cmd, timeout=15)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    ssh.close()
    return out, err

# ── 1. Clean all agent data from DB (ttt1) ──
print("=" * 60)
print("1. Cleaning agent data from DB (ttt1)")
print("=" * 60)
clean_sql = """
DELETE FROM collected_packages;
DELETE FROM collected_accounts;
DELETE FROM collected_interfaces;
DELETE FROM collection_log;
DELETE FROM collected_hosts;
SELECT 'CLEANED' AS status, 
       (SELECT COUNT(*) FROM collected_hosts) AS hosts_remaining;
"""
out, err = ssh_run("192.168.56.107",
    "mysql -u root lumina -e \"%s\"" % clean_sql.replace('"', '\\"'))
print(out)
if err:
    print("STDERR:", err)

# ── 2. Fix chrony.conf on ttt3 (WEB) ──
print("\n" + "=" * 60)
print("2. Fixing chrony.conf on ttt3 (WEB)")
print("=" * 60)
# ttt3 chrony.conf had no pool/server lines — check and fix
fix_cmd = (
    "test -f /etc/chrony.conf || echo 'pool 2.rocky.pool.ntp.org iburst' > /etc/chrony.conf; "
    "grep -q '^pool\\|^server' /etc/chrony.conf || "
    "sed -i '1i\\pool 2.rocky.pool.ntp.org iburst' /etc/chrony.conf; "
    "systemctl restart chronyd 2>/dev/null || true; "
    "echo '--- chrony.conf ---'; "
    "grep -E '^(server|pool) ' /etc/chrony.conf; "
    "echo '--- timedatectl ---'; "
    "timedatectl | head -4"
)
out, err = ssh_run("192.168.56.108", fix_cmd)
print(out)

# ── 3. Verify all 3 servers have correct NTP and timezone ──
print("\n" + "=" * 60)
print("3. Verifying all servers")
print("=" * 60)
for name, ip in [("ttt1 (DB)", "192.168.56.107"), ("ttt2 (AP)", "192.168.56.106"), ("ttt3 (WEB)", "192.168.56.108")]:
    verify = (
        "echo 'Timezone:'; timedatectl show 2>/dev/null | grep Timezone=; "
        "echo 'NTP Sync:'; timedatectl show 2>/dev/null | grep NTPSynchronized=; "
        "echo 'Chrony pool:'; grep -E '^(server|pool) ' /etc/chrony.conf 2>/dev/null || echo 'NONE'; "
        "echo 'Time:'; date '+%Y-%m-%d %H:%M:%S %Z'"
    )
    out, _ = ssh_run(ip, verify)
    print("--- %s (%s) ---" % (name, ip))
    print(out)
    print()

# ── 4. Verify WEB dashboard accessible ──
print("=" * 60)
print("4. Verify WEB shows empty agents")
print("=" * 60)
out, _ = ssh_run("192.168.56.108",
    "curl -sk https://localhost:9601/api/dashboard/summary 2>/dev/null || echo 'WEB not accessible'")
print("Dashboard API:", out)

print("\nDONE — Lumina is now in RPM first-boot state")
