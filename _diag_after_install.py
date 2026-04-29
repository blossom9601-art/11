import paramiko, time
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.56.108", username="root", password="123456", timeout=10, allow_agent=False, look_for_keys=False)
def run(cmd):
    print(f"\n$ {cmd[:240]}")
    _, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8","replace").rstrip())
    er = e.read().decode("utf-8","replace").rstrip()
    if er: print("STDERR:", er)

run("ls -l /etc/systemd/system/lumina-web.service /usr/lib/systemd/system/lumina-web.service")
run("systemctl cat lumina-web | head -30")
run("systemctl status nginx --no-pager -l | head -20")
run("systemctl status lumina-web --no-pager -l | tail -40")
run("journalctl -u lumina-web -n 60 --no-pager | tail -50")
run("ls /etc/systemd/system/nginx.service.d/ 2>&1")
run("cat /etc/systemd/system/nginx.service.d/lumina.conf 2>&1; cat /usr/lib/systemd/system/nginx.service.d/lumina.conf 2>&1")
c.close()
