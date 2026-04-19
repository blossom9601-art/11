import os
import posixpath
import paramiko

HOST = '192.168.56.108'
DB_HOST = '192.168.56.107'
USER = 'root'
PASS = '123456'
REMOTE_BASE = '/opt/blossom/web'
LOCAL_BASE = os.path.dirname(os.path.abspath(__file__))

FILES = [
    ('app/routes/auth.py', 'app/routes/auth.py'),
    ('app/services/brand_setting_service.py', 'app/services/brand_setting_service.py'),
    ('app/templates/authentication/11-2.basic/sign-in.html', 'app/templates/authentication/11-2.basic/sign-in.html'),
    ('app/templates/authentication/11-2.basic/terms.html', 'app/templates/authentication/11-2.basic/terms.html'),
    ('app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html', 'app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html'),
    ('static/js/authentication/11-3.admin/11-3-3.setting/10.brand.js', 'static/js/authentication/11-3.admin/11-3-3.setting/10.brand.js'),
    ('static/css/brand_admin.css', 'static/css/brand_admin.css'),
]

REMOTE_SQLITE_FIX = r'''cd /opt/blossom/web && /opt/blossom/web/venv/bin/python - <<'PY'
import os
import sqlite3
from datetime import datetime

candidates = [
    '/opt/blossom/web/instance/dev_blossom.db',
    '/opt/blossom/web/dev_blossom.db',
]
now = datetime.utcnow().isoformat()
updated = []
for path in candidates:
    if not os.path.exists(path):
        continue
    conn = sqlite3.connect(path)
    try:
        row = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='brand_setting'").fetchone()
        if not row:
            continue
        conn.execute(
            """
            INSERT INTO brand_setting (category, `key`, value, value_type, is_deleted)
            SELECT 'login', 'login.backgroundImage', '/static/image/login/bada.png', 'image', 0
            WHERE NOT EXISTS (
                SELECT 1 FROM brand_setting WHERE `key`='login.backgroundImage'
            )
            """
        )
        conn.execute(
            """
            UPDATE brand_setting
               SET category='login', value='/static/image/login/bada.png', value_type='image', is_deleted=0, updated_at=?
             WHERE `key`='login.backgroundImage'
            """,
            (now,)
        )
        conn.commit()
        row = conn.execute(
            "SELECT category, value, is_deleted FROM brand_setting WHERE `key`='login.backgroundImage'"
        ).fetchone()
        updated.append((path, row))
    finally:
        conn.close()
print(updated)
PY'''

REMOTE_VERIFY = r'''cd /opt/blossom/web && /opt/blossom/web/venv/bin/python - <<'PY'
from datetime import datetime
from app import create_app
from app.models import db

app = create_app()
with app.test_client() as client:
    login_resp = client.get('/login')
    login_html = login_resp.get_data(as_text=True)

    with client.session_transaction() as sess:
        sess['user_id'] = 1
        sess['emp_no'] = 'ADMIN'
        sess['role'] = 'ADMIN'
        sess['_login_at'] = datetime.utcnow().isoformat()
        sess['_last_active'] = datetime.utcnow().isoformat()
    brand_resp = client.get('/admin/auth/brand', headers={'X-Requested-With': 'XMLHttpRequest'})
    brand_html = brand_resp.get_data(as_text=True)

with app.app_context():
    row = db.session.execute(
        db.text("SELECT category, value, is_deleted FROM brand_setting WHERE `key`='login.backgroundImage'")
    ).fetchone()

print({
    'login_status': login_resp.status_code,
    'login_has_style': "style=\"background-image: url('/static/image/login/bada.png');\"" in login_html,
    'brand_status': brand_resp.status_code,
    'brand_has_login_section': 'login-bg-upload' in brand_html and '로그인 배경 이미지' in brand_html,
    'db_row': tuple(row) if row else None,
})
PY'''

MYSQL_FIX = r'''mysql -u root lumina -e "
CREATE TABLE IF NOT EXISTS brand_setting (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(64) NOT NULL,
    `key` VARCHAR(128) NOT NULL UNIQUE,
    value TEXT,
    value_type VARCHAR(20) NOT NULL DEFAULT 'text',
    updated_by VARCHAR(64),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL,
    is_deleted INT NOT NULL DEFAULT 0,
    INDEX ix_brand_setting_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO brand_setting (category, `key`, value, value_type, is_deleted)
SELECT 'login', 'login.backgroundImage', '/static/image/login/bada.png', 'image', 0
FROM DUAL WHERE NOT EXISTS (
    SELECT 1 FROM brand_setting WHERE `key`='login.backgroundImage'
);
UPDATE brand_setting
   SET category='login', value='/static/image/login/bada.png', value_type='image', is_deleted=0
 WHERE `key`='login.backgroundImage';
SELECT category, `key`, value, is_deleted FROM brand_setting WHERE `key`='login.backgroundImage';
"'''


def connect(host):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=USER, password=PASS, timeout=20)
    return ssh


def run(ssh, command, label):
    stdin, stdout, stderr = ssh.exec_command(command, timeout=120)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    print(f'[{label}]')
    if out:
        print(out)
    if err:
        print(err)


def deploy_files(ssh):
    sftp = ssh.open_sftp()
    try:
        for local_rel, remote_rel in FILES:
            local_path = os.path.join(LOCAL_BASE, local_rel)
            remote_path = posixpath.join(REMOTE_BASE, remote_rel.replace('\\', '/'))
            ssh.exec_command(f"mkdir -p '{posixpath.dirname(remote_path)}'")
            sftp.put(local_path, remote_path)
            print(f'[PUT] {local_rel}')
    finally:
        sftp.close()


def main():
    app_ssh = connect(HOST)
    try:
        deploy_files(app_ssh)
        run(app_ssh, REMOTE_SQLITE_FIX, 'REMOTE SQLITE FIX')
        run(app_ssh, 'rm -rf /var/cache/nginx/blossom_proxy/* 2>/dev/null', 'NGINX CACHE CLEAR')
        run(app_ssh, 'systemctl restart blossom-web', 'RESTART BLOSSOM')
        run(app_ssh, 'systemctl reload nginx', 'RELOAD NGINX')
        run(app_ssh, 'systemctl is-active blossom-web', 'BLOSSOM STATUS')
        run(app_ssh, "grep -n 'def admin_file_management_settings' /opt/blossom/web/app/routes/auth.py", 'VERIFY AUTH ROUTE')
        run(app_ssh, "grep -n 'login_background_image' /opt/blossom/web/app/templates/authentication/11-2.basic/sign-in.html", 'VERIFY LOGIN TEMPLATE')
        run(app_ssh, "grep -n 'login-bg-upload\|로그인 배경 이미지' /opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html", 'VERIFY BRAND TEMPLATE')
        run(app_ssh, REMOTE_VERIFY, 'REMOTE APP VERIFY')
    finally:
        app_ssh.close()

    db_ssh = connect(DB_HOST)
    try:
        run(db_ssh, MYSQL_FIX, 'MYSQL FIX')
    finally:
        db_ssh.close()


if __name__ == '__main__':
    main()
