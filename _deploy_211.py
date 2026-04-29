"""Deploy slim 2.1.1 + restore nginx + verify."""
import paramiko, time, os
HOST = "192.168.56.108"
RPM = r"c:\Users\ME\Desktop\blossom\deploy\rpm\RPMS\lumina-web-2.1.1-1.noarch.rpm"
RPM_REMOTE = "/tmp/lumina-web-2.1.1-1.noarch.rpm"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password="123456", timeout=10, allow_agent=False, look_for_keys=False)

def run(cmd):
    print(f"\n$ {cmd[:240]}")
    _, o, e = c.exec_command(cmd, timeout=120)
    print(o.read().decode("utf-8","replace").rstrip())
    er = e.read().decode("utf-8","replace").rstrip()
    if er: print("STDERR:", er)

print("====== STEP 1: Restore nginx (remove RPM-installed lumina.conf) ======")
run("rm -f /etc/nginx/conf.d/lumina.conf /etc/nginx/conf.d/lumina.conf.rpmnew")
run("nginx -t 2>&1 | tail -5")
run("systemctl restart nginx; systemctl is-active nginx")

print("\n====== STEP 2: Upload + upgrade to slim 2.1.1 ======")
sftp = c.open_sftp(); sftp.put(RPM, RPM_REMOTE); sftp.close()
run(f"rpm -Uvh --force {RPM_REMOTE} 2>&1")
run("rpm -q lumina-web")
run("rpm -ql lumina-web")

print("\n====== STEP 3: Daemon reload + restart ======")
run("systemctl daemon-reload && systemctl restart lumina-web")
time.sleep(6)

print("\n====== STEP 4: Verify ======")
run("systemctl is-active lumina-web nginx")
run("systemctl status lumina-web --no-pager -l | head -25")
run(r"ss -tlnp | grep -E ':(80|443|8000|8001|9601)\b'")
run("pgrep -af gunicorn")

print("\n====== STEP 5: Dashboard launch diag (if 8000 missing) ======")
run("journalctl -u lumina-web --since '1 min ago' --no-pager | grep -iE 'python3.6|dashboard|gunicorn|error|traceback' | head -30")

print("\n====== STEP 6: Smoke ======")
run("curl -sk -o /dev/null -w '443/api/auth/session-check -> HTTP %{http_code}\\n' https://127.0.0.1/api/auth/session-check")
run("curl -sk -o /dev/null -w '9601/ -> HTTP %{http_code}\\n' https://127.0.0.1:9601/")
c.close()
print("\nDONE.")
