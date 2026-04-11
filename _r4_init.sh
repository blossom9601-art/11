#!/bin/bash
set -e
WEB=/opt/blossom/lumina/web

# 1. Deploy updated files
cp /tmp/blossom_r4/__init__.py   $WEB/app/__init__.py
cp /tmp/blossom_r4/brand_setting_service.py $WEB/app/services/brand_setting_service.py
chown -R lumina:lumina $WEB/
echo "files deployed"

# 2. Environment
export FLASK_ENV=production
export SECRET_KEY=${SECRET_KEY:?"ERROR: SECRET_KEY env var is required"}
export DATABASE_URL="mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4"
export UPLOAD_FOLDER=/var/lib/blossom/lumina/web/uploads
export PYTHONPATH=$WEB

# 3. Drop user view so it gets recreated with fix
python3.9 -c "
import pymysql
conn = pymysql.connect(host='127.0.0.1', port=3306, user='lumina_admin', password='LuminaAdmin2026Secure', database='lumina', charset='utf8mb4')
cur = conn.cursor()
cur.execute('DROP VIEW IF EXISTS \`user\`')
cur.execute('DROP TABLE IF EXISTS brand_setting')
conn.commit()
conn.close()
print('   dropped user view + brand_setting table')
"

# 4. create_app()
echo ""
echo "=== create_app() ==="
python3.9 -c "
import sys, os
sys.path.insert(0, '$WEB')
from app import create_app
app = create_app()
with app.app_context():
    from app.models import db
    from sqlalchemy import inspect
    tables = inspect(db.engine).get_table_names()
    print('   OK: %d routes, %d tables' % (len(app.url_map._rules), len(tables)))
"

# 5. Create admin account
echo ""
echo "=== Admin account ==="
python3.9 << 'PYACCT'
import sys, os
sys.path.insert(0, '/opt/blossom/lumina/web')
os.environ.setdefault('FLASK_ENV', 'production')
os.environ.setdefault('SECRET_KEY', os.environ['SECRET_KEY'])
os.environ.setdefault('DATABASE_URL', 'mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4')
os.environ.setdefault('UPLOAD_FOLDER', '/var/lib/blossom/lumina/web/uploads')

from app.models import db
from flask import Flask
from werkzeug.security import generate_password_hash
from sqlalchemy import inspect, text

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ['DATABASE_URL']
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

with app.app_context():
    insp = inspect(db.engine)
    pw = generate_password_hash('admin1234!')

    # org_user (no password_hash column — profile table only)
    if insp.has_table('org_user'):
        cnt = db.session.execute(text('SELECT COUNT(*) FROM org_user')).scalar()
        if cnt == 0:
            # Get actual columns
            cols = [c['name'] for c in insp.get_columns('org_user')]
            print('   org_user columns:', cols)
            db.session.execute(text("""
                INSERT INTO org_user (emp_no, name, nickname, email, company, department, role, locked, fail_cnt)
                VALUES ('admin', '관리자', 'Admin', 'admin@blossom.local', 'Blossom', 'IT팀', 'admin', 0, 0)
            """))
            db.session.commit()
            print('   org_user: admin created')
        else:
            print('   org_user: %d rows exist' % cnt)
    else:
        print('   [WARN] org_user table missing!')

    # auth_users (has password_hash)
    if insp.has_table('auth_users'):
        cnt = db.session.execute(text('SELECT COUNT(*) FROM auth_users')).scalar()
        if cnt == 0:
            db.session.execute(text("""
                INSERT INTO auth_users (emp_no, password_hash, email, role, status)
                VALUES ('admin', :pw, 'admin@blossom.local', 'admin', 'active')
            """), {'pw': pw})
            db.session.commit()
            print('   auth_users: admin created')
        else:
            print('   auth_users: %d rows exist' % cnt)

    # role
    if insp.has_table('role'):
        cnt = db.session.execute(text('SELECT COUNT(*) FROM role')).scalar()
        if cnt == 0:
            db.session.execute(text("""
                INSERT INTO role (name, description,
                    dashboard_read, dashboard_write, hardware_read, hardware_write,
                    software_read, software_write, governance_read, governance_write,
                    datacenter_read, datacenter_write, cost_read, cost_write,
                    project_read, project_write, category_read, category_write)
                VALUES ('admin', '전체 관리자', 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1)
            """))
            db.session.commit()
            print('   role: admin created')
        else:
            print('   role: %d rows exist' % cnt)

    # users (legacy auth table)
    if insp.has_table('users'):
        cnt = db.session.execute(text('SELECT COUNT(*) FROM users')).scalar()
        if cnt == 0:
            db.session.execute(text("""
                INSERT INTO users (username, password_hash, role, is_active, login_fail_count)
                VALUES ('admin', :pw, 'admin', 1, 0)
            """), {'pw': pw})
            db.session.commit()
            print('   users: admin created')
        else:
            print('   users: %d rows exist' % cnt)
PYACCT

# 6. Restart
echo ""
echo "=== Restart ==="
systemctl restart lumina-web
sleep 5
systemctl status lumina-web --no-pager 2>&1 | head -8

# 7. HTTP test
echo ""
echo "=== HTTP test ==="
echo -n "/ : "
curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/
echo ""
echo -n "/login : "
curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/login
echo ""

echo ""
echo "=== /login HTML (first 15 lines) ==="
curl -s --max-time 5 http://127.0.0.1:8000/login | head -15

echo ""
echo "=== Error log (last 5) ==="
tail -5 /var/log/blossom/lumina/web/error.log 2>/dev/null || echo "(no log)"
