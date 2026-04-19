import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

files = [
    '/opt/blossom/web/static/js/common/brand-loader.js',
    '/opt/blossom/web/static/js/authentication/11-3.admin/11-3-3.setting/10.brand.js',
    '/opt/blossom/web/static/css/brand_admin.css',
    '/opt/blossom/web/app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html',
    '/opt/blossom/web/app/services/brand_setting_service.py',
]

print('=== 운영서버 브랜드 파일 존재 여부 ===')
for f in files:
    _, o, _ = ssh.exec_command(f'ls -la {f} 2>&1')
    print(o.read().decode().strip())

# API route 확인
print('\n=== api.py에 brand-settings 라우트 존재? ===')
_, o, _ = ssh.exec_command('grep -c "brand.settings" /opt/blossom/web/app/routes/api.py; grep -c "brand_settings" /opt/blossom/web/app/routes/api.py')
print(o.read().decode().strip())

# auth.py에 brand 라우트 존재?
print('\n=== auth.py에 brand 라우트 존재? ===')
_, o, _ = ssh.exec_command('grep -n "brand" /opt/blossom/web/app/routes/auth.py 2>/dev/null | head -10')
print(o.read().decode().strip())

# brand_setting_service.py 존재?
print('\n=== brand_setting_service.py ===')
_, o, _ = ssh.exec_command('wc -l /opt/blossom/web/app/services/brand_setting_service.py 2>&1')
print(o.read().decode().strip())

ssh.close()
