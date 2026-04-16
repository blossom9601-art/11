import paramiko
ssh=paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108',username='root',password='123456')

mapping = {
    'work_category': '/opt/blossom/web/instance/work_category.db',
    'work_division': '/opt/blossom/web/instance/work_division.db',
    'work_status': '/opt/blossom/web/instance/work_status.db',
    'work_operation': '/opt/blossom/web/instance/work_operation.db',
    'work_group': '/opt/blossom/web/instance/work_group.db',
}

for name, db in mapping.items():
    # List tables first
    cmd = f"sqlite3 {db} \".tables\" 2>&1"
    i,o,e = ssh.exec_command(cmd)
    tables = o.read().decode().strip()
    print(f'=== {name} ===')
    print(f'tables: {tables}')
    
    # Try to get data from first table found
    if tables and 'Error' not in tables:
        for t in tables.split():
            cmd2 = f"sqlite3 {db} \"SELECT * FROM {t};\" 2>&1"
            i2,o2,e2 = ssh.exec_command(cmd2)
            data = o2.read().decode().strip()
            print(f'  {t}: {len(data.splitlines())} rows')
            if data:
                for line in data.splitlines()[:5]:
                    print(f'    {line[:200]}')
    print()

ssh.close()
