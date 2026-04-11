#!/bin/bash
###############################################################################
# Round 3 패치: models.py Text→String 완료 + 전체 재배포
###############################################################################
set -euo pipefail

WEB="/opt/blossom/lumina/web"
SRC="/tmp/blossom_r3"

echo "=== Round 3: 파일 배포 ==="
cp "$SRC/app/__init__.py"                          "$WEB/app/__init__.py"
cp "$SRC/app/models.py"                            "$WEB/app/models.py"
cp "$SRC/app/security.py"                          "$WEB/app/security.py"
cp "$SRC/app/services/chat_service.py"             "$WEB/app/services/chat_service.py"
cp "$SRC/app/services/page_tab_config_service.py"  "$WEB/app/services/page_tab_config_service.py"
cp "$SRC/app/services/brand_setting_service.py"    "$WEB/app/services/brand_setting_service.py"
echo "   6개 파일 배포 완료"

# __init__.py sed로 AUTOINCREMENT 점검 (이미 소스에서 치환했지만 안전장치)
cnt_ai=$(grep -c 'AUTOINCREMENT' "$WEB/app/__init__.py" 2>/dev/null || echo 0)
if [ "$cnt_ai" -gt 0 ]; then
    sed -i 's/AUTOINCREMENT/AUTO_INCREMENT/g' "$WEB/app/__init__.py"
    echo "   __init__.py AUTOINCREMENT 추가 치환: $cnt_ai건"
fi

# 서비스 파일에서 INSERT OR IGNORE 잔여 치환
sed -i 's/INSERT OR IGNORE/INSERT IGNORE/g' "$WEB/app/__init__.py" 2>/dev/null || true

# pages.py, server_software_service.py, hw_maintenance_contract_service.py — from __future__ 확인
for f in app/routes/pages.py app/services/hw_maintenance_contract_service.py app/services/server_software_service.py; do
    fp="$WEB/$f"
    if [ -f "$fp" ] && ! grep -q 'from __future__ import annotations' "$fp"; then
        sed -i '1s/^/from __future__ import annotations\n/' "$fp"
        echo "   $f: added __future__ annotations"
    fi
done

chown -R lumina:lumina "$WEB/"
echo "   소유권 설정 완료"

# 환경변수
export FLASK_ENV=production
export SECRET_KEY=${SECRET_KEY:?"ERROR: SECRET_KEY env var is required"}
export DATABASE_URL="mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4"
export MYSQL_HOST=127.0.0.1
export MYSQL_PORT=3306
export MYSQL_USER=lumina_admin
export MYSQL_PASSWORD=LuminaAdmin2026Secure
export MYSQL_DB=lumina
export UPLOAD_FOLDER=/var/lib/blossom/lumina/web/uploads
export PYTHONPATH="$WEB"

echo ""
echo "=== 1. 기존 스키마 정리 (충돌 테이블 드롭) ==="
python3.9 << 'PYCLEAN'
import sys, os, pymysql
sys.path.insert(0, '/opt/blossom/lumina/web')

conn = pymysql.connect(host='127.0.0.1', port=3306,
                       user='lumina_admin', password='LuminaAdmin2026Secure',
                       database='lumina', charset='utf8mb4')
cur = conn.cursor()

# 이전 실패한 create_all에서 부분 생성된 테이블 제거 (FK 순서 고려)
cur.execute("SET FOREIGN_KEY_CHECKS = 0")

# 부분 생성되어 FK 오류 발생하는 테이블 드롭
problem_tables = [
    'wf_design_comment', 'wf_design_view', 'wf_design_like', 'wf_design_version',
    'wf_design', 'sys_notification',
    'access_zone', 'access_permission_zone',
    'banned_passwords', 'active_sessions',
    'page_tab_config', 'brand_setting',
    'msg_room', 'msg_message', 'msg_room_member', 'msg_file',
]
for tbl in problem_tables:
    try:
        cur.execute(f"DROP TABLE IF EXISTS `{tbl}`")
    except Exception:
        pass

cur.execute("SET FOREIGN_KEY_CHECKS = 1")
conn.commit()
conn.close()
print("   문제 테이블 드롭 완료")
PYCLEAN

echo ""
echo "=== 2. db.create_all() ==="
python3.9 << 'PYDB'
import sys, os
sys.path.insert(0, '/opt/blossom/lumina/web')
os.environ.setdefault('FLASK_ENV', 'production')
os.environ.setdefault('SECRET_KEY', os.environ['SECRET_KEY'])
os.environ.setdefault('DATABASE_URL', 'mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4')
os.environ.setdefault('UPLOAD_FOLDER', '/var/lib/blossom/lumina/web/uploads')

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
    print(f"   기존 테이블: {len(before)}개")
    try:
        db.create_all()
        after = set(insp.get_table_names())
        created = after - before
        print(f"   신규 생성: {len(created)}개")
        if created:
            for t in sorted(created):
                print(f"     + {t}")
        print(f"   전체 테이블: {len(after)}개")
    except Exception as e:
        print(f"   오류: {e}")
        import traceback
        traceback.print_exc()
