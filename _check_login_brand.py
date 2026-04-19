import sqlite3
conn = sqlite3.connect('instance/blossom.db')
conn.row_factory = sqlite3.Row
rows = conn.execute("SELECT * FROM brand_setting WHERE key LIKE '%login%' OR category='login'").fetchall()
print("Login brand settings:", [dict(r) for r in rows])
rows2 = conn.execute("SELECT * FROM brand_setting WHERE is_deleted=0").fetchall()
print("\nAll active settings:")
for r in rows2:
    print(f"  {dict(r)}")
conn.close()
