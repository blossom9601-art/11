import sqlite3
from pathlib import Path

DB_PATH = Path(r"c:\Users\ME\Desktop\blossom\instance\dev_blossom.db")

if not DB_PATH.exists():
    print("NO")
    raise SystemExit(0)

con = sqlite3.connect(str(DB_PATH))
try:
    tables = [r[0] for r in con.execute("select name from sqlite_master where type='table' order by name").fetchall()]
finally:
    con.close()

ad_tables = [t for t in tables if "ad" in t.lower()]

print("YES" if ad_tables else "NO")
