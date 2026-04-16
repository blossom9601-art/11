"""Lumina 9601 포트 접속 진단"""
import paramiko

HOST = "192.168.56.108"
USER = "root"
PASS = "123456"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

cmds = [
    "systemctl is-active nginx lumina-web blossom-web",
    "ss -tlnp | grep -E '8000|8001|443|9601'",
    "firewall-cmd --list-ports 2>/dev/null; firewall-cmd --list-services 2>/dev/null",
    "nginx -t 2>&1",
    "journalctl -u lumina-web --no-pager -n 15",
    "journalctl -u nginx --no-pager -n 10",
    "curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:9601/login",
    "cat /etc/nginx/conf.d/blossom-lumina.conf | head -80",
]

for cmd in cmds:
    print(f"\n=== {cmd} ===")
    _, o, e = ssh.exec_command(cmd, timeout=10)
    out = o.read().decode()
    err = e.read().decode()
    if out.strip(): print(out.strip())
    if err.strip(): print(err.strip())

ssh.close()
