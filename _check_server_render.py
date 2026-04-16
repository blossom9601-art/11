import paramiko
import paramiko, io

check_py = """\
import sys
sys.path.insert(0, '/opt/blossom/web')
__import__('os').chdir('/opt/blossom/web')
from run import app
app.config['TESTING'] = True
with app.test_client() as c:
    with c.session_transaction() as sess:
        sess['user_id'] = 1
        sess['user_role'] = 'admin'
    r = c.get('/p/insight_trend')
    html = r.data.decode('utf-8', 'ignore')
    for line in html.split('\n'):
        if 'add-title-input' in line:
            print('INPUT:', line.strip())
        if 'insight.css' in line:
            print('CSS:', line.strip())
        if 'insight_list_common.js' in line:
            print('JS:', line.strip())
"""

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=5)

# SFTP로 파일 업로드
sftp = ssh.open_sftp()
with sftp.open('/tmp/_chk.py', 'w') as f:
    f.write(check_py)
sftp.close()

_, so, se = ssh.exec_command('python3 /tmp/_chk.py 2>&1', timeout=30)
out = so.read().decode('utf-8', 'ignore')
err = se.read().decode('utf-8', 'ignore')
print(out)
if err:
    print('STDERR:', err[:2000])

# Also verify insight.css has the :invalid rule
_, so2, _ = ssh.exec_command('grep -c "user-invalid" /opt/blossom/web/static/css/insight.css', timeout=5)
print('insight.css :user-invalid count:', so2.read().decode().strip())

ssh.close()
