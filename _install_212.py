"""Install lumina-web-2.1.2 RPM on ttt3 and verify."""
import paramiko, time
HOST, USER, PWD = "192.168.56.108", "root", "123456"
RPM_LOCAL = r"c:\Users\ME\Desktop\blossom\deploy\rpm\RPMS\lumina-web-2.1.2-1.noarch.rpm"
RPM_REMOTE = "/tmp/lumina-web-2.1.2-1.noarch.rpm"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=10, allow_agent=False, look_for_keys=False)
sftp = c.open_sftp()

def run(cmd):
    print(f"\n$ {cmd[:240]}")
    _, o, e = c.exec_command(cmd, timeout=180)
    out = o.read().decode("utf-8","replace").rstrip()
    if out: print(out)
    er = e.read().decode("utf-8","replace").rstrip()
    if er: print("STDERR:", er)

print(f"\n[PUT] {RPM_LOCAL} -> {RPM_REMOTE}")
sftp.put(RPM_LOCAL, RPM_REMOTE)
sftp.close()

run("rpm -q lumina-web 2>&1")
run(f"rpm -Uvh --force {RPM_REMOTE} 2>&1")
run("rpm -q lumina-web")
run("rpm -ql lumina-web")
run("head -10 /usr/local/bin/lumina-web-start.sh")

# Restart and verify
run("systemctl daemon-reload && systemctl restart lumina-web nginx")
time.sleep(3)
run("systemctl is-active lumina-web nginx")
run(r"ss -tlnp | grep -E ':(80|443|8000|8001|9601)\b'")
run("ps -eo pid,cmd | grep gunicorn | grep -v grep | head -8")
run("curl -sk -o /dev/null -w 'https://127.0.0.1     -> %{http_code}\\n' https://127.0.0.1/api/auth/session-check")
run("curl -sk -o /dev/null -w 'https://127.0.0.1:9601 -> %{http_code}\\n' https://127.0.0.1:9601/")
run("curl -s -o /dev/null -w 'http://127.0.0.1     -> %{http_code}\\n' --max-time 3 http://127.0.0.1/ 2>&1 || echo CONN_REFUSED_OK")
c.close()
print("\nDONE.")
