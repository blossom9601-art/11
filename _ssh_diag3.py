"""Check if 8000 (current lumina-web Dashboard) is referenced anywhere external."""
import paramiko
def run(cmd, host="192.168.56.108"):
    c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(host, username="root", password="123456", timeout=10, allow_agent=False, look_for_keys=False)
    _,o,e = c.exec_command(cmd, timeout=30)
    return o.read().decode("utf-8","replace"), e.read().decode("utf-8","replace")

cmds = [
    "echo == nginx files referencing 8000 ==; grep -rn '127.0.0.1:8000' /etc/nginx/ 2>/dev/null",
    "echo == 80 access log last 30 ==; tail -n 30 /var/log/nginx/access.log 2>/dev/null | head -30",
    "echo == lumina-web app entry ==; ls /opt/blossom/lumina/web/",
    "echo == blossom-web drop-in ==; cat /etc/systemd/system/blossom-web.service.d/secret.conf 2>/dev/null || echo 'no drop-in'",
    "echo == lumina-web env file ==; cat /etc/blossom/lumina/secure.env 2>/dev/null | head -20 || echo 'no env'",
    "echo == blossom-web full unit ==; cat /usr/lib/systemd/system/blossom-web.service",
]
for c in cmds:
    o,e = run(c)
    print(o.rstrip())
    if e.strip(): print("ERR:", e.rstrip())