PYDB

echo ""
echo "=== 3. create_app() 통합 테스트 ==="
python3.9 << 'PYINIT'
import sys, os
sys.path.insert(0, '/opt/blossom/lumina/web')
os.environ.setdefault('FLASK_ENV', 'production')
os.environ.setdefault('SECRET_KEY', os.environ['SECRET_KEY'])
os.environ.setdefault('DATABASE_URL', 'mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4')
os.environ.setdefault('UPLOAD_FOLDER', '/var/lib/blossom/lumina/web/uploads')
try:
    from app import create_app
    app = create_app()
    with app.app_context():
        from app.models import db
        from sqlalchemy import inspect
        tables = inspect(db.engine).get_table_names()
        print(f"   create_app() 성공: {len(app.url_map._rules)} routes, {len(tables)} tables")
except Exception as e:
    print(f"   create_app() 오류: {e}")
    import traceback
    traceback.print_exc()
PYINIT

echo ""
echo "=== 4. 관리자 계정 확인/생성 ==="
python3.9 << 'PYSEED'
import sys, os
sys.path.insert(0, '/opt/blossom/lumina/web')
os.environ.setdefault('FLASK_ENV', 'production')
os.environ.setdefault('SECRET_KEY', os.environ['SECRET_KEY'])
os.environ.setdefault('DATABASE_URL', 'mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4')
os.environ.setdefault('UPLOAD_FOLDER', '/var/lib/blossom/lumina/web/uploads')

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
        row = db.session.execute(text("SELECT COUNT(*) FROM org_user")).scalar()
        if row == 0:
            from werkzeug.security import generate_password_hash
            db.session.execute(text("""
                INSERT INTO org_user (emp_no, name, nickname, email, password_hash, company, department, role, locked, fail_cnt)
                VALUES ('admin', '관리자', 'Admin', 'admin@blossom.local',
                        :pw, 'Blossom', 'IT팀', 'admin', 0, 0)
            """), {'pw': generate_password_hash('admin1234!')})
            db.session.commit()
            print("   admin 계정 생성 완료 (admin / admin1234!)")
        else:
            print(f"   org_user: {row}건 존재")
    else:
        print("   [WARN] org_user 테이블 없음!")

    # role
    if insp.has_table('role'):
        role_cnt = db.session.execute(text("SELECT COUNT(*) FROM role")).scalar()
        if role_cnt == 0:
            db.session.execute(text("""
                INSERT INTO role (name, description,
                    dashboard_read, dashboard_write, hardware_read, hardware_write,
                    software_read, software_write, governance_read, governance_write,
                    datacenter_read, datacenter_write, cost_read, cost_write,
                    project_read, project_write, category_read, category_write)
                VALUES ('admin', '전체 관리자',
                    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)
            """))
            db.session.commit()
            print("   admin 역할 생성 완료")
        else:
            print(f"   role: {role_cnt}건 존재")

    # auth_users
    if insp.has_table('auth_users'):
        auth_cnt = db.session.execute(text("SELECT COUNT(*) FROM auth_users")).scalar()
        if auth_cnt == 0 and insp.has_table('org_user'):
            # org_user의 admin 정보로 auth_users에도 생성
            admin_row = db.session.execute(text(
                "SELECT id, emp_no, password_hash, email FROM org_user WHERE emp_no='admin' LIMIT 1"
            )).fetchone()
            if admin_row:
                db.session.execute(text("""
                    INSERT INTO auth_users (org_user_id, username, password_hash, email, role, is_active)
                    VALUES (:uid, 'admin', :pw, :email, 'admin', 1)
                """), {'uid': admin_row[0], 'pw': admin_row[2], 'email': admin_row[3]})
                db.session.commit()
                print("   auth_users admin 생성 완료")
        else:
            print(f"   auth_users: {auth_cnt}건 존재")
PYSEED

echo ""
echo "=== 5. lumina-web 재시작 ==="
systemctl restart lumina-web
sleep 5
systemctl status lumina-web --no-pager 2>&1 | head -10

echo ""
echo "=== 6. HTTP 검증 ==="
echo -n "   gunicorn /: HTTP "
curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/ 2>&1
echo ""
echo -n "   gunicorn /login: HTTP "
curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/login 2>&1
echo ""
echo -n "   nginx HTTPS: HTTP "
curl -sk --max-time 5 -o /dev/null -w "%{http_code}" https://127.0.0.1/ 2>&1
echo ""

echo ""
echo "   /login HTML:"
curl -s --max-time 5 http://127.0.0.1:8000/login 2>&1 | head -10
echo ""

echo "=== 7. 에러 로그 (최근 10줄) ==="
tail -10 /var/log/blossom/lumina/web/error.log 2>/dev/null

echo ""
echo "=== Round 3 완료 ==="
