import sqlite3, sys
con = sqlite3.connect('/opt/blossom/web/instance/blossom.db')
cur = con.cursor()
print('--- msg tables ---')
for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'msg_%'").fetchall():
    print(r[0])
for tbl in ['msg_conversation','msg_channel','msg_conversation_member','msg_chat_audit_log']:
    print('---', tbl, '---')
    try:
        for r in cur.execute(f"PRAGMA table_info({tbl})").fetchall():
            print(r)
    except Exception as e:
        print('ERR', e)
print('--- count rows ---')
for tbl in ['msg_conversation','msg_channel']:
    try:
        print(tbl, cur.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone())
    except Exception as e:
        print('ERR', tbl, e)

# Try a real insert mimicking the handler
print('--- test insert ---')
from datetime import datetime
try:
    cur.execute("INSERT INTO msg_conversation (conversation_type, visibility, title, description, owner_user_id, created_by, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?)",
        ('CHANNEL','public','diag-test',None,1,1,1,datetime.utcnow()))
    cid = cur.lastrowid
    print('conv inserted', cid)
    cur.execute("INSERT INTO msg_channel (conversation_id, name, slug, channel_type, description, topic, created_by) VALUES (?,?,?,?,?,?,?)",
        (cid,'diag-test','diag-test','public',None,None,1))
    print('chan inserted')
    cur.execute("INSERT INTO msg_conversation_member (conversation_id, user_id, role) VALUES (?,?,?)", (cid,1,'admin'))
    print('member inserted')
    con.rollback()
    print('rollback OK')
except Exception as e:
    import traceback; traceback.print_exc()
