import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("192.168.56.108", username="root", password="123456", timeout=20)

SCRIPT = r'''python3 - <<'PY'
import sqlite3
db = "/opt/blossom/web/instance/dev_blossom.db"
c = sqlite3.connect(db)
c.row_factory = sqlite3.Row

# manufacturers
rows = c.execute("SELECT manufacturer_code, manufacturer_name FROM biz_vendor_manufacturer WHERE is_deleted=0 LIMIT 10").fetchall()
print("=== manufacturers ===")
for r in rows:
    print(f"  {r['manufacturer_code']} -> {r['manufacturer_name']}")

# work_category count
n = c.execute("SELECT COUNT(*) FROM biz_work_category").fetchone()[0]
print(f"\n=== biz_work_category count: {n} ===")
rows2 = c.execute("SELECT id, category_name FROM biz_work_category LIMIT 10").fetchall()
for r in rows2:
    print(f"  id={r['id']} name={r['category_name']}")

c.close()
PY'''

stdin, stdout, stderr = ssh.exec_command(SCRIPT, timeout=30)
print(stdout.read().decode("utf-8", "ignore").strip())
err = stderr.read().decode("utf-8", "ignore").strip()
if err:
    print("ERR:", err)
ssh.close()
