import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmds = [
    'which ollama 2>/dev/null || echo NOT_FOUND',
    'ollama --version 2>/dev/null || echo NO_VERSION',
    'systemctl is-active ollama 2>/dev/null || echo INACTIVE',
    'ollama list 2>/dev/null || echo NO_MODELS',
    'curl -s http://localhost:11434/api/tags 2>/dev/null | head -c 500 || echo NO_OLLAMA_API',
    'free -h | head -3',
    'cat /proc/cpuinfo | grep "model name" | head -1',
    'lspci | grep -i nvidia 2>/dev/null || echo NO_GPU',
    'cat /etc/os-release | head -3',
]
for cmd in cmds:
    print('>>> ' + cmd)
    _, o, e = ssh.exec_command(cmd)
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    if out:
        print(out)
    if err and 'not found' not in err.lower():
        print('ERR:', err)
    print()
ssh.close()
