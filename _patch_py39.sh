#!/bin/bash
# Fix Python 3.10+ type hints for Python 3.9 compatibility
set -euo pipefail

FILES=(
    "/opt/blossom/lumina/web/app/routes/pages.py"
    "/opt/blossom/lumina/web/app/services/hw_maintenance_contract_service.py"
    "/opt/blossom/lumina/web/app/services/server_software_service.py"
)

echo "=== Patching future annotations ==="
for f in "${FILES[@]}"; do
    if ! grep -q 'from __future__ import annotations' "$f"; then
        sed -i '1s/^/from __future__ import annotations\n/' "$f"
        echo "  patched: $f"
    else
        echo "  already ok: $f"
    fi
done

echo ""
echo "=== Testing Flask app import ==="
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

python3.9 << 'PYEOF'
import sys
sys.path.insert(0, '/opt/blossom/lumina/web')
try:
    from app import create_app
    app = create_app()
    rules = list(app.url_map.iter_rules())
    print(f"Flask app OK: {len(rules)} routes")
    for r in sorted(rules, key=lambda x: x.rule)[:15]:
        methods = ','.join(sorted(r.methods - {'HEAD', 'OPTIONS'}))
        print(f"  {r.rule}  [{methods}]")
    if len(rules) > 15:
        print(f"  ... (+{len(rules)-15} more)")
except Exception as e:
    import traceback
    print(f"FAILED: {e}")
    traceback.print_exc()
PYEOF

echo ""
echo "=== DB tables init ==="
python3.9 << 'PYEOF2'
import sys, os
sys.path.insert(0, '/opt/blossom/lumina/web')
os.environ['FLASK_ENV'] = 'production'
try:
    from app import create_app
    from app.models import db
    app = create_app()
    with app.app_context():
        db.create_all()
        from sqlalchemy import inspect
        tables = inspect(db.engine).get_table_names()
        print(f"DB tables: {len(tables)}")
except Exception as e:
    import traceback
    print(f"FAILED: {e}")
    traceback.print_exc()
PYEOF2

echo ""
echo "=== Restart lumina-web ==="
chown -R lumina:lumina /opt/blossom/lumina/web/
mkdir -p /run/blossom/lumina
chown lumina:lumina /run/blossom/lumina
systemctl reset-failed lumina-web 2>/dev/null || true
systemctl restart lumina-web
sleep 4

echo ""
echo "=== Service status ==="
systemctl status lumina-web --no-pager 2>&1 | head -12

echo ""
echo "=== Connection tests ==="
echo -n "  GET / → HTTP "
curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/
echo ""
echo -n "  NGINX https:// → HTTP "
curl -sk --max-time 5 -o /dev/null -w "%{http_code}" https://127.0.0.1/
echo ""

echo ""
echo "  Response body (first 10 lines):"
curl -s --max-time 5 http://127.0.0.1:8000/ 2>&1 | head -10

echo ""
echo "=== gunicorn error log (last 15) ==="
tail -15 /var/log/blossom/lumina/web/error.log 2>/dev/null || echo "(none)"

echo ""
echo "Done"
