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

run("ls /root/_unit_backup_20260426_104548/")
run("cat /root/_unit_backup_20260426_104548/lumina-web.service 2>/dev/null")
run("ls -la /root/_unit_backup_20260426_104548/")
# Maybe lumina-dashboard.service backup contained the WORKING ExecStart
run("find /root /etc -name 'lumina-dashboard*' 2>/dev/null")
run("find / -name '*.pyc' -path '*lumina/web/app*' 2>/dev/null | head -10")
# Check if test stdin works
run("/usr/local/bin/gunicorn --config /opt/blossom/lumina/web/gunicorn.conf.py --chdir /opt/blossom/lumina/web wsgi:application --check-config 2>&1 | head -30")
c.close()
