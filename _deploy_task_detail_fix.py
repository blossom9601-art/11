"""pages.py 배포 (작업보고서 SPA 셸 우회 수정)"""
import paramiko, os

LOCAL = r'C:\Users\ME\Desktop\blossom\app\routes\pages.py'
REMOTE = '/opt/blossom/web/app/routes/pages.py'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')
sftp = ssh.open_sftp()

print(f'배포: {LOCAL} → {REMOTE}')
sftp.put(LOCAL, REMOTE)

# 검증
stat = sftp.stat(REMOTE)
local_size = os.path.getsize(LOCAL)
print(f'로컬: {local_size}, 원격: {stat.st_size}')
assert stat.st_size == local_size, 'SIZE MISMATCH!'
print('크기 일치 ✓')

sftp.close()

# blossom-web 재시작
print('blossom-web 재시작...')
_, o, e = ssh.exec_command('systemctl restart blossom-web && sleep 2 && systemctl is-active blossom-web')
status = o.read().decode().strip()
err = e.read().decode().strip()
print(f'상태: {status}')
if err:
    print(f'에러: {err}')

# 접근 테스트 (쿠키 없이 302가 정상)
_, o, _ = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8001/p/2.task_detail.html')
code = o.read().decode().strip()
print(f'GET /p/2.task_detail.html → {code} (302=로그인 필요, 200=인증됨)')

ssh.close()
print('완료!')
