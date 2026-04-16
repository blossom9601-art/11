import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASSWORD = '123456'

FILES = [
    (
        'static/js/common/info-message.js',
        '/opt/blossom/web/static/js/common/info-message.js',
    ),
    (
        'static/js/vendor/lottie.min.js',
        '/opt/blossom/web/static/js/vendor/lottie.min.js',
    ),
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=10)

# Ensure destination directory exists for vendor asset
ssh.exec_command('mkdir -p /opt/blossom/web/static/js/vendor', timeout=10)

sftp = ssh.open_sftp()
for local_path, remote_path in FILES:
    sftp.put(local_path, remote_path)
    print('[UPLOAD] OK', local_path)
sftp.close()

_, so, se = ssh.exec_command('systemctl restart blossom-web; systemctl is-active blossom-web', timeout=20)
print('[RESTART]', so.read().decode('utf-8', 'ignore').strip() or '(none)')
err = se.read().decode('utf-8', 'ignore').strip()
if err:
    print('[RESTART-ERR]', err)

checks = [
    "grep -n \"INFO_LOTTIE_LOCAL\|vendor/lottie.min.js\" /opt/blossom/web/static/js/common/info-message.js",
    "test -f /opt/blossom/web/static/js/vendor/lottie.min.js; echo $?",
]
for cmd in checks:
    _, so, se = ssh.exec_command(cmd, timeout=10)
    out = so.read().decode('utf-8', 'ignore').strip()
    err = se.read().decode('utf-8', 'ignore').strip()
    print('[VERIFY]')
    print(out or err or '(no output)')

ssh.close()
