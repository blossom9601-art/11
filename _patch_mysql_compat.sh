#!/bin/bash
###############################################################################
# Blossom __init__.py MySQL 호환 패치
# - AUTOINCREMENT → AUTO_INCREMENT
# - app context 밖 rollback → app context 안으로
# - sqlite3 직접사용 서비스에서의 오류 무시
###############################################################################
set -euo pipefail

INITPY="/opt/blossom/lumina/web/app/__init__.py"

echo "=== __init__.py 패치 ==="

# 1. AUTOINCREMENT → AUTO_INCREMENT (MySQL 호환)
count=$(grep -c 'AUTOINCREMENT' "$INITPY" 2>/dev/null || echo 0)
sed -i 's/AUTOINCREMENT/AUTO_INCREMENT/g' "$INITPY"
echo "  AUTOINCREMENT → AUTO_INCREMENT: $count건"

# 2. Line 2042: db.session.rollback() → with app.app_context():
#    마지막 except 블록의 rollback을 app context 안으로
sed -i '/wrk_report_user_clear migration error/{ 
    N
    s/    except Exception as e:\n        db.session.rollback()/    except Exception as e:\n        try:\n            with app.app_context():\n                db.session.rollback()\n        except Exception:\n            pass/
}' "$INITPY" 2>/dev/null || true

# 더 정확한 패치: python으로 처리
python3.9 << 'PYFIX'
import re

with open("/opt/blossom/lumina/web/app/__init__.py", "r") as f:
    content = f.read()

# Pattern: bare "db.session.rollback()" outside app context after except
# Replace the last occurrence near "return app"
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
    print("  patched: bare rollback → app_context wrapped")
else:
    print("  note: bare rollback pattern not found (may already be patched)")

with open("/opt/blossom/lumina/web/app/__init__.py", "w") as f:
    f.write(content)
PYFIX

# 3. 보조 서비스의 sqlite3 직접 호출 무시 (MySQL 환경에서는 사용 안함)
# instance 디렉터리에 빈 db 파일 필요한 서비스들 확인
echo ""
echo "=== 보조 sqlite3 서비스 확인 ==="
grep -rn "sqlite3.connect\|instance/" /opt/blossom/lumina/web/app/services/ --include='*.py' 2>&1 | grep -v __pycache__ | head -20

echo ""
echo "=== instance 디렉터리 생성 ==="
mkdir -p /opt/blossom/lumina/web/instance
# 빈 sqlite db 파일 생성 (보조 서비스가 필요로 하는 경우)
touch /opt/blossom/lumina/web/instance/.keep
chown -R lumina:lumina /opt/blossom/lumina/web/instance/

# 4. chat_service.py의 SQL도 MySQL 호환으로 패치
echo ""
echo "=== chat_service SQL 패치 ==="
CHAT_SVC="/opt/blossom/lumina/web/app/services/chat_service.py"
if [ -f "$CHAT_SVC" ]; then
    sed -i 's/AUTOINCREMENT/AUTO_INCREMENT/g' "$CHAT_SVC"
    count=$(grep -c 'AUTO_INCREMENT' "$CHAT_SVC" 2>/dev/null || echo 0)
    echo "  chat_service.py: $count AUTO_INCREMENT"
fi

# 5. 모든 서비스 파일에서 AUTOINCREMENT 일괄 교체
echo ""
echo "=== 전체 AUTOINCREMENT 패치 ==="
find /opt/blossom/lumina/web/app -name '*.py' -exec grep -l 'AUTOINCREMENT' {} \; 2>/dev/null | while read f; do
    sed -i 's/AUTOINCREMENT/AUTO_INCREMENT/g' "$f"
    echo "  patched: $f"
done || echo "  (추가 패치 없음)"

# 6. IF NOT EXISTS 대신 MariaDB 호환 체크 — 이건 이미 지원됨

# 7. 소유권 재설정
chown -R lumina:lumina /opt/blossom/lumina/web/

echo ""
echo "=== Flask 앱 import 테스트 ==="
export FLASK_ENV=production
export SECRET_KEY=${SECRET_KEY:?"ERROR: SECRET_KEY env var is required"}
export DATABASE_URL="mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4"
export MYSQL_HOST=127.0.0.1
export MYSQL_PORT=3306
export MYSQL_USER=lumina_admin
export MYSQL_PASSWORD=LuminaAdmin2026Secure
export MYSQL_DB=lumina
export UPLOAD_FOLDER=/var/lib/blossom/lumina/web/uploads
export PYTHONPATH=/opt/blossom/lumina/web

python3.9 << 'PYTEST'
import sys, os
sys.path.insert(0, '/opt/blossom/lumina/web')
try:
    from app import create_app
    app = create_app()
    with app.app_context():
        from app.models import db
        from sqlalchemy import inspect
        tables = inspect(db.engine).get_table_names()
        print(f"Flask OK: {len(app.url_map._rules)} routes, {len(tables)} DB tables")
except Exception as e:
    import traceback
    print(f"FAILED: {e}")
    traceback.print_exc()
PYTEST

echo ""
echo "=== 서비스 재시작 ==="
mkdir -p /run/blossom/lumina
chown lumina:lumina /run/blossom/lumina
systemctl reset-failed lumina-web 2>/dev/null || true
systemctl restart lumina-web
sleep 5

echo ""
systemctl status lumina-web --no-pager 2>&1 | head -12
echo ""
echo -n "GET / → HTTP "
curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/ 2>&1
echo ""
echo -n "NGINX → HTTP "
curl -sk --max-time 5 -o /dev/null -w "%{http_code}" https://127.0.0.1/ 2>&1
echo ""
echo ""
echo "HTML (first 5 lines):"
curl -s --max-time 5 http://127.0.0.1:8000/ 2>&1 | head -5

echo ""
tail -15 /var/log/blossom/lumina/web/error.log 2>/dev/null

echo ""
echo "완료"
