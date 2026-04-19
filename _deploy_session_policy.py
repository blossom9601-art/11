import subprocess, sys, os

base_local = r'c:\Users\ME\Desktop\blossom'
base_remote = 'root@192.168.56.108:/opt/blossom/web'
pw = '123456'

files = [
    (r'app\models.py', 'app/models.py'),
    (r'app\routes\auth.py', 'app/routes/auth.py'),
    (r'app\__init__.py', 'app/__init__.py'),
    (r'app\templates\authentication\11-3.admin\11-3-3.setting\1.setting.html',
     'app/templates/authentication/11-3.admin/11-3-3.setting/1.setting.html'),
    (r'static\js\authentication\11-3.admin\11-3-3.setting\1.setting.js',
     'static/js/authentication/11-3.admin/11-3-3.setting/1.setting.js'),
    (r'static\css\authentication.css', 'static/css/authentication.css'),
]

try:
    import pexpect
    HAS_PEXPECT = True
except ImportError:
    HAS_PEXPECT = False

for local_rel, remote_rel in files:
    local = os.path.join(base_local, local_rel)
    remote = base_remote + '/' + remote_rel
    cmd = ['scp', '-o', 'StrictHostKeyChecking=no', local, remote]
    print(f'SCP: {local_rel} ...', end=' ', flush=True)
    proc = subprocess.run(
        cmd,
        input=pw + '\n',
        capture_output=True, text=True
    )
    if proc.returncode == 0:
        print('OK')
    else:
        print('FAIL', proc.stderr[:200])

# restart service
print('Restarting blossom-web...', end=' ', flush=True)
proc = subprocess.run(
    ['ssh', '-o', 'StrictHostKeyChecking=no', 'root@192.168.56.108',
     'systemctl restart blossom-web && sleep 2 && systemctl is-active blossom-web'],
    input=pw + '\n',
    capture_output=True, text=True, timeout=30
)
print(proc.stdout.strip() or proc.returncode)
