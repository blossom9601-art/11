import sqlite3, sys
DB = sys.argv[1] if len(sys.argv) > 1 else '/opt/blossom/web/instance/dev_blossom.db'
c = sqlite3.connect(DB)
cur = c.cursor()
chan_conv_ids = [r[0] for r in cur.execute("select id from msg_conversation where conversation_type='CHANNEL'").fetchall()]
print('to_delete_conv_ids', chan_conv_ids)
for cid in chan_conv_ids:
    cur.execute('delete from msg_channel where conversation_id=?', (cid,))
    cur.execute('delete from msg_conversation_member where conversation_id=?', (cid,))
    cur.execute('delete from msg_conversation where id=?', (cid,))
c.commit()
print('msg_channel', cur.execute('select count(*) from msg_channel').fetchone())
print('msg_conv CHANNEL', cur.execute("select count(*) from msg_conversation where conversation_type='CHANNEL'").fetchone())
c.close()
