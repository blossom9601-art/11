import sqlite3, glob
for db_path in glob.glob('instance/*.db'):
    try:
        conn = sqlite3.connect(db_path)
        tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%brand%'").fetchall()
        if tables:
            print(f"{db_path}: {[t[0] for t in tables]}")
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT * FROM brand_setting WHERE is_deleted=0").fetchall()
            for r in rows:
                print(f"  {dict(r)}")
        conn.close()
    except:
        pass
