import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.108", username="root", password="123456", timeout=10, allow_agent=False, look_for_keys=False)
def run(cmd):
    print(f"\n$ {cmd[:240]}")
    _, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8","replace").rstrip())
    er = e.read().decode("utf-8","replace").rstrip()
    if er: print("STDERR:", er)

run("grep -n listen /etc/nginx/conf.d/blossom-lumina.conf")
run("nginx -T 2>/dev/null | grep -nE 'listen' | head -40")
run("ss -tlnp | grep :80")
run("ls /etc/nginx/conf.d/")
run("ls /etc/nginx/sites-enabled/ /etc/nginx/sites-available/ 2>&1")
c.close()
