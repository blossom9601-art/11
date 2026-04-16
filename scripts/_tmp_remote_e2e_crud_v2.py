"""원격 E2E CRUD 검증 v2 — manufacturer_name=Microsoft 사용"""
import paramiko

HOST = "192.168.56.108"
USER = "root"
PASSWORD = "123456"

REMOTE_SCRIPT = r'''python3 - <<'PYEOF'
import urllib.request, json, ssl, sqlite3

ctx = ssl._create_unverified_context()
BASE = "https://127.0.0.1"
DB = "/opt/blossom/web/instance/dev_blossom.db"

def api(method, path, body=None):
    url = BASE + path
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method,
                                headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode(), "status": e.code}
    except Exception as e:
        return {"error": str(e)}

def dashboard_total():
    d = api("GET", "/api/category/hw-dashboard")
    return d.get("summary", {}).get("total", -1)

def db_count(table):
    c = sqlite3.connect(DB)
    try:
        n = c.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    except:
        n = -1
    c.close()
    return n

def cleanup_hw():
    c = sqlite3.connect(DB)
    for t in ["hw_server_type","hw_storage_type","hw_san_type","hw_network_type","hw_security_type"]:
        try: c.execute(f"DELETE FROM {t}")
        except: pass
    c.commit(); c.close()

results = []
MFR = "Microsoft"

# ====== HW SERVER ======
print("--- hw_server_type ---")
cleanup_hw()
before = dashboard_total()
r = api("POST", "/api/hw-server-types", {
    "model_name": "REMOTE-E2E-SERVER", "manufacturer_name": MFR, "form_factor": "서버"
})
item = r.get("item") or {}
sid = item.get("id")
after_create = dashboard_total()
if sid:
    r2 = api("POST", "/api/hw-server-types/bulk-delete", {"ids": [sid]})
    after_del = dashboard_total()
    db_n = db_count("hw_server_type")
    ok = after_create == before + 1 and after_del == before and db_n == 0
    print(f"  create id={sid}, dash {before}->{after_create}->{after_del}, db={db_n}, {'PASS' if ok else 'FAIL'}")
    results.append(("hw_server", ok))
else:
    print(f"  create FAILED: {r}")
    results.append(("hw_server", False))

# ====== HW SECURITY ======
print("--- hw_security_type ---")
cleanup_hw()
before = dashboard_total()
r = api("POST", "/api/hw-security-types", {
    "model_name": "REMOTE-E2E-FW", "manufacturer_name": MFR, "security_type": "FW"
})
item = r.get("item") or {}
sid = item.get("id")
after_create = dashboard_total()
if sid:
    r2 = api("POST", "/api/hw-security-types/bulk-delete", {"ids": [sid]})
    after_del = dashboard_total()
    db_sec = db_count("hw_security_type")
    ok = after_create > before and after_del == before and db_sec == 0
    print(f"  create id={sid}, dash {before}->{after_create}->{after_del}, db_sec={db_sec}, {'PASS' if ok else 'FAIL'}")
    results.append(("hw_security", ok))
else:
    print(f"  create FAILED: {r}")
    results.append(("hw_security", False))

# ====== HW SAN ======
print("--- hw_san_type ---")
cleanup_hw()
before = dashboard_total()
r = api("POST", "/api/hw-san-types", {
    "model_name": "REMOTE-E2E-SAN", "manufacturer_name": MFR, "san_type": "SAN 스위치"
})
item = r.get("item") or {}
sid = item.get("id")
after_create = dashboard_total()
if sid:
    r2 = api("POST", "/api/hw-san-types/bulk-delete", {"ids": [sid]})
    after_del = dashboard_total()
    db_n = db_count("hw_san_type")
    ok = after_create > before and after_del == before and db_n == 0
    print(f"  create id={sid}, dash {before}->{after_create}->{after_del}, db={db_n}, {'PASS' if ok else 'FAIL'}")
    results.append(("hw_san", ok))
else:
    print(f"  create FAILED: {r}")
    results.append(("hw_san", False))

# ====== HW NETWORK ======
print("--- hw_network_type ---")
cleanup_hw()
before = dashboard_total()
r = api("POST", "/api/hw-network-types", {
    "model_name": "REMOTE-E2E-NET", "manufacturer_name": MFR, "network_type": "L2"
})
item = r.get("item") or {}
sid = item.get("id")
after_create = dashboard_total()
if sid:
    r2 = api("POST", "/api/hw-network-types/bulk-delete", {"ids": [sid]})
    after_del = dashboard_total()
    db_n = db_count("hw_network_type")
    ok = after_create > before and after_del == before and db_n == 0
    print(f"  create id={sid}, dash {before}->{after_create}->{after_del}, db={db_n}, {'PASS' if ok else 'FAIL'}")
    results.append(("hw_network", ok))
else:
    print(f"  create FAILED: {r}")
    results.append(("hw_network", False))

# ====== HW STORAGE ======
print("--- hw_storage_type ---")
cleanup_hw()
before = dashboard_total()
r = api("POST", "/api/hw-storage-types", {
    "model_name": "REMOTE-E2E-STOR", "manufacturer_name": MFR, "storage_type": "스토리지"
})
item = r.get("item") or {}
sid = item.get("id")
after_create = dashboard_total()
if sid:
    r2 = api("POST", "/api/hw-storage-types/bulk-delete", {"ids": [sid]})
    after_del = dashboard_total()
    db_n = db_count("hw_storage_type")
    ok = after_create > before and after_del == before and db_n == 0
    print(f"  create id={sid}, dash {before}->{after_create}->{after_del}, db={db_n}, {'PASS' if ok else 'FAIL'}")
    results.append(("hw_storage", ok))
else:
    print(f"  create FAILED: {r}")
    results.append(("hw_storage", False))

# ====== WORK CATEGORY ======
print("--- work_category ---")
before_n = db_count("biz_work_category")
r = api("POST", "/api/work-categories", {"category_name": "REMOTE-E2E-CAT"})
item = r.get("item") or {}
sid = item.get("id")
if sid:
    r2 = api("POST", "/api/work-categories/bulk-delete", {"ids": [sid]})
    after_n = db_count("biz_work_category")
    ok = r2.get("success", False) and after_n == before_n
    print(f"  create id={sid}, delete ok={r2.get('success')}, db {before_n}->{after_n}, {'PASS' if ok else 'FAIL'}")
    results.append(("work_category", ok))
else:
    print(f"  create FAILED: {r}")
    results.append(("work_category", False))

# ====== FINAL CLEANUP ======
cleanup_hw()

# ====== SUMMARY ======
print("\n====== RESULTS ======")
passed = sum(1 for _, ok in results if ok)
for name, ok in results:
    print(f"  {'PASS' if ok else 'FAIL'}: {name}")
print(f"\n{passed}/{len(results)} PASSED")
PYEOF'''

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD, timeout=20)

stdin, stdout, stderr = ssh.exec_command(REMOTE_SCRIPT, timeout=180)
out = stdout.read().decode("utf-8", "ignore").strip()
err = stderr.read().decode("utf-8", "ignore").strip()

print(out)
if err:
    print("\n[STDERR]")
    print(err)

ssh.close()
