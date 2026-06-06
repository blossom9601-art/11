import ast, paramiko, os
tree = ast.parse(open(r'_deploy_btn_fix.py', encoding='utf-8').read())
config = {t.id: ast.literal_eval(f.value) for f in tree.body if isinstance(f, ast.Assign) for t in f.targets if isinstance(t, ast.Name) if t.id in ['HOST', 'USER', 'PASS']}
target_files = [
    'static/js/shared/components/management-page.js',
    'static/js/modules/hardware/schemas/hardware.schema.js',
    'static/js/modules/software/schemas/software.schema.js',
    'app/templates/9.category/9-2.hardware/_hardware_type_list.html',
    'app/templates/9.category/9-3.software/_software_type_list.html',
    'app/templates/9.category/9-7.vendor/9-7-2.maintenance/1.maintenance_list.html',
    'app/templates/9.category/9-7.vendor/9-7-1.manufacturer/1.manufacturer_list.html',
    'app/templates/9.category/9-6.customer/9-6-1.customer/1.client1_list.html',
    'app/templates/9.category/9-5.company/9-5-1.company/1.company_list.html',
    'app/templates/9.category/9-4.component/9-4-8.facility_security/1.facility_security_list.html'
]
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(config['HOST'], username=config['USER'], password=config['PASS'])
sftp = ssh.open_sftp()
remote_base = '/opt/blossom/web'
for f in target_files:
    remote_path = (remote_base + '/' + f).replace('\\', '/')
    print('Uploading ' + f)
    sftp.put(f, remote_path)
file_paths_str = ' '.join([ (remote_base + '/' + f).replace('\\', '/') for f in target_files])
cmds = [
    'chown -R lumina-web:lumina-web ' + file_paths_str,
    'rm -rf /var/cache/nginx/blossom_proxy/*',
    'nginx -t && systemctl reload nginx',
    'systemctl restart lumina-web',
    'grep -n "subtitleText\\|정보를 수정합니다" /opt/blossom/web/static/js/shared/components/management-page.js',
    'grep -n "section" /opt/blossom/web/static/js/modules/hardware/schemas/hardware.schema.js',
    'systemctl is-active lumina-web'
]
for cmd in cmds:
    print('Running: ' + cmd)
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if out: print(out)
    if err: print(err)
sftp.close()
ssh.close()
