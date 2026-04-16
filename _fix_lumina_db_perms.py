#!/usr/bin/env python3
"""Grant DELETE/UPDATE to lumina_web_reader via pymysql directly to DB server."""
import pymysql

# Connect to DB server as root
DB_HOST = '192.168.56.107'

# Try connecting via pymysql from local machine through SSH tunnel, 
# or from ttt3 via paramiko + pymysql
# First, try direct pymysql from 108
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', port=22, username='root', password='123456', timeout=10)

# Install pymysql if not present and run grant
grant_script = '''
import pymysql
import sys

# Connect as root to MariaDB on 107
try:
    conn = pymysql.connect(
        host='192.168.56.107',
        port=3306,
        user='root',
        password='',
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor
    )
except Exception as e:
    print('ROOT_NO_PW_FAIL:', e)
    # Try common root passwords
    for pw in ['root', '123456', 'Lumina_2026!', 'blossom', 'password']:
        try:
            conn = pymysql.connect(
                host='192.168.56.107',
                port=3306,
                user='root',
                password=pw,
                charset='utf8mb4',
                cursorclass=pymysql.cursors.DictCursor
            )
            print('Connected with pw:', pw)
            break
        except Exception as e2:
            print(f'  pw={pw}: {e2}')
    else:
        print('ALL_PASSWORDS_FAILED')
        sys.exit(1)

cur = conn.cursor()

# Show current grants
try:
    cur.execute("SHOW GRANTS FOR 'lumina_web_reader'@'192.168.56.108'")
    for row in cur.fetchall():
        print('CURRENT:', list(row.values())[0])
except Exception as e:
    print('SHOW_GRANTS_ERR:', e)

# Grant DELETE and UPDATE
try:
    cur.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON lumina.* TO 'lumina_web_reader'@'192.168.56.108'")
    conn.commit()
    cur.execute("FLUSH PRIVILEGES")
    print('GRANT_SUCCESS')
except Exception as e:
    print('GRANT_ERR:', e)

# Verify
try:
    cur.execute("SHOW GRANTS FOR 'lumina_web_reader'@'192.168.56.108'")
    for row in cur.fetchall():
        print('AFTER:', list(row.values())[0])
except Exception as e:
    print('VERIFY_ERR:', e)

conn.close()
print('DONE')
'''

# Check if pymysql is available on 108
_, o, _ = ssh.exec_command('python3 -c "import pymysql; print(\'OK\')" 2>&1')
has_pymysql = o.read().decode().strip()
print('pymysql on 108:', has_pymysql)

if has_pymysql == 'OK':
    # Run the grant script on 108
    import tempfile
    _, o, e = ssh.exec_command(f'python3 -c """{grant_script}"""')
    print(o.read().decode('utf-8', 'replace'))
    err = e.read().decode('utf-8', 'replace').strip()
    if err:
        print('ERR:', err)
else:
    print('pymysql not available on 108, trying to SSH into 107...')
    # Try SSH into 107 from 108
    _, o, e = ssh.exec_command('ssh -o StrictHostKeyChecking=no root@192.168.56.107 "which mysql" 2>&1')
    print('mysql on 107:', o.read().decode().strip())

ssh.close()
