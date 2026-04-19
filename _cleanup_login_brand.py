import sqlite3
c = sqlite3.connect('instance/dev_blossom.db')
c.execute("UPDATE brand_setting SET is_deleted=1 WHERE key='login.backgroundImage' AND is_deleted=0")
c.commit()
print('Local DB: login.backgroundImage soft-deleted')
c.close()
