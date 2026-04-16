import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

PYTHON = '/opt/blossom/web/venv/bin/python3.11'

# First: list all data in all 5 work tables
script = '''
import sqlite3, os, json

base = "/opt/blossom/web/instance"
mapping = {
    "work_category": ("biz_work_category", os.path.join(base, "work_category.db")),
    "work_division": ("biz_work_division", os.path.join(base, "work_division.db")),
    "work_status": ("biz_work_status", os.path.join(base, "work_status.db")),
    "work_operation": ("biz_work_operation", os.path.join(base, "work_operation.db")),
    "work_group": ("biz_work_group", os.path.join(base, "work_group.db")),
}

# Also check blossom.db
for db_name in ["blossom.db", "dev_blossom.db"]:
    db_path = os.path.join(base, db_name)
    if os.path.exists(db_path):
        try:
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'biz_work%'")
            tables = [r[0] for r in cur.fetchall()]
            if tables:
                print(f"=== {db_name}: work tables = {tables} ===")
                for t in tables:
                    cur.execute(f"SELECT COUNT(*) FROM {t}")
                    cnt = cur.fetchone()[0]
                    print(f"  {t}: {cnt} rows")
                    if cnt > 0:
                        cur.execute(f"SELECT * FROM {t} LIMIT 5")
                        cols = [d[0] for d in cur.description]
                        print(f"  columns: {cols}")
                        for row in cur.fetchall():
                            print(f"    {dict(zip(cols, row))}")
            conn.close()
        except Exception as ex:
            print(f"{db_name}: ERROR {ex}")

for name, (table, db_path) in mapping.items():
    if not os.path.exists(db_path):
        print(f"=== {name}: FILE NOT FOUND ===")
        continue
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute(f"SELECT name FROM sqlite_master WHERE type='table'")
        all_tables = [r[0] for r in cur.fetchall()]
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        cnt = cur.fetchone()[0]
        print(f"=== {name} ({db_path}): {cnt} rows, tables={all_tables} ===")
        if cnt > 0:
            cur.execute(f"SELECT * FROM {table}")
            cols = [d[0] for d in cur.description]
            print(f"  columns: {cols}")
            for row in cur.fetchall():
                print(f"    {dict(zip(cols, row))}")
        conn.close()
    except Exception as ex:
        print(f"=== {name}: ERROR {ex} ===")
'''

i, o, e = ssh.exec_command(f"{PYTHON} -c '{script}'")
print(o.read().decode())
err = e.read().decode().strip()
if err:
    print("STDERR:", err)

ssh.close()
