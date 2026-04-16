import paramiko
ssh=paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108',username='root',password='123456')

mapping = {
    'work_category': ('biz_work_category', '/opt/blossom/web/instance/work_category.db'),
    'work_division': ('biz_work_division', '/opt/blossom/web/instance/work_division.db'),
    'work_status': ('biz_work_status', '/opt/blossom/web/instance/work_status.db'),
    'work_operation': ('biz_work_operation', '/opt/blossom/web/instance/work_operation.db'),
    'work_group': ('biz_work_group', '/opt/blossom/web/instance/work_group.db'),
}

for name, (table, db) in mapping.items():
    cmd = f'sqlite3 {db} "SELECT id, * FROM {table} WHERE is_deleted=0;" 2>/dev/null || echo "ERR"'
    i,o,e = ssh.exec_command(cmd)
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    print(f'=== {name} ({db}) ===')
    if out:
        print(out)
    elif err:
        print('ERROR:', err)
    else:
        print('(empty)')
    print()

ssh.close()
