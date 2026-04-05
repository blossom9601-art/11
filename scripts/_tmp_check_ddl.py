import sqlite3
c = sqlite3.connect('instance/dev_blossom.db')
r = c.execute("SELECT sql FROM sqlite_master WHERE name='capex_contract' AND type='table'").fetchone()
print(r[0] if r else 'N/A')
c.close()
