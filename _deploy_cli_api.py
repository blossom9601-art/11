#!/usr/bin/env python3
"""Deploy cli_api.py to ttt3 WEB server and register in app."""
import os
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# 1. Upload cli_api.py
sftp = ssh.open_sftp()
cli_api_path = os.path.join(os.path.dirname(__file__), "agents", "web", "cli_api.py")
sftp.put(cli_api_path, "/opt/blossom/lumina/web/app/cli_api.py")
sftp.close()
print("[ttt3] cli_api.py uploaded")

# 2. Read current __init__.py
_, o, _ = ssh.exec_command("cat /opt/blossom/lumina/web/app/__init__.py")
init_content = o.read().decode()

# 3. Add cli_api blueprint registration if not already present
if "cli_api" not in init_content:
    # Add import and registration before "return app"
    new_content = init_content.replace(
        "    return app",
        "    # CLI 관리 API\n"
        "    from app.cli_api import cli_bp\n"
        "    app.register_blueprint(cli_bp)\n"
        "\n"
        "    return app"
    )
    # Write back
    _, o, e = ssh.exec_command("cat > /opt/blossom/lumina/web/app/__init__.py << 'PYEOF'\n" + new_content + "\nPYEOF")
    o.read()
    err = e.read().decode()
    if err:
        print(f"[ttt3] STDERR: {err}")
    else:
        print("[ttt3] __init__.py updated with cli_bp")
else:
    print("[ttt3] cli_api already registered")

# 4. Restart lumina-web
_, o, e = ssh.exec_command("systemctl restart lumina-web")
o.read()
err = e.read().decode().strip()
if err:
    print(f"[ttt3] restart STDERR: {err}")

import time
time.sleep(3)

# 5. Verify
_, o, _ = ssh.exec_command("systemctl is-active lumina-web")
status = o.read().decode().strip()
print(f"[ttt3] lumina-web: {status}")

_, o, _ = ssh.exec_command("curl -s http://127.0.0.1/health")
print(f"[ttt3] health: {o.read().decode().strip()}")

# 6. Test CLI login
_, o, e = ssh.exec_command(
    'curl -s -X POST -H "Content-Type: application/json" '
    '-d \'{"emp_no":"admin","password":"Lumina_Admin_2026!"}\' '
    'http://127.0.0.1/api/cli/login'
)
print(f"[ttt3] login: {o.read().decode().strip()}")

ssh.close()
