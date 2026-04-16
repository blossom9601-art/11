import os
import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
LOCAL = r'c:\\Users\\ME\\Desktop\\blossom\\app\\services\\page_tab_config_service.py'
REMOTE = '/opt/blossom/web/app/services/page_tab_config_service.py'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=10)

sftp = ssh.open_sftp()
sftp.put(LOCAL, REMOTE)
sftp.close()

db_normalize_cmd = r'''cd /opt/blossom/web; /opt/blossom/web/venv/bin/python - <<'PY'
from run import app
from app.models import db, PageTabConfig

KEEP = {
    'GOV_VPN_POLICY': ('VPN1', 'VPN', 'gov_vpn_policy'),
    'GOV_DEDICATED_LINE_POLICY': ('MEMBER', '전용회선', 'gov_dedicatedline_member'),
    'CATEGORY_CUSTOMER': ('CLIENT1', '고객', 'cat_customer_client1'),
    'DC_RACK': ('LIST', 'RACK1', 'dc_rack_list'),
    'DC_THERMOMETER': ('LIST', '온/습도계', 'dc_thermometer_list'),
    'DC_CCTV': ('LIST', 'CCTV1', 'dc_cctv_list'),
}

with app.app_context():
    for page_code, (keep_code, keep_name, route_key) in KEEP.items():
        row = PageTabConfig.query.filter(
            PageTabConfig.page_code == page_code,
            PageTabConfig.tab_code == keep_code
        ).first()

        if not row:
            row = PageTabConfig(
                page_code=page_code,
                tab_code=keep_code,
                tab_name=keep_name,
                tab_order=1,
                is_active=1,
                is_deleted=0,
                route_key=route_key,
            )
            db.session.add(row)
        else:
            row.tab_name = keep_name
            row.tab_order = 1
            row.is_active = 1
            row.is_deleted = 0
            if not row.route_key:
                row.route_key = route_key

        rows = PageTabConfig.query.filter(PageTabConfig.page_code == page_code).all()
        for r in rows:
            if r.tab_code != keep_code:
                r.is_deleted = 1

    db.session.commit()

    print('UPDATED_PAGES=', len(KEEP))
    for page_code, _meta in KEEP.items():
        alive = PageTabConfig.query.filter(
            PageTabConfig.page_code == page_code,
            PageTabConfig.is_deleted == 0
        ).order_by(PageTabConfig.tab_order.asc()).all()
        print(page_code, '=>', [(x.tab_code, x.tab_name) for x in alive])
PY'''

for cmd in [
    db_normalize_cmd,
    'systemctl restart blossom-web',
    'systemctl is-active blossom-web',
    "grep -c \"'page_code':\" /opt/blossom/web/app/services/page_tab_config_service.py",
    "grep -n \"tab_name': 'VPN'\" /opt/blossom/web/app/services/page_tab_config_service.py",
    "grep -n \"tab_name': '전용회선'\" /opt/blossom/web/app/services/page_tab_config_service.py",
    "grep -n \"tab_name': '고객'\" /opt/blossom/web/app/services/page_tab_config_service.py",
    "grep -n \"tab_name': 'RACK1'\" /opt/blossom/web/app/services/page_tab_config_service.py",
    "grep -n \"tab_name': '온/습도계'\" /opt/blossom/web/app/services/page_tab_config_service.py",
    "grep -n \"tab_name': 'CCTV1'\" /opt/blossom/web/app/services/page_tab_config_service.py"
]:
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=60)
    out = stdout.read().decode('utf-8', 'replace').strip()
    err = stderr.read().decode('utf-8', 'replace').strip()
    print('--- CMD ---')
    print(cmd)
    print('OUT:', out)
    print('ERR:', err)

ssh.close()
