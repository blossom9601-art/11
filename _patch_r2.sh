#!/bin/bash
###############################################################################
# Round 2 패치: 수정된 파일 배포 + db.create_all() + 서비스 재시작
###############################################################################
set -euo pipefail

WEB="/opt/blossom/lumina/web"
SRC="/tmp/blossom_r2"

echo "=== Round 2: 파일 배포 ==="
# 파일 복사 (SRC에서 배포)
cp "$SRC/app/__init__.py"                          "$WEB/app/__init__.py"
cp "$SRC/app/models.py"                            "$WEB/app/models.py"
cp "$SRC/app/security.py"                          "$WEB/app/security.py"
cp "$SRC/app/services/chat_service.py"             "$WEB/app/services/chat_service.py"
cp "$SRC/app/services/page_tab_config_service.py"  "$WEB/app/services/page_tab_config_service.py"
cp "$SRC/app/services/brand_setting_service.py"    "$WEB/app/services/brand_setting_service.py"

echo "   6개 파일 배포 완료"

# 소유권
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
echo "=== db.create_all() 실행 ==="
python3.9 << 'PYDB'
import sys, os
sys.path.insert(0, '/opt/blossom/lumina/web')
os.environ.setdefault('FLASK_ENV', 'production')
os.environ.setdefault('SECRET_KEY', os.environ['SECRET_KEY'])
os.environ.setdefault('DATABASE_URL', 'mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4')
os.environ.setdefault('UPLOAD_FOLDER', '/var/lib/blossom/lumina/web/uploads')

from app.models import db
from flask import Flask

# Minimal app just for creating tables
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
        print(f"   신규 테이블: {len(created)}개")
        if created:
            for t in sorted(created):
                print(f"     + {t}")
        print(f"   전체 테이블: {len(after)}개")
    except Exception as e:
        print(f"   오류: {e}")
        import traceback
        traceback.print_exc()

    # org_user 확인
    if insp.has_table('org_user'):
        print("   org_user 테이블: 존재")
    else:
        print("   [WARN] org_user 테이블 누락!")
PYDB

echo ""
echo "=== create_app() + init 실행 ==="
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
echo "=== 기본 관리자 계정 확인 + 생성 ==="
python3.9 << 'PYSEED'
import sys, os
sys.path.insert(0, '/opt/blossom/lumina/web')
os.environ.setdefault('FLASK_ENV', 'production')
os.environ.setdefault('SECRET_KEY', os.environ['SECRET_KEY'])
os.environ.setdefault('DATABASE_URL', 'mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4')
os.environ.setdefault('UPLOAD_FOLDER', '/var/lib/blossom/lumina/web/uploads')

from app.models import db, User
from flask import Flask

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ['DATABASE_URL']
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

with app.app_context():
    from sqlalchemy import inspect, text
    insp = inspect(db.engine)

    # org_user 테이블이 있으면 admin 계정 확인
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
            print("   admin 계정 생성 (admin / admin1234!)")
        else:
            print(f"   org_user: {row}건 존재")
    else:
        print("   [WARN] org_user 테이블 없음")

    # role 테이블에 admin 역할 확인
    if insp.has_table('role'):
        role_cnt = db.session.execute(text("SELECT COUNT(*) FROM role")).scalar()
        if role_cnt == 0:
            db.session.execute(text("""
                INSERT INTO role (name, description, dashboard_read, dashboard_write,
                    hardware_read, hardware_write, software_read, software_write,
                    governance_read, governance_write, datacenter_read, datacenter_write,
                    cost_read, cost_write, project_read, project_write,
                    category_read, category_write)
                VALUES ('admin', '전체 관리자', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)
            """))
            db.session.commit()
            print("   admin 역할 생성")
        else:
            print(f"   role: {role_cnt}건 존재")
PYSEED

echo ""
echo "=== lumina-web 재시작 ==="
systemctl restart lumina-web
sleep 5
systemctl status lumina-web --no-pager 2>&1 | head -10

echo ""
echo "=== HTTP 검증 ==="
echo -n "   gunicorn: HTTP "
curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/ 2>&1
echo ""

echo -n "   /login: HTTP "
curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/login 2>&1
echo ""

echo ""
echo "   /login HTML (5줄):"
curl -s --max-time 5 http://127.0.0.1:8000/login 2>&1 | head -5

echo ""
echo "=== 최근 에러 ==="
tail -5 /var/log/blossom/lumina/web/error.log 2>/dev/null

echo ""
echo "=== Round 2 완료 ==="
