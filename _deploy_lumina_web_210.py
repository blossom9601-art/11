"""Deploy lumina-web 2.1.0 RPM to ttt3 — verify single unit equivalence."""
import paramiko, time, sys, os

HOST = "192.168.56.108"
RPM_LOCAL = r"c:\Users\ME\Desktop\blossom\deploy\rpm\RPMS\lumina-web-2.1.0-1.noarch.rpm"
RPM_REMOTE = "/tmp/lumina-web-2.1.0-1.noarch.rpm"

def ssh():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password="123456", timeout=10, allow_agent=False, look_for_keys=False)
    return c

def run(c, cmd, quiet=False):
    if not quiet: print(f"\n$ {cmd[:200]}")
    _, out, err = c.exec_command(cmd, timeout=120)
    rc = out.channel.recv_exit_status()
    o = out.read().decode("utf-8","replace").rstrip()
    e = err.read().decode("utf-8","replace").rstrip()
    if o and not quiet: print(o)
    if e and not quiet: print("STDERR:", e)
    return rc, o, e

c = ssh()

print(f"====== Upload RPM ({os.path.getsize(RPM_LOCAL)} bytes) ======")
sftp = c.open_sftp()
sftp.put(RPM_LOCAL, RPM_REMOTE)
sftp.close()
run(c, f"ls -lh {RPM_REMOTE}")

print("\n====== Pre-install snapshot ======")
run(c, "rpm -q lumina-web 2>&1; systemctl is-active lumina-web 2>&1")

print("\n====== Install (upgrade) ======")
# Use --force in case version equal/lower; here 2.1.0 > 2.0.0 so upgrade is fine
run(c, f"rpm -Uvh --force {RPM_REMOTE} 2>&1")

print("\n====== Restart + verify ======")
run(c, "systemctl daemon-reload; systemctl restart lumina-web")
time.sleep(5)
run(c, "systemctl is-active lumina-web")
run(c, "systemctl status lumina-web --no-pager -l | head -20")
run(c, "ss -tlnp | grep -E ':(8000|8001)\\b'")
run(c, "rpm -q lumina-web")
run(c, "systemctl list-unit-files | grep -E 'lumina|blossom'")

print("\n====== Smoke test ======")
run(c, "curl -sk -o /dev/null -w '443/api/auth/session-check -> HTTP %{http_code}\\n' https://127.0.0.1/api/auth/session-check")
run(c, "curl -sk -o /dev/null -w '9601/ -> HTTP %{http_code}\\n' https://127.0.0.1:9601/")

c.close()
print("\nDONE.")
