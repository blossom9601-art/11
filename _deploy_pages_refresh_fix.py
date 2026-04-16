import paramiko

HOST = "192.168.56.108"
USER = "root"
PASSWORD = "123456"

LOCAL = r"app/routes/pages.py"
REMOTE = "/opt/blossom/web/app/routes/pages.py"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=10)

sftp = ssh.open_sftp()
sftp.put(LOCAL, REMOTE)
sftp.close()

ssh.exec_command("systemctl restart blossom-web")
_, stdout, _ = ssh.exec_command("sleep 2; systemctl is-active blossom-web")
status = stdout.read().decode().strip()
print("SERVICE_STATUS=", status)

# Verify remote file contains force-full-render key logic
cmd = "grep -n \"_force_full_render_keys\|cat_business_dashboard\" /opt/blossom/web/app/routes/pages.py"
_, stdout, _ = ssh.exec_command(cmd)
print("REMOTE_MARKERS_START")
print(stdout.read().decode())
print("REMOTE_MARKERS_END")

ssh.close()
print("DEPLOY_DONE")
