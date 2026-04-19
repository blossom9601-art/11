"""RAG Q&A 기능 배포 (검색 → 문서 기반 답변 + 근거 카드)"""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

sftp = ssh.open_sftp()

files = [
    # 1) Backend: api.py (RAG 답변 생성 + unified search에 rag_evidence/rag_answer 추가)
    ('app/routes/api.py', '/opt/blossom/web/app/routes/api.py'),
    # 2) Backend: __init__.py (워커 bootstrap_schema 자동 호출)
    ('app/__init__.py', '/opt/blossom/web/app/__init__.py'),
    # 3) Frontend: search JS (renderRagAnswer + renderRagEvidence 연결)
    ('static/js/addon_application/5.search.js', '/opt/blossom/web/static/js/addon_application/5.search.js'),
    # 4) Template: search HTML (rag-answer section 추가)
    ('app/templates/addon_application/5.search.html', '/opt/blossom/web/app/templates/addon_application/5.search.html'),
    # 5) CSS: blossom.css (answer card 스타일)
    ('static/css/blossom.css', '/opt/blossom/web/static/css/blossom.css'),
]

for i, (local, remote) in enumerate(files, 1):
    sftp.put(local, remote)
    print(f'[{i}/{len(files)}] {local}')

sftp.close()

# Restart service
print('\nRestarting service...')
_, o, _ = ssh.exec_command('systemctl restart blossom-web', timeout=30)
o.read()
_, o, _ = ssh.exec_command('systemctl is-active blossom-web', timeout=5)
status = o.read().decode().strip()
print(f'service: {status}')

ssh.close()
print('DONE' if status == 'active' else f'WARNING: service is {status}')
