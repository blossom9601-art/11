"""Diagnose ttt3 services - non-interactive SSH via paramiko."""
import paramiko, sys

def run(cmd, host="192.168.56.108"):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(host, username="root", password="123456", timeout=10, allow_agent=False, look_for_keys=False)
    stdin, stdout, stderr = c.exec_command(cmd, timeout=30)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    rc = stdout.channel.recv_exit_status()
    c.close()
    return rc, out, err

cmds = [
    "echo '== systemd units =='; systemctl list-unit-files | grep -E 'lumina|blossom' | head -30",
    "echo '== active state =='; systemctl is-active lumina-web blossom-web nginx 2>&1",
    "echo '== listening ports =='; ss -tlnp | grep -E ':(80|443|8000|8001|9601)\\b'",
    "echo '== nginx 443 server (proxy targets) =='; awk '/listen 443/,/^}/' /etc/nginx/conf.d/*.conf 2>/dev/null | grep -E 'proxy_pass|server_name|listen' | head -40",
    "echo '== blossom-web unit =='; systemctl cat blossom-web 2>&1 | head -25",
    "echo '== lumina-web unit =='; systemctl cat lumina-web 2>&1 | head -25",
    "echo '== /opt dirs =='; ls -la /opt/blossom/ 2>&1; echo; ls /opt/blossom/web 2>&1 | head -10; echo; ls /opt/blossom/lumina/web 2>&1 | head -10",
    "echo '== app identity (compare wsgi) =='; head -5 /opt/blossom/web/wsgi.py 2>&1; echo ---; head -5 /opt/blossom/lumina/web/wsgi.py 2>&1",
]
for c in cmds:
    print("\n$", c.split(';')[0].strip())
    rc, o, e = run(c)
    print(o.rstrip())
    if e.strip():
        print("STDERR:", e.rstrip())
