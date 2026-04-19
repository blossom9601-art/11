# -*- coding: utf-8 -*-
"""배포: 브랜드관리 '기본값 복원' 섹션 제거 + 로그인 배경 브랜드 설정 원복."""
import os, paramiko

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
REMOTE = '/opt/blossom/web'
LOCAL = os.path.dirname(os.path.abspath(__file__))

FILES = [
    ('app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html',
     'app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html'),
    ('static/js/authentication/11-3.admin/11-3-3.setting/10.brand.js',
     'static/js/authentication/11-3.admin/11-3-3.setting/10.brand.js'),
    ('static/css/brand_admin.css',
     'static/css/brand_admin.css'),
    ('static/spa/pages/admin/AdminBrandPage.js',
     'static/spa/pages/admin/AdminBrandPage.js'),
]

# 원격 DB에서 login.backgroundImage 설정 삭제 (soft delete)
RESET_SQL = (
    "UPDATE brand_setting SET is_deleted=1 "
    "WHERE `key`='login.backgroundImage' AND is_deleted=0;"
)

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)
    sftp = ssh.open_sftp()

    # 1) 파일 배포
    for local_rel, remote_rel in FILES:
        local_path = os.path.join(LOCAL, local_rel)
        remote_path = f'{REMOTE}/{remote_rel}'
        try:
            sftp.put(local_path, remote_path)
            print(f'  OK  {remote_rel}')
        except Exception as e:
            print(f'  FAIL {remote_rel}: {e}')

    sftp.close()

    # 2) 원격 DB: login.backgroundImage 소프트 삭제
    print('\n--- DB: login.backgroundImage soft-delete ---')
    cmd_sql = f"cd {REMOTE} && python3 -c \"\nimport sqlite3, glob\nfor p in glob.glob('instance/*.db'):\n    try:\n        c = sqlite3.connect(p)\n        cur = c.execute(\\\"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='brand_setting'\\\")\n        if cur.fetchone()[0]:\n            c.execute(\\\"UPDATE brand_setting SET is_deleted=1 WHERE key='login.backgroundImage' AND is_deleted=0\\\")\n            if c.total_changes:\n                c.commit()\n                print(f'  Deleted login.backgroundImage in {{p}}')\n        c.close()\n    except: pass\n\""
    stdin, stdout, stderr = ssh.exec_command(cmd_sql)
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err:
        print('  WARN:', err)

    # MySQL에서도 실행
    print('--- MySQL: login.backgroundImage soft-delete ---')
    mysql_cmd = (
        "mysql -u root -p'123456' blossom -e "
        "\"UPDATE brand_setting SET is_deleted=1 WHERE `key`='login.backgroundImage' AND is_deleted=0;\" 2>/dev/null"
    )
    stdin, stdout, stderr = ssh.exec_command(mysql_cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out:
        print(out)
    print('  MySQL done')

    # 3) nginx 캐시 삭제 + 서비스 재시작
    print('\n--- Restart ---')
    for cmd in [
        'rm -rf /var/cache/nginx/blossom_proxy/*',
        'systemctl restart blossom-web',
    ]:
        stdin, stdout, stderr = ssh.exec_command(cmd)
        out = stdout.read().decode()
        err = stderr.read().decode()
        print(f'  {cmd}: {out or "ok"}')
        if err:
            print(f'    stderr: {err}')

    ssh.close()
    print('\nDone.')


if __name__ == '__main__':
    main()
