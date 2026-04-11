#!/bin/bash
###############################################################################
# Blossom MySQL 호환성 패치 — 서버 배포 스크립트
# 대상: /opt/blossom/lumina/web/
# 수정:
#   1. __init__.py: AUTOINCREMENT → AUTO_INCREMENT, INSERT OR IGNORE → INSERT IGNORE
#   2. __init__.py: 마지막 rollback을 app_context 안으로 이동
#   3. models.py: 인덱스된 db.Text 컬럼 → db.String(N) (MySQL TEXT 인덱스 제한)
#   4. instance/ 디렉터리 생성 (보조 sqlite3 서비스용)
#   5. flask db upgrade 실행
#   6. lumina-web 재시작 및 검증
###############################################################################
set -euo pipefail

WEB="/opt/blossom/lumina/web"
INITPY="$WEB/app/__init__.py"
MODELS="$WEB/app/models.py"

echo "================================================================"
echo " Blossom MySQL 호환성 패치 시작"
echo "================================================================"

# ──────── 1. __init__.py 패치 ────────
echo ""
echo "── 1. __init__.py AUTOINCREMENT 패치 ──"
cnt_ai=$(grep -c 'AUTOINCREMENT' "$INITPY" 2>/dev/null || echo 0)
sed -i 's/AUTOINCREMENT/AUTO_INCREMENT/g' "$INITPY"
echo "   AUTOINCREMENT → AUTO_INCREMENT: ${cnt_ai}건"

echo ""
echo "── 2. __init__.py INSERT OR IGNORE 패치 ──"
cnt_oi=$(grep -c 'INSERT OR IGNORE' "$INITPY" 2>/dev/null || echo 0)
sed -i 's/INSERT OR IGNORE/INSERT IGNORE/g' "$INITPY"
echo "   INSERT OR IGNORE → INSERT IGNORE: ${cnt_oi}건"

echo ""
echo "── 3. __init__.py rollback app_context 패치 ──"
python3.9 << 'PYFIX1'
with open("/opt/blossom/lumina/web/app/__init__.py", "r") as f:
    content = f.read()

# Pattern: bare "db.session.rollback()" outside app context after wrk_report_user_clear except
old = """    except Exception as e:
        db.session.rollback()
        print('[wrk-report] wrk_report_user_clear migration error:', e, flush=True)

    return app"""

new = """    except Exception as e:
        try:
            with app.app_context():
                db.session.rollback()
        except Exception:
            pass
        print('[wrk-report] wrk_report_user_clear migration error:', e, flush=True)

    return app"""

if old in content:
    content = content.replace(old, new)
    with open("/opt/blossom/lumina/web/app/__init__.py", "w") as f:
        f.write(content)
    print("   rollback → app_context 래핑 완료")
else:
    print("   (이미 패치됨 또는 패턴 불일치)")
PYFIX1

# ──────── 2. models.py 패치 ────────
echo ""
echo "── 4. models.py TEXT→String 인덱스 호환 패치 ──"
python3.9 << 'PYFIX2'
with open("/opt/blossom/lumina/web/app/models.py", "r") as f:
    content = f.read()

changes = 0

# SvcTicket: priority + status
old = "    priority = db.Column(db.Text, nullable=False)\n    status = db.Column(db.Text, nullable=False, server_default=db.text(\"'PENDING'\"))"
new = "    priority = db.Column(db.String(64), nullable=False)\n    status = db.Column(db.String(64), nullable=False, server_default=db.text(\"'PENDING'\"))"
if old in content:
    content = content.replace(old, new)
    changes += 2
    print("   SvcTicket.priority/status → String(64)")

# PrjProject: status
old = "        # 진행/일정\n        status = db.Column(db.Text, nullable=False)\n        budget_amount"
new = "        # 진행/일정\n        status = db.Column(db.String(64), nullable=False)\n        budget_amount"
if old in content:
    content = content.replace(old, new)
    changes += 1
    print("   PrjProject.status → String(64)")

# UiTaskHistory: scope_type + scope_ref
old = "    scope_type = db.Column(db.Text, nullable=False)\n    scope_id = db.Column(db.Integer)\n    scope_ref = db.Column(db.Text)"
new = "    scope_type = db.Column(db.String(255), nullable=False)\n    scope_id = db.Column(db.Integer)\n    scope_ref = db.Column(db.String(512))"
if old in content:
    content = content.replace(old, new)
    changes += 2
    print("   UiTaskHistory.scope_type/scope_ref → String(255/512)")

# DcAccessSystem: system_code
old = "    system_code = db.Column(db.Text, nullable=False, unique=True)\n    business_status_code = db.Column(db.Text, nullable=False)"
new = "    system_code = db.Column(db.String(255), nullable=False, unique=True)\n    business_status_code = db.Column(db.Text, nullable=False)"
if old in content:
    content = content.replace(old, new)
    changes += 1
    print("   DcAccessSystem.system_code → String(255)")

# DcAccessPermission: status
old = "    access_level = db.Column(db.Text)\n    status = db.Column(db.Text)\n    remark = db.Column(db.Text)\n\n    permission_start_date"
new = "    access_level = db.Column(db.Text)\n    status = db.Column(db.String(64))\n    remark = db.Column(db.Text)\n\n    permission_start_date"
if old in content:
    content = content.replace(old, new)
    changes += 1
    print("   DcAccessPermission.status → String(64)")

