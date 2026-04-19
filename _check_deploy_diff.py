import paramiko, os, hashlib

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

LOCAL_BASE = r'C:\Users\ME\Desktop\blossom'
REMOTE_BASE = '/opt/blossom/web'

# 핵심 파일 비교 목록
files = [
    # 브랜드관리
    'static/js/authentication/11-3.admin/11-3-3.setting/10.brand.js',
    'static/css/brand_admin.css',
    'app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html',
    'app/services/brand_setting_service.py',
    # 파일관리 (추정 경로)
    'app/routes/api.py',
    'app/routes/auth.py',
    'app/__init__.py',
]

# 파일관리 관련 파일 찾기
print('=== 로컬 파일관리 관련 파일 검색 ===')
for root, dirs, fnames in os.walk(LOCAL_BASE):
    for fn in fnames:
        if 'file' in fn.lower() and ('manage' in fn.lower() or 'mgmt' in fn.lower()):
            rel = os.path.relpath(os.path.join(root, fn), LOCAL_BASE).replace('\\', '/')
            print(f'  LOCAL: {rel}')
            files.append(rel)

# 로컬 vs 원격 크기/해시 비교
print('\n=== 로컬 vs 원격 파일 비교 ===')
print(f'{"파일":<80} {"로컬크기":>8} {"원격크기":>8} {"일치":>4}')
print('-' * 110)

for f in files:
    local_path = os.path.join(LOCAL_BASE, f.replace('/', os.sep))
    remote_path = f'{REMOTE_BASE}/{f}'
    
    # 로컬 크기
    if os.path.exists(local_path):
        local_size = os.path.getsize(local_path)
    else:
        local_size = -1
    
    # 원격 크기
    _, o, _ = ssh.exec_command(f'wc -c < {remote_path} 2>/dev/null || echo -1')
    remote_size = int(o.read().decode().strip())
    
    match = 'OK' if local_size == remote_size else 'DIFF'
    if remote_size == -1:
        match = 'MISS'
    
    print(f'{f:<80} {local_size:>8} {remote_size:>8} {match:>4}')

# 파일관리 관련 원격 파일 검색
print('\n=== 원격서버 파일관리 관련 파일 검색 ===')
_, o, _ = ssh.exec_command('find /opt/blossom/web -name "*file*manage*" -o -name "*file*mgmt*" -o -name "*file_manage*" 2>/dev/null')
print(o.read().decode())

_, o, _ = ssh.exec_command('find /opt/blossom/web/app/templates -name "*file*" 2>/dev/null')
print('Templates with "file":')
print(o.read().decode())

_, o, _ = ssh.exec_command('find /opt/blossom/web/static/js -name "*file*" 2>/dev/null')
print('JS with "file":')
print(o.read().decode())

# auth.py에서 file 관련 라우트 확인
_, o, _ = ssh.exec_command('grep -n "file" /opt/blossom/web/app/routes/auth.py | head -20')
print('auth.py file routes:')
print(o.read().decode())

# api.py에서 file-management 관련 라우트
_, o, _ = ssh.exec_command('grep -n "file.manag" /opt/blossom/web/app/routes/api.py | head -10')
print('api.py file-management routes:')
print(o.read().decode())

# 원격 api.py 크기 vs 로컬
_, o, _ = ssh.exec_command('wc -l /opt/blossom/web/app/routes/api.py')
print('\n원격 api.py 줄 수:', o.read().decode().strip())
local_api = os.path.join(LOCAL_BASE, 'app', 'routes', 'api.py')
with open(local_api, encoding='utf-8') as f:
    local_lines = len(f.readlines())
print('로컬 api.py 줄 수:', local_lines)

# 원격 auth.py 크기 vs 로컬
_, o, _ = ssh.exec_command('wc -l /opt/blossom/web/app/routes/auth.py')
print('원격 auth.py 줄 수:', o.read().decode().strip())
local_auth = os.path.join(LOCAL_BASE, 'app', 'routes', 'auth.py')
with open(local_auth, encoding='utf-8') as f:
    local_auth_lines = len(f.readlines())
print('로컬 auth.py 줄 수:', local_auth_lines)

# __init__.py 비교
_, o, _ = ssh.exec_command('wc -l /opt/blossom/web/app/__init__.py')
print('원격 __init__.py 줄 수:', o.read().decode().strip())
local_init = os.path.join(LOCAL_BASE, 'app', '__init__.py')
with open(local_init, encoding='utf-8') as f:
    local_init_lines = len(f.readlines())
print('로컬 __init__.py 줄 수:', local_init_lines)

ssh.close()
