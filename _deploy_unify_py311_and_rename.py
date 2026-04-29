"""Deploy: 1) rename nginx conf to lumina-web.conf, 2) wrapper -> py3.11 venv only."""
import paramiko, time
HOST, USER, PWD = "192.168.56.108", "root", "123456"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=10, allow_agent=False, look_for_keys=False)
sftp = c.open_sftp()

def run(cmd):
    print(f"\n$ {cmd[:240]}")
    _, o, e = c.exec_command(cmd, timeout=120)
    out = o.read().decode("utf-8","replace").rstrip()
    if out: print(out)
    er = e.read().decode("utf-8","replace").rstrip()
    if er: print("STDERR:", er)

def put(local, remote):
    print(f"\n[PUT] {local} -> {remote}")
    sftp.put(local, remote)

# ── 1. Rename nginx conf ───────────────────────────────────
run("ls /etc/nginx/conf.d/")
run(r"""
TS=$(date +%Y%m%d_%H%M%S)
mkdir -p /root/_nginx_rename_$TS
cp /etc/nginx/conf.d/*.conf* /root/_nginx_rename_$TS/ 2>/dev/null
# Move main file
if [ -f /etc/nginx/conf.d/blossom-lumina.conf ]; then
  mv /etc/nginx/conf.d/blossom-lumina.conf /etc/nginx/conf.d/lumina-web.conf
fi
# Remove old .bak* clutter
rm -f /etc/nginx/conf.d/blossom-lumina.conf.bak* /etc/nginx/conf.d/lumina.conf.bak /etc/nginx/conf.d/lumina.conf.disabled
echo BACKUP_DIR=/root/_nginx_rename_$TS
""")
run("ls /etc/nginx/conf.d/")
run("nginx -t 2>&1")

# ── 2. Update wrapper to use py3.11 venv only ──────────────
put(r"c:\Users\ME\Desktop\blossom\deploy\bin\lumina-web-start.sh", "/usr/local/bin/lumina-web-start.sh")
run("chmod 755 /usr/local/bin/lumina-web-start.sh")
run("head -25 /usr/local/bin/lumina-web-start.sh")

# ── 3. Restart services ────────────────────────────────────
run("systemctl restart lumina-web.service")
time.sleep(3)
run("systemctl restart nginx")
time.sleep(2)

# ── 4. Verify ──────────────────────────────────────────────
run("systemctl is-active lumina-web nginx")
run(r"ss -tlnp | grep -E ':(80|443|8000|8001|9601)\b'")
# All gunicorn workers should be python3.11 now (no python3.6)
run("ps -eo pid,cmd | grep -E 'gunicorn' | grep -v grep")
run("ls -l /proc/$(pgrep -of gunicorn)/exe 2>&1")
run("curl -sk -o /dev/null -w 'https://127.0.0.1     -> %{http_code}\\n' --max-time 5 https://127.0.0.1/api/auth/session-check")
run("curl -sk -o /dev/null -w 'https://127.0.0.1:9601 -> %{http_code}\\n' --max-time 5 https://127.0.0.1:9601/")
run("curl -s  -o /dev/null -w 'http://127.0.0.1     -> %{http_code}\\n' --max-time 3 http://127.0.0.1/ 2>&1 || echo 'CONN_REFUSED (good)'")

# Verify dashboard runs on python3.11 (not 3.6)
run(r"""for pid in $(pgrep -f 'gunicorn'); do
  exe=$(readlink /proc/$pid/exe 2>/dev/null);
  port=$(ss -tlnp 2>/dev/null | grep "pid=$pid," | awk '{print $4}' | head -1);
  [ -n "$exe" ] && echo "pid=$pid port=$port exe=$exe";
done | sort -u""")

sftp.close(); c.close()
print("\nDONE.")
