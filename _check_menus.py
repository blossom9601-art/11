"""Check what menu names exist and match search terms."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

script = '''
import sqlite3
conn = sqlite3.connect("/opt/blossom/web/instance/dev_blossom.db", timeout=5)
conn.row_factory = sqlite3.Row
rows = conn.execute("SELECT menu_code, menu_name FROM menu ORDER BY menu_code").fetchall()
print("=== ALL MENUS (%d) ===" % len(rows))
for r in rows:
    print("  %s: %s" % (r["menu_code"], r["menu_name"]))
conn.close()
'''

sftp = ssh.open_sftp()
with sftp.file('/opt/blossom/web/_check_menus.py', 'w') as f:
    f.write(script)
sftp.close()

i, o, e = ssh.exec_command('/opt/blossom/web/venv/bin/python /opt/blossom/web/_check_menus.py')
print(o.read().decode())
ssh.close()
