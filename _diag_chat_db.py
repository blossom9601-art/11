import paramiko
c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('192.168.56.108', username='root', password='123456', timeout=10)
PY = "/opt/blossom/web/venv/bin/python"
DB = "/opt/blossom/web/instance/dev_blossom.db"
def runpy(snippet):
    cmd = f'''{PY} -c "import sqlite3; c=sqlite3.connect(r'{DB}'); cur=c.cursor(); {snippet}; c.commit(); c.close()"'''
    i,o,e=c.exec_command(cmd, timeout=30)
    print('---'); print(o.read().decode('utf-8','replace'))
    err=e.read().decode('utf-8','replace')
    if err.strip(): print('ERR:', err)

runpy("[print('room', r) for r in cur.execute('select id,room_type,room_name,is_deleted from msg_room order by id desc limit 30').fetchall()]")
runpy("[print('chan', r) for r in cur.execute('select id,name,channel_type,conversation_id from msg_channel order by id desc limit 30').fetchall()]")
runpy("[print('conv', r) for r in cur.execute('select id,conversation_type,title,visibility,is_deleted from msg_conversation order by id desc limit 30').fetchall()]")
