"""로컬 vs 원격 전체 파일 크기 비교 - 모든 py/html/js/css 파일"""
import paramiko, os, stat

LOCAL_BASE = r'C:\Users\ME\Desktop\blossom'
REMOTE_BASE = '/opt/blossom/web'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

# 1) 원격 파일 목록 + 크기 수집
print('=== 원격 파일 목록 수집 중... ===')
cmd = f"find {REMOTE_BASE} -type f \\( -name '*.py' -o -name '*.html' -o -name '*.js' -o -name '*.css' \\) ! -path '*/\\.git/*' ! -path '*/__pycache__/*' ! -path '*.bak*' -printf '%s %P\\n'"
_, o, _ = ssh.exec_command(cmd)
remote_files = {}
for line in o.read().decode().strip().split('\n'):
    if not line.strip():
        continue
    parts = line.split(' ', 1)
    if len(parts) == 2:
        size, path = int(parts[0]), parts[1]
        remote_files[path] = size

print(f'원격 파일 수: {len(remote_files)}')

# 2) 로컬 파일 목록 + 크기 수집
print('로컬 파일 목록 수집 중...')
local_files = {}
skip_dirs = {'.git', '__pycache__', '.venv', 'node_modules', '.tox', 'venv'}
for root, dirs, files in os.walk(LOCAL_BASE):
    dirs[:] = [d for d in dirs if d not in skip_dirs]
    for f in files:
        if not f.endswith(('.py', '.html', '.js', '.css')):
            continue
        if '.bak' in f:
            continue
        fpath = os.path.join(root, f)
        rel = os.path.relpath(fpath, LOCAL_BASE).replace('\\', '/')
        local_files[rel] = os.path.getsize(fpath)

print(f'로컬 파일 수: {len(local_files)}')

# 3) 비교 - 앱 관련 파일만 (app/, static/, templates/)
app_prefixes = ('app/', 'static/', 'config.py', 'run.py')

diff_files = []
missing_remote = []
missing_local = []

for rel, local_size in sorted(local_files.items()):
    if not any(rel.startswith(p) for p in app_prefixes):
        continue
    if rel in remote_files:
        remote_size = remote_files[rel]
        if local_size != remote_size:
            diff_files.append((rel, local_size, remote_size))
    else:
        missing_remote.append((rel, local_size))

for rel, remote_size in sorted(remote_files.items()):
    if not any(rel.startswith(p) for p in app_prefixes):
        continue
    if rel not in local_files:
        missing_local.append((rel, remote_size))

# 4) 결과 출력
print(f'\n{"="*80}')
print(f'크기 다른 파일: {len(diff_files)}개')
print(f'원격에 없는 파일: {len(missing_remote)}개')
print(f'로컬에 없는 파일: {len(missing_local)}개')

if diff_files:
    print(f'\n{"="*80}')
    print('▼ 크기가 다른 파일 (로컬 ≠ 원격)')
    print(f'{"파일":<80} {"로컬":>8} {"원격":>8} {"차이":>8}')
    print('-'*106)
    for rel, ls, rs in sorted(diff_files, key=lambda x: abs(x[1]-x[2]), reverse=True):
        print(f'{rel:<80} {ls:>8} {rs:>8} {ls-rs:>+8}')

if missing_remote:
    print(f'\n{"="*80}')
    print('▼ 원격에 없는 파일 (로컬에만 존재)')
    for rel, ls in sorted(missing_remote):
        print(f'  {rel} ({ls} bytes)')

if missing_local:
    print(f'\n{"="*80}')
    print('▼ 로컬에 없는 파일 (원격에만 존재)')
    for rel, rs in sorted(missing_local):
        print(f'  {rel} ({rs} bytes)')

ssh.close()
print(f'\n점검 완료.')
