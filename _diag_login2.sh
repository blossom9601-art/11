#!/bin/bash
echo "=== 1. Full journalctl for login errors ==="
journalctl -u lumina-web --no-pager -n 200 2>/dev/null | grep -A5 "Traceback\|Error\|Exception\|500\|strftime" | tail -80

echo ""
echo "=== 2. Test wrong password via browser-like POST ==="
curl -sv --max-time 10 \
  -X POST http://127.0.0.1:8000/login \
  -d "emp_no=admin&password=wrongpass" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  2>&1 | tail -30

echo ""
echo "=== 3. auth_login_history table schema ==="
export PYTHONPATH=/opt/blossom/lumina/web
export FLASK_ENV=production
export SECRET_KEY=${SECRET_KEY:?"ERROR: SECRET_KEY env var is required"}
export DATABASE_URL="mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4"

python3.9 << 'PY'
import sys, os
sys.path.insert(0, '/opt/blossom/lumina/web')
from app.models import db
from flask import Flask
from sqlalchemy import text, inspect

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ['DATABASE_URL']
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

with app.app_context():
    insp = inspect(db.engine)
    for tbl in ['auth_login_history', 'auth_users', 'org_user', 'users']:
        if insp.has_table(tbl):
            cols = [c['name'] for c in insp.get_columns(tbl)]
            print(f"  {tbl}: {cols}")
        else:
            print(f"  {tbl}: NOT FOUND")
PY

echo ""
echo "=== 4. Simulate login flow manually ==="
python3.9 << 'PYLOGIN'
import sys, os
sys.path.insert(0, '/opt/blossom/lumina/web')
os.environ.setdefault('FLASK_ENV', 'production')
os.environ.setdefault('SECRET_KEY', os.environ['SECRET_KEY'])
os.environ.setdefault('DATABASE_URL', 'mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4')
os.environ.setdefault('UPLOAD_FOLDER', '/var/lib/blossom/lumina/web/uploads')

try:
    from app import create_app
    app = create_app()
    with app.test_client() as client:
        # Test wrong password
        resp = client.post('/login', data={'emp_no': 'admin', 'password': 'wrongpass'})
        print(f"  Wrong password: HTTP {resp.status_code}")
        if resp.status_code >= 500:
            print(f"  Response: {resp.data[:500].decode('utf-8', errors='replace')}")

        # Test correct password
        resp2 = client.post('/login', data={'emp_no': 'admin', 'password': 'admin1234!'})
        print(f"  Correct password: HTTP {resp2.status_code}")
        if resp2.status_code == 302:
            print(f"  Redirect to: {resp2.headers.get('Location')}")
        elif resp2.status_code >= 400:
            print(f"  Response: {resp2.data[:500].decode('utf-8', errors='replace')}")
except Exception as e:
    print(f"  ERROR: {e}")
    import traceback
    traceback.print_exc()
PYLOGIN
