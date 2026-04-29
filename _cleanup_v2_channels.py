import paramiko
c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('192.168.56.108', username='root', password='123456', timeout=10)
PY = "/opt/blossom/web/venv/bin/python"
DB = "/opt/blossom/web/instance/dev_blossom.db"

# Cleanup: delete orphan v2 CHANNEL rows (msg_channel + msg_conversation + msg_conversation_member)
script = f"""
import sqlite3
c=sqlite3.connect(r'{DB}')
cur=c.cursor()
# 모든 CHANNEL 컨버세이션 찾아서 삭제
chan_conv_ids=[r[0] for r in cur.execute(\"select id from msg_conversation where conversation_type='CHANNEL'\").fetchall()]
print('to_delete_conv_ids', chan_conv_ids)
for cid in chan_conv_ids:
    cur.execute('delete from msg_channel where conversation_id=?', (cid,))
    cur.execute('delete from msg_conversation_member where conversation_id=?', (cid,))
    cur.execute('delete from msg_conversation where id=?', (cid,))
c.commit()
print('after cleanup:')
print('msg_channel', cur.execute('select count(*) from msg_channel').fetchone())
print('msg_conv CHANNEL', cur.execute(\"select count(*) from msg_conversation where conversation_type='CHANNEL'\").fetchone())
c.close()
"""
i,o,e=c.exec_command(f"{PY} -c \"{script.replace(chr(10),'; ').replace(chr(34),chr(39))}\"", timeout=30)
print(o.read().decode('utf-8','replace'))
err=e.read().decode('utf-8','replace')
if err.strip(): print('ERR:', err)
