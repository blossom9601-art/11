# -*- coding: utf-8 -*-
"""배포: 브랜드관리 - 로그인 배경 이미지 기능 추가 + 기본값 복원 제거."""
import os, paramiko

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
REMOTE = '/opt/blossom/web'

LOCAL = os.path.dirname(os.path.abspath(__file__))

FILES = [
    # (로컬 상대경로, 리모트 상대경로)
    ('app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html',
     'app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html'),
    ('app/templates/authentication/11-2.basic/sign-in.html',
     'app/templates/authentication/11-2.basic/sign-in.html'),
    ('app/templates/authentication/11-2.basic/terms.html',
     'app/templates/authentication/11-2.basic/terms.html'),
    ('static/js/authentication/11-3.admin/11-3-3.setting/10.brand.js',
     'static/js/authentication/11-3.admin/11-3-3.setting/10.brand.js'),
    ('static/css/brand_admin.css',
     'static/css/brand_admin.css'),
    ('app/services/brand_setting_service.py',
     'app/services/brand_setting_service.py'),
]

SEED_SQL = (
    "INSERT INTO brand_setting (category, `key`, value, value_type) "
    "SELECT 'login', 'login.backgroundImage', '/static/image/login/bada.png', 'image' "
    "FROM DUAL WHERE NOT EXISTS "
    "(SELECT 1 FROM brand_setting WHERE `key`='login.backgroundImage');"
)

# MySQL 접속 정보 (ttt1)
DB_HOST = '192.168.56.107'

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)
    sftp = ssh.open_sftp()

    # 1) 파일 배포
    for local_rel, remote_rel in FILES:
        local_path = os.path.join(LOCAL, local_rel)
        remote_path = REMOTE + '/' + remote_rel
        print(f'  PUT {local_rel}')
        sftp.put(local_path, remote_path)

    sftp.close()
    print('[1/3] 파일 전송 완료')

    # 2) DB 시드 (MySQL on ttt1) — 테이블 생성 + 시드
    db_ssh = paramiko.SSHClient()
    db_ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    db_ssh.connect(DB_HOST, username=USER, password=PASS)

    sql_content = r"""
CREATE TABLE IF NOT EXISTS brand_setting (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    category    VARCHAR(64)  NOT NULL,
    `key`       VARCHAR(128) NOT NULL UNIQUE,
    value       TEXT,
    value_type  VARCHAR(20)  NOT NULL DEFAULT 'text',
    updated_by  VARCHAR(64),
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NULL,
    is_deleted  INT          NOT NULL DEFAULT 0,
    INDEX ix_brand_setting_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO brand_setting (category, `key`, value, value_type)
SELECT 'header', 'brand.headerIcon', '/static/image/logo/blossom_logo.png', 'image'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM brand_setting WHERE `key`='brand.headerIcon');

INSERT INTO brand_setting (category, `key`, value, value_type)
SELECT 'header', 'brand.name', 'blossom', 'text'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM brand_setting WHERE `key`='brand.name');

INSERT INTO brand_setting (category, `key`, value, value_type)
SELECT 'header', 'brand.subtitle', '', 'text'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM brand_setting WHERE `key`='brand.subtitle');

INSERT INTO brand_setting (category, `key`, value, value_type)
SELECT 'dashboard', 'dashboard.cardLogos.maintenance_cost_card', '/static/image/logo/bccard_logo.jpg', 'image'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM brand_setting WHERE `key`='dashboard.cardLogos.maintenance_cost_card');

INSERT INTO brand_setting (category, `key`, value, value_type)
SELECT 'login', 'login.backgroundImage', '/static/image/login/bada.png', 'image'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM brand_setting WHERE `key`='login.backgroundImage');
"""
    # sftp로 SQL 파일 작성
    db_sftp = db_ssh.open_sftp()
    with db_sftp.open('/tmp/_seed_brand.sql', 'w') as f:
        f.write(sql_content)
    db_sftp.close()

    cmd = 'mysql -u root lumina < /tmp/_seed_brand.sql'
    _, stdout, stderr = db_ssh.exec_command(cmd)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    db_ssh.exec_command('rm -f /tmp/_seed_brand.sql')
    if 'ERROR' in err:
        print(f'[2/3] DB 시드 오류: {err}')
    else:
        print('[2/3] DB 테이블 생성 + 시드 완료')
    db_ssh.close()

    # 3) 서비스 재시작
    ssh2 = paramiko.SSHClient()
    ssh2.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh2.connect(HOST, username=USER, password=PASS)
    ssh2.exec_command('systemctl restart blossom-web')
    import time; time.sleep(3)
    _, stdout, _ = ssh2.exec_command('systemctl is-active blossom-web')
    status = stdout.read().decode().strip()
    print(f'[3/3] blossom-web: {status}')
    ssh2.close()

    print('배포 완료!')

if __name__ == '__main__':
    main()
