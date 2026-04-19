import sqlite3
conn = sqlite3.connect('instance/hardware_asset.db')
tbls = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print('Tables:', tbls)
bws = [t for t in tbls if 'work_status' in t.lower() or 'biz_work' in t.lower()]
print('biz_work related:', bws)
if 'biz_work_status' in tbls:
    cols = conn.execute("PRAGMA table_info(biz_work_status)").fetchall()
    print('biz_work_status columns:', [c[1] for c in cols])
conn.close()
