import sqlite3, os, glob
for path in sorted(glob.glob('/opt/blossom/web/instance/*.db')):
    try:
        con = sqlite3.connect(path)
        rows = con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('msg_conversation','msg_channel','msg_conversation_member')").fetchall()
        if rows:
            print(path, [r[0] for r in rows])
    except Exception as e:
        print('ERR', path, e)
print('---')
import sys
sys.path.insert(0, '/opt/blossom/web')
os.chdir('/opt/blossom/web')
from app import create_app
app = create_app()
with app.app_context():
    from app.models import db
    print('engine.url=', db.engine.url)
    print('engine.url.database=', db.engine.url.database)
