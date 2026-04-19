"""Upload debug script and run on server"""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')
sftp = ssh.open_sftp()
sftp.put('_server_debug_rag.py', '/opt/blossom/web/_debug_rag.py')
sftp.close()
print('Uploaded debug script')

_, o, e = ssh.exec_command(
    'cd /opt/blossom/web && /opt/blossom/web/venv/bin/python _debug_rag.py 2>&1 | grep -v "^\\[" | head -40',
    timeout=30
)
print(o.read().decode().strip())
err = e.read().decode().strip()
if err:
    print('ERR:', err[:300])

ssh.close()
print('\n[DONE]')
