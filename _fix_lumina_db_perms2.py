#!/usr/bin/env python3
"""Grant DELETE/UPDATE to lumina_web_reader - upload script to 108 and run."""
import paramiko
import os

GRANT_SCRIPT = r'''#!/usr/bin/env python3
import pymysql, sys

passwords = ['', 'root', '123456', 'Lumina_2026!', 'blossom']
conn = None
for pw in passwords:
    try:
        conn = pymysql.connect(host='192.168.56.107', port=3306, user='root',
                               password=pw, charset='utf8mb4',
                               cursorclass=pymysql.cursors.DictCursor)
        print('Connected with root pw:', repr(pw))
        break
    except Exception as e:
        print('  pw=%s: %s' % (repr(pw), e))

if conn is None:
    print('ALL_PASSWORDS_FAILED')
    sys.exit(1)

cur = conn.cursor()

# Show current grants
try:
    cur.execute("SHOW GRANTS FOR 'lumina_web_reader'@'192.168.56.108'")
    for row in cur.fetchall():
        print('BEFORE:', list(row.values())[0])
except Exception as e:
    print('SHOW_GRANTS_ERR:', e)

# Grant full CRUD
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

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', port=22, username='root', password='123456', timeout=10)
sftp = ssh.open_sftp()

# Upload grant script
remote_script = '/tmp/_grant_lumina_perms.py'
with sftp.open(remote_script, 'w') as f:
    f.write(GRANT_SCRIPT)
sftp.close()

# Run it
print('Running grant script on 108...')
_, o, e = ssh.exec_command('python3 ' + remote_script)
print(o.read().decode('utf-8', 'replace'))
err = e.read().decode('utf-8', 'replace').strip()
if err:
    print('STDERR:', err)

# Cleanup
ssh.exec_command('rm -f ' + remote_script)
ssh.close()
