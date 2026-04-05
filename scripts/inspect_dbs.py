import os, sqlite3, json
CWD = os.getcwd()
paths = [os.path.join(CWD,'dev_blossom.db'), os.path.join(CWD,'blossom.db')]
info = []
for p in paths:
    if not os.path.exists(p):
        info.append({'path': p, 'exists': False})
        continue
    try:
        conn = sqlite3.connect(p)
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        tables = [r[0] for r in cur.fetchall()]
        # sample auth/admin related rows counts if tables present
        counts = {}
        for t in ['auth_users','user','auth_roles','role']:
            if t in tables:
                try:
                    cur.execute(f'SELECT COUNT(*) FROM {t}')
                    counts[t] = cur.fetchone()[0]
                except Exception as e:
                    counts[t] = f'error:{e}'
        info.append({'path': p, 'exists': True, 'tables': tables, 'counts': counts})
        conn.close()
    except Exception as e:
        info.append({'path': p, 'exists': True, 'error': str(e)})
print(json.dumps({'databases': info}, ensure_ascii=False))
