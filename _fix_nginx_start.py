#!/usr/bin/env python3
"""Fix NGINX log permissions and start all services."""
import paramiko, time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.108", username="root", password="123456", timeout=10)

def run(cmd):
    _, o, e = c.exec_command(cmd, timeout=60)
    rc = o.channel.recv_exit_status()
    out = o.read().decode(errors="replace").strip()
    err = e.read().decode(errors="replace").strip()
    mark = "OK" if rc == 0 else "FAIL"
    print(f"[{mark}] {cmd}")
    if out:
        for line in out.splitlines()[:15]:
            print(f"  {line}")
    if err and rc != 0:
        for line in err.splitlines()[:5]:
            print(f"  [err] {line}")
    return rc, out

# 1. Fix log dirs -- nginx master runs as root, workers as nginx user
#    Log files are opened by master (root), so just ensure dirs exist
run("mkdir -p /var/log/blossom/web /var/log/blossom/lumina/web")
run("chmod 755 /var/log/blossom /var/log/blossom/web /var/log/blossom/lumina /var/log/blossom/lumina/web")
run("touch /var/log/blossom/web/blossom_access.log /var/log/blossom/web/blossom_error.log")
run("chmod 644 /var/log/blossom/web/blossom_access.log /var/log/blossom/web/blossom_error.log")

# SELinux: allow nginx to write logs
run("chcon -R -t httpd_log_t /var/log/blossom/ 2>/dev/null || true")

# 2. Fix Gunicorn log files for blossom-web (runs as lumina-web)
run("touch /var/log/blossom/web/access.log /var/log/blossom/web/error.log")
run("chown lumina-web:lumina-web /var/log/blossom/web/access.log /var/log/blossom/web/error.log")

# 3. Restart NGINX
run("nginx -t 2>&1")
rc, _ = run("systemctl restart nginx")
if rc != 0:
    run("journalctl -u nginx --no-pager -n 10")

# 4. Start blossom-web
run("systemctl daemon-reload")
run("systemctl restart blossom-web")
time.sleep(3)

# 5. Restart lumina-web
run("systemctl restart lumina-web")
time.sleep(2)

# 6. Check service status
print("\n" + "=" * 50)
print("SERVICE STATUS:")
for svc in ["nginx", "blossom-web", "lumina-web"]:
    rc, out = run(f"systemctl is-active {svc}")
    if rc != 0:
        run(f"journalctl -u {svc} --no-pager -n 15")

# 7. Check ports
print("\nPORT BINDINGS:")
run("ss -tlnp | grep -E ':(443|9601|8000|8001)\\b'")

# 8. HTTP tests
print("\nHTTP TESTS:")
rc443, code443 = run("curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:443/")
rc9601, code9601 = run("curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:9601/")

print(f"\n{'='*50}")
print(f"Blossom (443)  : HTTP {code443}")
print(f"Lumina  (9601) : HTTP {code9601}")
print(f"{'='*50}")

c.close()
