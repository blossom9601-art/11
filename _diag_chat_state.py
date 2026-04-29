import sqlite3
con = sqlite3.connect('/opt/blossom/web/instance/dev_blossom.db')
print('channels:')
for r in con.execute('SELECT id, name, slug, channel_type FROM msg_channel ORDER BY id').fetchall():
    print(r)
print('conversations:')
for r in con.execute('SELECT id, conversation_type, title, owner_user_id, is_deleted FROM msg_conversation ORDER BY id').fetchall():
    print(r)
print('---org_user count---')
print(con.execute('SELECT COUNT(*) FROM org_user').fetchone())
print('admin org_user:')
for r in con.execute("SELECT id, emp_no, name FROM org_user WHERE emp_no='admin' OR id=1").fetchall():
    print(r)
