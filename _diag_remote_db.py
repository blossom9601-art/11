import paramiko
ssh=paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108',username='root',password='123456')

# Find DB files
i,o,e=ssh.exec_command('find /opt/blossom/web -name "*.db" -type f 2>/dev/null')
print('DB files:')
print(o.read().decode())

# Check config
i,o,e=ssh.exec_command('grep -i "SQLALCHEMY\|DATABASE" /opt/blossom/web/config.py 2>/dev/null')
print('Config:')
print(o.read().decode())

# Check all work tables
tables = ['biz_work_category','biz_work_division','biz_work_status','biz_work_operation','biz_work_group']
for db in ['/opt/blossom/web/instance/dev_blossom.db', '/opt/blossom/web/instance/blossom.db']:
    i,o,e=ssh.exec_command(f'test -f {db} && echo "EXISTS: {db}" || echo "NOT FOUND: {db}"')
    print(o.read().decode().strip())

# Try to query
for t in tables:
    cmd = f'sqlite3 /opt/blossom/web/instance/dev_blossom.db "SELECT COUNT(*) FROM {t} WHERE is_deleted=0;" 2>/dev/null || echo "TABLE_NOT_FOUND"'
    i,o,e=ssh.exec_command(cmd)
    r = o.read().decode().strip()
    print(f'{t}: {r}')

ssh.close()