# DcAuthorityRecord: status + change_type (한국어 주석 포함)
old = "    status = db.Column(db.Text)                    # 활성 / 만료\n    change_datetime = db.Column(db.Text)            # YYYY-MM-DD HH:MM\n    change_type = db.Column(db.Text)                # 정보 수정 / 정보 삭제 / 신규 등록"
new = "    status = db.Column(db.String(64))              # 활성 / 만료\n    change_datetime = db.Column(db.Text)            # YYYY-MM-DD HH:MM\n    change_type = db.Column(db.String(64))          # 정보 수정 / 정보 삭제 / 신규 등록"
if old in content:
    content = content.replace(old, new)
    changes += 2
    print("   DcAuthorityRecord.status/change_type → String(64)")

with open("/opt/blossom/lumina/web/app/models.py", "w") as f:
    f.write(content)
print(f"   총 {changes}개 컬럼 패치")
PYFIX2

# ──────── 3. instance/ 디렉터리 ────────
echo ""
echo "── 5. instance 디렉터리 생성 ──"
mkdir -p "$WEB/instance"
chown -R lumina:lumina "$WEB/instance/"
chmod 775 "$WEB/instance/"
echo "   $WEB/instance/ 준비 완료"

# ──────── 4. uploads 디렉터리 ────────
echo ""
echo "── 6. uploads 디렉터리 생성 ──"
mkdir -p /var/lib/blossom/lumina/web/uploads
chown -R lumina:lumina /var/lib/blossom/lumina/web/uploads
echo "   /var/lib/blossom/lumina/web/uploads 준비 완료"

# ──────── 5. 소유권 재설정 ────────
echo ""
echo "── 7. 파일 소유권 설정 ──"
chown -R lumina:lumina "$WEB/"
echo "   $WEB/ → lumina:lumina"

# ──────── 6. flask db upgrade ────────
echo ""
echo "── 8. Flask DB 마이그레이션 ──"
export FLASK_ENV=production
export FLASK_APP=run.py
export SECRET_KEY=${SECRET_KEY:?"ERROR: SECRET_KEY env var is required"}
export DATABASE_URL="mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4"
export MYSQL_HOST=127.0.0.1
export MYSQL_PORT=3306
export MYSQL_USER=lumina_admin
export MYSQL_PASSWORD=LuminaAdmin2026Secure
export MYSQL_DB=lumina
export UPLOAD_FOLDER=/var/lib/blossom/lumina/web/uploads
export PYTHONPATH="$WEB"
cd "$WEB"

# Alembic 마이그레이션 실행 (테이블 생성)
python3.9 -m flask db upgrade 2>&1 || {
    echo "   [WARN] flask db upgrade 실패 — 수동 테이블 생성 시도"
    python3.9 << 'DBINIT'
import sys
sys.path.insert(0, '/opt/blossom/lumina/web')
from app import create_app
from app.models import db
try:
    app = create_app()
    with app.app_context():
        db.create_all()
        print("   db.create_all() 완료")
except Exception as e:
    print(f"   db.create_all() 실패: {e}")
DBINIT
}

# ──────── 7. Flask 앱 import 테스트 ────────
echo ""
echo "── 9. Flask 앱 import 테스트 ──"
python3.9 << 'PYTEST'
import sys, os
sys.path.insert(0, '/opt/blossom/lumina/web')
os.environ.setdefault('FLASK_ENV', 'production')
os.environ.setdefault('SECRET_KEY', os.environ['SECRET_KEY'])
os.environ.setdefault('DATABASE_URL', 'mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4')
os.environ.setdefault('UPLOAD_FOLDER', '/var/lib/blossom/lumina/web/uploads')
try:
    from app import create_app
    app = create_app()
    print(f"   create_app() 성공: {len(app.url_map._rules)} routes")
    with app.app_context():
        from app.models import db
        from sqlalchemy import inspect
        tables = inspect(db.engine).get_table_names()
        print(f"   DB 테이블: {len(tables)}개")
        if tables:
            print(f"   예시: {', '.join(sorted(tables)[:10])}")
except Exception as e:
    import traceback
    print(f"   FAILED: {e}")
    traceback.print_exc()
PYTEST

# ──────── 8. 서비스 재시작 ────────
echo ""
echo "── 10. lumina-web 서비스 재시작 ──"
mkdir -p /run/blossom/lumina
chown lumina:lumina /run/blossom/lumina
systemctl reset-failed lumina-web 2>/dev/null || true
systemctl restart lumina-web
sleep 5

echo ""
systemctl status lumina-web --no-pager 2>&1 | head -15

# ──────── 9. HTTP 검증 ────────
echo ""
echo "── 11. HTTP 응답 확인 ──"
echo -n "   gunicorn (8000): HTTP "
curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/ 2>&1
echo ""
echo -n "   nginx HTTPS (443): HTTP "
curl -sk --max-time 5 -o /dev/null -w "%{http_code}" https://127.0.0.1/ 2>&1
echo ""

echo ""
echo "── 12. 최근 에러 로그 ──"
tail -20 /var/log/blossom/lumina/web/error.log 2>/dev/null || echo "   (로그 파일 없음)"

echo ""
echo "================================================================"
echo " 패치 완료"
echo "================================================================"
