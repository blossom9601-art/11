"""Diagnose production DB via Python (no sqlite3 CLI)."""
import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
REMOTE_BASE = '/opt/blossom/web'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

cmd = f'''cd {REMOTE_BASE} && {REMOTE_BASE}/venv/bin/python -c "
import sqlite3, os

# Check dev_blossom.db
db_path = 'instance/dev_blossom.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    tables = [r[0] for r in conn.execute(\\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\\").fetchall()]
    print('=== dev_blossom.db tables ===')
    for t in tables:
        count = conn.execute(f'SELECT COUNT(*) FROM {{t}}').fetchone()[0]
        if count > 0:
            print(f'  {{t}}: {{count}} rows')
    conn.close()

# Check blossom.db
db_path2 = 'instance/blossom.db'
if os.path.exists(db_path2):
    conn2 = sqlite3.connect(db_path2)
    tables2 = [r[0] for r in conn2.execute(\\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\\").fetchall()]
    print('\\n=== blossom.db tables ===')
    for t in tables2:
        count = conn2.execute(f'SELECT COUNT(*) FROM {{t}}').fetchone()[0]
        if count > 0:
            print(f'  {{t}}: {{count}} rows')
    conn2.close()

# Check insight_item.db
db_path3 = 'instance/insight_item.db'
if os.path.exists(db_path3):
    conn3 = sqlite3.connect(db_path3)
    tables3 = [r[0] for r in conn3.execute(\\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\\").fetchall()]
    print('\\n=== insight_item.db tables ===')
    for t in tables3:
        count = conn3.execute(f'SELECT COUNT(*) FROM {{t}}').fetchone()[0]
        if count > 0:
            print(f'  {{t}}: {{count}} rows')
    conn3.close()

# Check DATABASE_URL env
import os as os2
print('\\n=== DATABASE_URL ===')
print(os2.environ.get('DATABASE_URL', 'NOT SET'))

# Check actual Flask DB URI
import sys
sys.path.insert(0, '.')
os2.environ['FLASK_APP'] = 'run.py'
from config import Config, DevelopmentConfig, ProductionConfig
print(f'\\nConfig.SQLALCHEMY_DATABASE_URI = {{Config.SQLALCHEMY_DATABASE_URI}}')
"
'''

stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())
err = stderr.read().decode()
if err:
    print(f'STDERR: {err[:500]}')

ssh.close()
