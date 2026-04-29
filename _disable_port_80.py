"""Disable nginx port 80 — keep 443/9601 only."""
import paramiko, time, re, base64
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.108", username="root", password="123456", timeout=10, allow_agent=False, look_for_keys=False)

def run(cmd, quiet=False):
    if not quiet: print(f"\n$ {cmd[:240]}")
    _, o, e = c.exec_command(cmd, timeout=60)
    rc = o.channel.recv_exit_status()
    out = o.read().decode("utf-8","replace").rstrip()
    err = e.read().decode("utf-8","replace").rstrip()
    if out and not quiet: print(out)
    if err and not quiet: print("STDERR:", err)
    return rc, out, err

print("====== STEP 1: locate every listen 80 directive ======")
run("grep -rEn 'listen[[:space:]]+(\\[::\\]:)?80([[:space:]]|;)' /etc/nginx/ 2>&1")

print("\n====== STEP 2: backup all conf files containing port 80 ======")
ts = time.strftime("%Y%m%d_%H%M%S")
run(f"mkdir -p /root/_nginx_backup_{ts}")
run(f"grep -rlEn 'listen[[:space:]]+(\\[::\\]:)?80([[:space:]]|;)' /etc/nginx/ 2>/dev/null | xargs -I{{}} cp -v {{}} /root/_nginx_backup_{ts}/")

print("\n====== STEP 3: comment out every 'listen 80' / 'listen [::]:80' line ======")
# Use sed in-place; only matches lines containing literal port 80 (not 8080/443/etc).
SED = r"""sed -ri 's@^([[:space:]]*)(listen[[:space:]]+(\[::\]:)?80[[:space:]]*(default_server[[:space:]]*)?(http2[[:space:]]*)?;)@\1# DISABLED-by-policy \2@' """
files_rc, files, _ = run(r"grep -rlE 'listen[[:space:]]+(\[::\]:)?80([[:space:]]|;)' /etc/nginx/ 2>/dev/null", quiet=True)
print(files)
for f in files.splitlines():
    f = f.strip()
    if not f: continue
    run(SED + f)

print("\n====== STEP 4: nginx config test ======")
run("grep -rEn 'listen[[:space:]]+(\\[::\\]:)?80([[:space:]]|;)' /etc/nginx/ 2>&1 | head -20")
rc, _, _ = run("nginx -t 2>&1")

print("\n====== STEP 5: restart nginx ======")
run("systemctl restart nginx; systemctl is-active nginx")
time.sleep(2)

print("\n====== STEP 6: verify port 80 not listening ======")
run(r"ss -tlnp | grep -E ':(80|443|9601)\b'")
run("curl -s -o /dev/null -w 'http://127.0.0.1:80 -> %{http_code}\\n' --max-time 3 http://127.0.0.1/ || echo 'connection refused (expected)'")

print("\n====== STEP 7: firewall — close 80 if it's open ======")
run("firewall-cmd --list-services 2>&1; firewall-cmd --list-ports 2>&1")
run("firewall-cmd --permanent --remove-service=http 2>&1; firewall-cmd --permanent --remove-port=80/tcp 2>&1; firewall-cmd --reload 2>&1")
run("firewall-cmd --list-services 2>&1; firewall-cmd --list-ports 2>&1")

c.close()
print("\nDONE.")
