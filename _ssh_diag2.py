"""More diagnosis."""
import paramiko

def run(cmd, host="192.168.56.108"):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(host, username="root", password="123456", timeout=10, allow_agent=False, look_for_keys=False)
    _, o, e = c.exec_command(cmd, timeout=30)
    out = o.read().decode("utf-8","replace"); err = e.read().decode("utf-8","replace")
    c.close()
    return out, err

cmds = [
    "cat /etc/nginx/conf.d/blossom-lumina.conf | wc -l",
    "grep -n 'listen\\|server_name\\|proxy_pass' /etc/nginx/conf.d/blossom-lumina.conf",
    "echo ---443 server---; sed -n '160,260p' /etc/nginx/conf.d/blossom-lumina.conf",
    "echo ---9601 served by what?---; curl -sk -o /dev/null -w 'https://127.0.0.1:9601 -> HTTP %{http_code}\\n' https://127.0.0.1:9601/",
    "echo ---test 8000 root---; curl -s -o /dev/null -w 'http://127.0.0.1:8000/ -> HTTP %{http_code}\\n' http://127.0.0.1:8000/",
    "echo ---test 443 (no upstream)---; curl -sk -o /dev/null -w 'https://127.0.0.1/ -> HTTP %{http_code}\\n' https://127.0.0.1/",
]
for c in cmds:
    o,e = run(c)
    print(o.rstrip())
    if e.strip(): print("ERR:", e.rstrip())
