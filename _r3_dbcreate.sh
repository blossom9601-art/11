#!/bin/bash
set -e
export FLASK_ENV=production
export SECRET_KEY=${SECRET_KEY:?"ERROR: SECRET_KEY env var is required"}
export DATABASE_URL="mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4"
export UPLOAD_FOLDER=/var/lib/blossom/lumina/web/uploads
export PYTHONPATH=/opt/blossom/lumina/web

echo "=== 1. Drop problem tables ==="
python3.9 -c "
import pymysql
conn = pymysql.connect(host='127.0.0.1', port=3306, user='lumina_admin', password='LuminaAdmin2026Secure', database='lumina', charset='utf8mb4')
cur = conn.cursor()
cur.execute('SET FOREIGN_KEY_CHECKS = 0')
tables = ['wf_design_comment','wf_design_view','wf_design_like','wf_design_version','wf_design','sys_notification','access_zone','access_permission_zone','banned_passwords','active_sessions','page_tab_config','brand_setting','msg_room','msg_message','msg_room_member','msg_file']
for t in tables:
    try:
        cur.execute('DROP TABLE IF EXISTS \`%s\`' % t)
    except: pass
cur.execute('SET FOREIGN_KEY_CHECKS = 1')
conn.commit()
conn.close()
print('   problem tables dropped')
"

echo ""
echo "=== 2. db.create_all() ==="
python3.9 -c "
import sys, os
sys.path.insert(0, '/opt/blossom/lumina/web')
from app.models import db
from flask import Flask
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ['DATABASE_URL']
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)
with app.app_context():
    from sqlalchemy import inspect
    insp = inspect(db.engine)
    before = set(insp.get_table_names())
    print('   before: %d tables' % len(before))
    try:
        db.create_all()
        after = set(insp.get_table_names())
        created = after - before
        print('   created: %d new tables' % len(created))
        for t in sorted(created):
            print('     + %s' % t)
        print('   total: %d tables' % len(after))
    except Exception as e:
        print('   ERROR: %s' % e)
        import traceback
        traceback.print_exc()
"
