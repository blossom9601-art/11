import paramiko, os

LOCAL_BASE = r'C:\Users\ME\Desktop\blossom'
REMOTE_BASE = '/opt/blossom/web'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')
sftp = ssh.open_sftp()

# 배포할 파일 (DIFF가 난 api.py + auth.py도 1줄 차이)
deploy_files = [
    'app/routes/api.py',
    'app/routes/auth.py',
]

for f in deploy_files:
    local = os.path.join(LOCAL_BASE, f.replace('/', os.sep))
    remote = f'{REMOTE_BASE}/{f}'
    
    # 백업
    try:
        ssh.exec_command(f'cp {remote} {remote}.bak.0419')
    except:
        pass
    
    # 업로드
    sftp.put(local, remote)
    
    # 검증
    local_size = os.path.getsize(local)
    remote_stat = sftp.stat(remote)
    match = 'OK' if local_size == remote_stat.st_size else 'FAIL'
    print(f'[{match}] {f}: local={local_size}, remote={remote_stat.st_size}')

sftp.close()

# blossom-web 서비스 재시작
print('\n서비스 재시작 중...')
_, o, e = ssh.exec_command('systemctl restart blossom-web.service')
e.read()

# 상태 확인
_, o, _ = ssh.exec_command('systemctl is-active blossom-web.service')
status = o.read().decode().strip()
print(f'blossom-web: {status}')

# 배포 검증 - api.py 줄 수
_, o, _ = ssh.exec_command(f'wc -l {REMOTE_BASE}/app/routes/api.py')
print(f'원격 api.py: {o.read().decode().strip()}')

_, o, _ = ssh.exec_command(f'wc -l {REMOTE_BASE}/app/routes/auth.py')
print(f'원격 auth.py: {o.read().decode().strip()}')

# 브랜드/파일관리 API 라우트 존재 확인
_, o, _ = ssh.exec_command(f'grep -c "brand.setting" {REMOTE_BASE}/app/routes/api.py')
print(f'brand-settings 라우트 수: {o.read().decode().strip()}')

_, o, _ = ssh.exec_command(f'grep -c "file.manag" {REMOTE_BASE}/app/routes/api.py')
print(f'file-management 라우트 수: {o.read().decode().strip()}')

# 8001 포트 응답 확인
import time
time.sleep(3)
_, o, _ = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8001/api/brand-settings')
print(f'\nBlossom brand API: {o.read().decode()}')

ssh.close()
print('\n배포 완료.')
