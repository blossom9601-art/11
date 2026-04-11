#!/bin/bash
set -e
export FLASK_ENV=production
export SECRET_KEY=${SECRET_KEY:?"ERROR: SECRET_KEY env var is required"}
export DATABASE_URL="mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4"
export UPLOAD_FOLDER=/var/lib/blossom/lumina/web/uploads
export PYTHONPATH=/opt/blossom/lumina/web

echo "=== 1. create_app() ==="
python3.9 -c "
import sys, os
sys.path.insert(0, '/opt/blossom/lumina/web')
try:
    from app import create_app
    app = create_app()
    with app.app_context():
        from app.models import db
        from sqlalchemy import inspect
        tables = inspect(db.engine).get_table_names()
        print('   create_app() OK: %d routes, %d tables' % (len(app.url_map._rules), len(tables)))
except Exception as e:
    print('   create_app() ERROR: %s' % e)
    import traceback
    traceback.print_exc()
"

echo ""
echo "=== 2. Admin account ==="
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
    from sqlalchemy import inspect, text
    insp = inspect(db.engine)

    # org_user
    if insp.has_table('org_user'):
        cnt = db.session.execute(text('SELECT COUNT(*) FROM org_user')).scalar()
        if cnt == 0:
            from werkzeug.security import generate_password_hash
            pw = generate_password_hash('admin1234!')
            db.session.execute(text(\"\"\"
                INSERT INTO org_user (emp_no, name, nickname, email, password_hash, company, department, role, locked, fail_cnt)
                VALUES ('admin', '관리자', 'Admin', 'admin@blossom.local', :pw, 'Blossom', 'IT팀', 'admin', 0, 0)
            \"\"\"), {'pw': pw})
            db.session.commit()
            print('   org_user: admin created')
        else:
            print('   org_user: %d rows exist' % cnt)
    else:
        print('   [WARN] org_user table missing!')

    # role
    if insp.has_table('role'):
        cnt = db.session.execute(text('SELECT COUNT(*) FROM role')).scalar()
        if cnt == 0:
            db.session.execute(text(\"\"\"
                INSERT INTO role (name, description,
                    dashboard_read, dashboard_write, hardware_read, hardware_write,
                    software_read, software_write, governance_read, governance_write,
                    datacenter_read, datacenter_write, cost_read, cost_write,
                    project_read, project_write, category_read, category_write)
                VALUES ('admin', '전체 관리자', 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1)
            \"\"\"))
            db.session.commit()
            print('   role: admin role created')
        else:
            print('   role: %d rows exist' % cnt)

    # auth_users
    if insp.has_table('auth_users'):
        cnt = db.session.execute(text('SELECT COUNT(*) FROM auth_users')).scalar()
        if cnt == 0 and insp.has_table('org_user'):
            row = db.session.execute(text(
                \"SELECT id, emp_no, password_hash, email FROM org_user WHERE emp_no='admin' LIMIT 1\"
            )).fetchone()
            if row:
                db.session.execute(text(\"\"\"
                    INSERT INTO auth_users (org_user_id, username, password_hash, email, role, is_active)
                    VALUES (:uid, 'admin', :pw, :email, 'admin', 1)
                \"\"\"), {'uid': row[0], 'pw': row[2], 'email': row[3]})
                db.session.commit()
                print('   auth_users: admin linked')
        else:
            print('   auth_users: %d rows exist' % cnt)

    # users (legacy table)
    if insp.has_table('users'):
        cnt = db.session.execute(text('SELECT COUNT(*) FROM users')).scalar()
        if cnt == 0:
            from werkzeug.security import generate_password_hash
            pw = generate_password_hash('admin1234!')
            db.session.execute(text(\"\"\"
                INSERT INTO users (username, password_hash, role, is_active, login_fail_count)
                VALUES ('admin', :pw, 'admin', 1, 0)
            \"\"\"), {'pw': pw})
            db.session.commit()
            print('   users: admin created')
        else:
            print('   users: %d rows exist' % cnt)
"

echo ""
echo "=== 3. Restart lumina-web ==="
systemctl restart lumina-web
sleep 5
systemctl status lumina-web --no-pager 2>&1 | head -10

echo ""
echo "=== 4. HTTP test ==="
echo -n "   / : HTTP "
curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/ 2>&1
echo ""
echo -n "   /login : HTTP "
curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/login 2>&1
echo ""
echo -n "   HTTPS : HTTP "
curl -sk --max-time 5 -o /dev/null -w "%{http_code}" https://127.0.0.1/ 2>&1
echo ""

echo ""
echo "=== 5. /login HTML ==="
curl -s --max-time 5 http://127.0.0.1:8000/login 2>&1 | head -20

echo ""
echo "=== 6. Recent errors ==="
tail -20 /var/log/blossom/lumina/web/error.log 2>/dev/null | tail -10

echo ""
echo "=== Done ==="
