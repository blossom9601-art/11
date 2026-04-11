#!/bin/bash
set -e
export PYTHONPATH=/opt/blossom/lumina/web
export FLASK_ENV=production
export SECRET_KEY=${SECRET_KEY:?"ERROR: SECRET_KEY env var is required"}
export DATABASE_URL="mysql+pymysql://lumina_admin:LuminaAdmin2026Secure@127.0.0.1:3306/lumina?charset=utf8mb4"
export UPLOAD_FOLDER=/var/lib/blossom/lumina/web/uploads

python3.9 << 'PYFIX'
import sys, os
sys.path.insert(0, '/opt/blossom/lumina/web')
from app.models import db
from flask import Flask
from sqlalchemy import text

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ['DATABASE_URL']
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

with app.app_context():
    row = db.session.execute(text(
        "SELECT id, emp_no, allowed_ip FROM org_user WHERE emp_no='admin'"
    )).fetchone()
    if row:
        print(f"  org_user admin: id={row[0]}, allowed_ip='{row[2]}'")
        db.session.execute(text(
            "UPDATE org_user SET allowed_ip='*' WHERE emp_no='admin'"
        ))
        db.session.commit()
        print("  -> allowed_ip = '*' (all IPs allowed)")
    else:
        print("  admin not found!")
PYFIX
echo "DONE"
