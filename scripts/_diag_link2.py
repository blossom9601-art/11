"""Check DB path mismatch"""
import os, sqlite3

root = os.getcwd()
path_root = os.path.join(root, 'dev_blossom.db')
path_inst = os.path.join(root, 'instance', 'dev_blossom.db')

print(f"Root DB: {path_root}")
print(f"  exists: {os.path.exists(path_root)}")
print(f"Instance DB: {path_inst}")
print(f"  exists: {os.path.exists(path_inst)}")

for label, p in [("ROOT", path_root), ("INSTANCE", path_inst)]:
    if not os.path.exists(p):
        continue
    conn = sqlite3.connect(p)
    conn.row_factory = sqlite3.Row
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    agent_tables = [t for t in tables if 'agent' in t or 'pending' in t]
    hw_tables = [t for t in tables if 'hardware' in t]
    print(f"\n--- {label} ({p}) ---")
    print(f"  agent tables: {agent_tables}")
    print(f"  hardware tables: {hw_tables}")
    if 'agent_pending' in tables:
        for r in conn.execute('SELECT id, hostname, is_linked FROM agent_pending').fetchall():
            print(f"  pending: {dict(r)}")
    if 'hardware' in tables:
        cnt = conn.execute('SELECT count(*) FROM hardware WHERE is_deleted=0').fetchone()[0]
        print(f"  hardware count (active): {cnt}")
        for r in conn.execute('SELECT id, system_name FROM hardware WHERE is_deleted=0 LIMIT 3').fetchall():
            print(f"  hardware: {dict(r)}")
    conn.close()
