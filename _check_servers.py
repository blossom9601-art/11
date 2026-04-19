import sqlite3
c = sqlite3.connect('instance/blossom.db')
cols = [d[0] for d in c.execute("SELECT * FROM servers LIMIT 0").description]
print("columns:", cols[:10])
rows = c.execute("SELECT * FROM servers LIMIT 3").fetchall()
for r in rows:
    print(r[:10])
c.close()
