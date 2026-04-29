"""Deploy chat Phase 2 (Event Bridge / Access Approval / Push Device / Search) to production.

Phase 2 modules (선택된 A/B/C/E + SSE 확장 D):
  - Event Bridge (Webhook -> 카드 메시지)
  - Access Approval (다단계 승인)
  - Push Device 등록
  - 메시지 검색
  - SSE chat event 브로드캐스트 (notify_chat_event)
"""
import os
import sys

import paramiko

LOCAL_BASE = r'C:\Users\ME\Desktop\blossom'
REMOTE_BASE = '/opt/blossom/web'

deploy_files = [
    'app/models.py',
    'app/__init__.py',
    'app/services/messenger_phase2_service.py',
    'app/services/push_dispatch_service.py',
    'app/routes/messenger_phase2.py',
    'app/routes/sse_api.py',
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=20)
sftp = ssh.open_sftp()

errors = []
for f in deploy_files:
    local = os.path.join(LOCAL_BASE, f.replace('/', os.sep))
    remote = '%s/%s' % (REMOTE_BASE, f)
    if not os.path.exists(local):
        print('[MISS] %s' % f)
        errors.append(f)
        continue
    # 백업 (이미 있으면 덮어쓰지 않음 — 첫 배포 시점만 보존)
    ssh.exec_command(
        'test -f %s.bak.chat-phase2 || cp -f %s %s.bak.chat-phase2 2>/dev/null'
        % (remote, remote, remote)
    )
    # 원격 디렉터리 보장
    rdir = os.path.dirname(remote)
    ssh.exec_command('mkdir -p %s' % rdir)
    sftp.put(local, remote)
    local_size = os.path.getsize(local)
    remote_size = sftp.stat(remote).st_size
    status = 'OK' if local_size == remote_size else 'SIZE-MISMATCH'
    if status != 'OK':
        errors.append(f)
    print('[%s] %s: local=%d, remote=%d' % (status, f, local_size, remote_size))

sftp.close()

print('\n[restart] blossom-web ...')
stdin, stdout, stderr = ssh.exec_command(
    'systemctl restart blossom-web.service && sleep 2 && '
    'systemctl is-active blossom-web.service'
)
out = stdout.read().decode().strip()
err = stderr.read().decode().strip()
print('  status: %s' % (out or '(empty)'))
if err:
    print('  stderr: %s' % err)

# 헬스 체크
stdin, stdout, stderr = ssh.exec_command(
    'curl -sk -o /dev/null -w "%{http_code}" https://localhost/login'
)
print('  /login http: %s' % stdout.read().decode().strip())

# 신규 엔드포인트 게이팅 확인 (인증 없으면 401, 모르는 토큰이면 404)
checks = [
    ('/api/admin/event-sources', '401'),
    ('/api/access/targets', '401'),
    ('/api/push/devices', '401'),
    ('/api/chat/v2/search?q=ab', '401'),
]
print('\n[smoke]')
for path, expected in checks:
    stdin, stdout, stderr = ssh.exec_command(
        'curl -sk -o /dev/null -w "%%{http_code}" https://localhost%s' % path
    )
    code = stdout.read().decode().strip()
    mark = 'OK' if code == expected else 'WARN'
    print('  [%s] %s -> %s (expected %s)' % (mark, path, code, expected))

# 백그라운드 워커 / 신규 테이블 부팅 로그
stdin, stdout, stderr = ssh.exec_command(
    'journalctl -u blossom-web.service --since "30 seconds ago" --no-pager | '
    'grep -E "messenger.phase2|evt_source|acc_request|push_device" | tail -10'
)
boot_log = stdout.read().decode().strip()
if boot_log:
    print('\n[boot log]')
    print(boot_log)

ssh.close()
if errors:
    print('\nFAILED: %s' % errors)
    sys.exit(1)
print('\nDONE')
