"""수정된 설정 HTML 12개 + api.py/auth.py 원격 배포"""
import paramiko, os

LOCAL_BASE = r'C:\Users\ME\Desktop\blossom'
REMOTE_BASE = '/opt/blossom/web'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')
sftp = ssh.open_sftp()

deploy_files = [
    # 탭 추가된 설정 HTML
    'app/templates/authentication/11-3.admin/11-3-3.setting/1.setting.html',
    'app/templates/authentication/11-3.admin/11-3-3.setting/2.mail.html',
    'app/templates/authentication/11-3.admin/11-3-3.setting/3.security.html',
    'app/templates/authentication/11-3.admin/11-3-3.setting/4.quality_type.html',
    'app/templates/authentication/11-3.admin/11-3-3.setting/5.change_log.html',
    'app/templates/authentication/11-3.admin/11-3-3.setting/6.info_message.html',
    'app/templates/authentication/11-3.admin/11-3-3.setting/7.version.html',
    'app/templates/authentication/11-3.admin/11-3-3.setting/8.sessions.html',
    'app/templates/authentication/11-3.admin/11-3-3.setting/9.page_tab.html',
    'app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html',
    'app/templates/authentication/11-3.admin/11-3-2.role/1.role_list.html',
    'app/templates/authentication/11-3.admin/11-3-1.user/1.user_list.html',
    # 파일관리 관련 (이미 있지만 최신 확인)
    'app/templates/authentication/11-3.admin/11-3-3.setting/11.file_management.html',
    'static/css/file_management_settings.css',
    'static/js/authentication/11-3.admin/11-3-3.setting/11.file_management.js',
    # API (이미 배포했지만 재확인)
    'app/routes/api.py',
    'app/routes/auth.py',
]

ok = 0
fail = 0
for f in deploy_files:
    local = os.path.join(LOCAL_BASE, f.replace('/', os.sep))
    remote = f'{REMOTE_BASE}/{f}'
    
    if not os.path.exists(local):
        print(f'[MISS] {f}')
        fail += 1
        continue
    
    # 백업
    try:
        ssh.exec_command(f'cp {remote} {remote}.bak.0419b')
    except:
        pass
    
    sftp.put(local, remote)
    
    local_size = os.path.getsize(local)
    remote_stat = sftp.stat(remote)
    match = local_size == remote_stat.st_size
    status = 'OK' if match else 'FAIL'
    if match:
        ok += 1
    else:
        fail += 1
    print(f'[{status}] {f} ({local_size} → {remote_stat.st_size})')

sftp.close()

print(f'\n배포 결과: {ok}개 성공, {fail}개 실패')

# blossom-web 재시작
print('\n서비스 재시작...')
_, o, e = ssh.exec_command('systemctl restart blossom-web.service')
e.read()

import time
time.sleep(3)

_, o, _ = ssh.exec_command('systemctl is-active blossom-web.service')
status = o.read().decode().strip()
print(f'blossom-web: {status}')

# 검증: 파일관리 탭이 brand.html에 존재하는지
_, o, _ = ssh.exec_command("grep 'file_management' /opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html")
r = o.read().decode().strip()
print(f'\nbrand.html 파일관리탭: {"있음" if r else "없음"}')

# 검증: user_list.html에도 존재하는지
_, o, _ = ssh.exec_command("grep 'file_management' /opt/blossom/web/app/templates/authentication/11-3.admin/11-3-1.user/1.user_list.html")
r2 = o.read().decode().strip()
print(f'user_list.html 파일관리탭: {"있음" if r2 else "없음"}')

ssh.close()
print('\n배포 완료.')
