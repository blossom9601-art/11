import pathlib
import paramiko

host = '192.168.56.108'
user = 'root'
pw = '123456'

base_local = pathlib.Path(r'c:/Users/ME/Desktop/blossom')
base_remote = '/opt/blossom/web'

rel_files = [
    'app/services/cmp_cpu_type_service.py',
    'app/services/cmp_disk_type_service.py',
    'app/services/cmp_etc_type_service.py',
    'app/services/cmp_gpu_type_service.py',
    'app/services/cmp_hba_type_service.py',
    'app/services/cmp_memory_type_service.py',
    'app/services/cmp_nic_type_service.py',
    'app/services/hw_network_type_service.py',
    'app/services/hw_san_type_service.py',
    'app/services/hw_security_type_service.py',
    'app/services/hw_server_type_service.py',
    'app/services/hw_storage_type_service.py',
    'app/services/sw_db_type_service.py',
    'app/services/sw_high_availability_type_service.py',
    'app/services/sw_middleware_type_service.py',
    'app/services/sw_os_type_service.py',
    'app/services/sw_security_type_service.py',
    'app/services/sw_virtual_type_service.py',
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=pw, timeout=10)

sftp = ssh.open_sftp()
for rel in rel_files:
    local = base_local / rel
    remote = base_remote + '/' + rel
    if not local.exists():
        raise FileNotFoundError(str(local))
    sftp.put(str(local), remote)
    print('uploaded:', remote)
sftp.close()

checks = [
    'systemctl restart blossom-web',
    'systemctl is-active blossom-web',
    "grep -n \"legacy_name = name\" /opt/blossom/web/app/services/cmp_cpu_type_service.py",
    "grep -n \"legacy_name = name\" /opt/blossom/web/app/services/hw_server_type_service.py",
    "grep -n \"legacy_name = name\" /opt/blossom/web/app/services/sw_os_type_service.py",
    "/opt/blossom/web/venv/bin/python3 - <<'PY'\nimport os\nos.chdir('/opt/blossom/web')\nfrom app import create_app\napp=create_app()\nwith app.app_context():\n    from app.services.cmp_cpu_type_service import _get_connection as cc, _resolve_manufacturer_code as rc\n    from app.services.hw_server_type_service import _get_connection as hc, _resolve_manufacturer_code as rh\n    from app.services.sw_os_type_service import _get_connection as sc, _resolve_manufacturer_code as rs\n    with cc(app) as c:\n        print('cmp_cpu HPE_2 =>', rc(c, {'manufacturer_name':'HPE_2'}))\n    with hc(app) as c:\n        print('hw_server HPE_2 =>', rh(c, {'manufacturer_name':'HPE_2'}))\n    with sc(app) as c:\n        print('sw_os HPE_2 =>', rs(c, {'manufacturer_name':'HPE_2'}))\nPY",
]

for cmd in checks:
    _, so, se = ssh.exec_command(cmd, timeout=240)
    out = so.read().decode('utf-8', 'ignore').strip()
    err = se.read().decode('utf-8', 'ignore').strip()
    print('---')
    print(cmd)
    print('OUT:', out or '(empty)')
    print('ERR:', err or '(empty)')

ssh.close()
print('DONE')
