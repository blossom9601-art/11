import paramiko, shlex

HOST = '192.168.56.108'; USER = 'root'; PASSWORD = '123456'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=20)

def run(cmd):
    _, out, err = ssh.exec_command(cmd)
    return out.read().decode('utf-8','replace').strip(), err.read().decode('utf-8','replace').strip()

db_candidates = [
    '/opt/blossom/web/instance/blossom.db',
    '/opt/blossom/web/instance/access_control.db',
]
for db in db_candidates:
    o, _ = run(f'test -f {shlex.quote(db)} && echo YES || echo NO')
    print(db, '->', o)

o, e = run('sqlite3 /opt/blossom/web/instance/blossom.db "PRAGMA table_info(web_access_request);"')
print('--- PRAGMA table_info(web_access_request) ---')
print(o or '(empty)')
if e:
    print('ERR:', e)

ssh.close()
