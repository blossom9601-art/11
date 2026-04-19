"""작업보고서 관련 파일 로컬 vs 원격 비교"""
import paramiko, os

LOCAL_BASE = r'C:\Users\ME\Desktop\blossom'
REMOTE_BASE = '/opt/blossom/web'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# 비교할 파일 목록
files = [
    'app/templates/8.project/8-2.task/8-2-3.task_list/2.task_detail.html',
    'app/templates/8.project/8-2.task/8-2-1.my_task/1.my_task.html',
    'app/templates/8.project/8-2.task/8-2-2.participating_task/1.participating_task.html',
    'app/templates/8.project/8-2.task/8-2-4.task_overview/1.task_overview.html',
    'app/templates/8.project/8-2.task/8-2-3.task_list/1.task_list.html',
    'static/js/8.project/8-2.task/8-2-1.my_task/1.my_task.js',
    'static/js/8.project/8-2.task/8-2-2.participating_task/1.participating_task.js',
    'static/js/8.project/8-2.task/8-2-3.task_list/1.task_list.js',
    'static/js/8.project/8-2.task/8-2-3.task_list/2.task_detail.js',
    'static/js/8.project/8-2.task/8-2-4.task_overview/1.task_overview.js',
    'static/js/8.project/8-2.task/common/status_list.js',
    'static/css/task.css',
    'static/css/work.css',
]

print(f'{"파일":<80} {"로컬":>8} {"원격":>8} {"상태":>6}')
print('-' * 106)

diff_list = []
for f in files:
    lp = os.path.join(LOCAL_BASE, f.replace('/', os.sep))
    rp = REMOTE_BASE + '/' + f
    ls = os.path.getsize(lp) if os.path.exists(lp) else -1
    _, o, _ = ssh.exec_command('wc -c ' + rp)
    rs_raw = o.read().decode().strip()
    rs = int(rs_raw.split()[0]) if rs_raw and rs_raw.split()[0].isdigit() else -1
    status = 'OK' if ls == rs else ('MISS' if rs == -1 else 'DIFF')
    print(f'{f:<80} {ls:>8} {rs:>8} {status:>6}')
    if status != 'OK':
        diff_list.append(f)

# pages.py 매핑 확인
_, o, _ = ssh.exec_command('grep -n "task_detail" ' + REMOTE_BASE + '/app/routes/pages.py')
print('\n=== pages.py task_detail 매핑 ===')
print(o.read().decode())

# 원격 task_overview JS 폴더 확인
_, o, _ = ssh.exec_command('ls -la ' + REMOTE_BASE + '/static/js/8.project/8-2.task/8-2-4.task_overview/')
print('=== task_overview JS 폴더 ===')
print(o.read().decode())

# HTTP 접근 테스트
_, o, _ = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8001/p/2.task_detail.html')
code = o.read().decode().strip()
print(f'GET /p/2.task_detail.html → {code}')

# 만약 302면 리다이렉트 위치 확인
if code == '302':
    _, o, _ = ssh.exec_command('curl -s -D - -o /dev/null http://127.0.0.1:8001/p/2.task_detail.html | head -10')
    print(o.read().decode())

ssh.close()

if diff_list:
    print(f'\n차이 나는 파일 {len(diff_list)}개:')
    for f in diff_list:
        print(f'  {f}')
else:
    print('\n모든 파일 일치!')
