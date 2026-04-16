#!/usr/bin/env python3
"""Fix Python 3.10+ syntax for Python 3.9 compatibility on ttt3."""
import paramiko, time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.108", username="root", password="123456", timeout=10)

def run(cmd, timeout=120):
    _, o, e = c.exec_command(cmd, timeout=timeout)
    rc = o.channel.recv_exit_status()
    out = o.read().decode(errors="replace").strip()
    err = e.read().decode(errors="replace").strip()
    mark = "OK" if rc == 0 else "FAIL"
    print(f"[{mark}] {cmd[:80]}")
    if out:
        for line in out.splitlines()[:20]:
            print(f"  {line}")
    if err and rc != 0:
        for line in err.splitlines()[:10]:
            print(f"  [err] {line}")
    return rc, out

# Strategy 1: Try installing Python 3.11 from AppStream
print("=== Attempt: Install Python 3.11 ===")
rc, _ = run("dnf install -y python3.11 2>&1 | tail -10", timeout=180)

if rc == 0:
    rc2, ver = run("python3.11 --version")
    if rc2 == 0 and "3.11" in ver:
        print(f"\nPython 3.11 available! Rebuilding venv...")
        run("rm -rf /opt/blossom/web/venv")
        run("python3.11 -m venv /opt/blossom/web/venv")
        pip = "/opt/blossom/web/venv/bin/pip"
        run(f"{pip} install --upgrade pip setuptools wheel 2>&1 | tail -3")
        deps = ' '.join([
            '"Flask==2.3.3"', '"Werkzeug==2.3.8"', '"Jinja2==3.1.6"',
            '"MarkupSafe==2.1.3"', '"itsdangerous==2.1.2"', '"click==8.1.7"',
            '"blinker==1.6.3"', '"Flask-SQLAlchemy==3.0.5"', '"Flask-Login==0.6.3"',
            '"Flask-Migrate==4.0.5"', '"requests>=2.28,<3"', '"PyMySQL==1.1.1"',
            '"gunicorn==21.2.0"',
        ])
        run(f"{pip} install {deps} 2>&1 | tail -5", timeout=180)
        
        # Update systemd to use new venv path (already correct)
        print("\nRestarting services...")
        run("systemctl daemon-reload")
        run("systemctl restart blossom-web")
        time.sleep(4)
        rc_svc, status = run("systemctl is-active blossom-web")
        if status != "active":
            run("journalctl -u blossom-web --no-pager -n 20")
        
        # Test HTTP
        _, code = run("curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:443/")
        print(f"\nBlossom (443): HTTP {code}")
        c.close()
        exit(0)

# Strategy 2: Add __future__ annotations to files with | syntax
print("\n=== Fallback: Patching source files ===")

# Find files with `|` in type annotations
PATCH_SCRIPT = (
    'import os, re\n'
    'base = "/opt/blossom/web/app"\n'
    'patched = 0\n'
    'for root, dirs, files in os.walk(base):\n'
    '    dirs[:] = [d for d in dirs if d != "__pycache__"]\n'
    '    for f in files:\n'
    '        if not f.endswith(".py"): continue\n'
    '        fpath = os.path.join(root, f)\n'
    '        try:\n'
    '            content = open(fpath, "r", encoding="utf-8").read()\n'
    '        except Exception: continue\n'
    '        if re.search(r"(->|:\\s*)\\s*\\w+\\s*\\|\\s*\\w+", content):\n'
    '            if "from __future__ import annotations" not in content:\n'
    '                lines = content.split("\\n")\n'
    '                idx = 0\n'
    '                if lines and lines[0].startswith("#!"): idx = 1\n'
    '                lines.insert(idx, "from __future__ import annotations")\n'
    '                open(fpath, "w", encoding="utf-8").write("\\n".join(lines))\n'
    '                patched += 1\n'
    '                print(f"  PATCHED: {fpath}")\n'
    'print(f"\\nTotal patched: {patched}")\n'
)

# Upload and run the patch script
sftp = c.open_sftp()
with sftp.file("/tmp/patch_future.py", "w") as f:
    f.write(PATCH_SCRIPT)
sftp.close()

run("/opt/blossom/web/venv/bin/python /tmp/patch_future.py")

# Test import
rc_test, _ = run("/opt/blossom/web/venv/bin/python -c 'from app import create_app; a = create_app(\"development\"); print(\"OK\")' 2>&1", timeout=60)

if rc_test == 0:
    print("\nApp import successful! Restarting service...")
    run("systemctl restart blossom-web")
    time.sleep(4)
    _, status = run("systemctl is-active blossom-web")
    _, code = run("curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:443/")
    print(f"\nblossom-web: {status}")
    print(f"Blossom (443): HTTP {code}")
else:
    print("\nStill failing. Checking error...")
    run("/opt/blossom/web/venv/bin/python -c 'from app import create_app' 2>&1 | tail -10")

c.close()
