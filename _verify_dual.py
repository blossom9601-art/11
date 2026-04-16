#!/usr/bin/env python3
"""Verify dual service deployment on ttt3."""
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.108", username="root", password="123456", timeout=10)

def run(cmd):
    _, o, e = c.exec_command(cmd, timeout=30)
    rc = o.channel.recv_exit_status()
    out = o.read().decode(errors="replace").strip()
    return rc, out

print("=" * 60)
print("  DUAL SERVICE VERIFICATION — ttt3 (192.168.56.108)")
print("=" * 60)

# 1. Service status
print("\n--- Service Status ---")
for svc in ["nginx", "blossom-web", "lumina-web"]:
    rc, status = run(f"systemctl is-active {svc}")
    mark = "OK" if status == "active" else "FAIL"
    print(f"  [{mark}] {svc}: {status}")

# 2. Port bindings
print("\n--- Port Bindings ---")
rc, out = run("ss -tlnp | grep -E ':(443|9601|8000|8001)\\b'")
for line in out.splitlines():
    print(f"  {line.strip()}")

# 3. Python version
print("\n--- Python Version ---")
_, ver = run("/opt/blossom/web/venv/bin/python --version")
print(f"  Blossom venv: {ver}")

# 4. HTTP tests
print("\n--- HTTP Tests ---")

# Blossom 443 - should redirect to login
rc, code = run("curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:443/")
print(f"  Blossom  https://443/ → HTTP {code}")

# Blossom 443 - login page
rc, code = run("curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:443/login")
print(f"  Blossom  https://443/login → HTTP {code}")

# Blossom 443 - dashboard page content check
rc, body = run("curl -sk https://127.0.0.1:443/login 2>/dev/null | head -5")
has_blossom = "blossom" in body.lower() or "login" in body.lower()
print(f"  Blossom  login page content: {'OK' if has_blossom else 'FAIL'}")

# Blossom 443 - static file
rc, code = run("curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:443/static/css/blossom.css 2>/dev/null")
print(f"  Blossom  static/css → HTTP {code}")

# Lumina 9601
rc, code = run("curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:9601/")
print(f"  Lumina   https://9601/ → HTTP {code}")

# Lumina 9601 - login page
rc, code = run("curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:9601/login")
print(f"  Lumina   https://9601/login → HTTP {code}")

# Lumina 9601 - content check
rc, body = run("curl -sk https://127.0.0.1:9601/login 2>/dev/null | head -5")
has_lumina = "lumina" in body.lower() or "sign in" in body.lower()
print(f"  Lumina   login page content: {'OK' if has_lumina else 'FAIL'}")

# Lumina static
rc, code = run("curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:9601/static/image/logo/lumina_black.png 2>/dev/null")
print(f"  Lumina   logo → HTTP {code}")

# 5. External access hints
print("\n--- External Access ---")
print(f"  Blossom: https://192.168.56.108/")
print(f"  Lumina:  https://192.168.56.108:9601/")

# 6. NGINX config check
print("\n--- NGINX Config ---")
rc, out = run("ls -la /etc/nginx/conf.d/*.conf 2>/dev/null")
for line in out.splitlines():
    print(f"  {line.strip()}")

print("\n" + "=" * 60)
print("  VERIFICATION COMPLETE")
print("=" * 60)

c.close()
