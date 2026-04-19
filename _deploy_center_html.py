import subprocess, sys

files = [
    ('app/templates/6.datacenter/6-1.access/6-1-2.access_records/1.access_records_list.html',
     '/opt/blossom/web/app/templates/6.datacenter/6-1.access/6-1-2.access_records/1.access_records_list.html'),
    ('app/templates/6.datacenter/6-1.access/6-1-3.authority_control/1.authority_control_list.html',
     '/opt/blossom/web/app/templates/6.datacenter/6-1.access/6-1-3.authority_control/1.authority_control_list.html'),
    ('app/templates/6.datacenter/6-1.access/6-1-4.authority_records/1.authority_records_list.html',
     '/opt/blossom/web/app/templates/6.datacenter/6-1.access/6-1-4.authority_records/1.authority_records_list.html'),
    ('app/templates/6.datacenter/6-1.access/6-1-5.access_system/1.access_system_list.html',
     '/opt/blossom/web/app/templates/6.datacenter/6-1.access/6-1-5.access_system/1.access_system_list.html'),
    ('app/templates/6.datacenter/6-2.erasure/6-2-1.data_deletion_list/1.data_deletion_list.html',
     '/opt/blossom/web/app/templates/6.datacenter/6-2.erasure/6-2-1.data_deletion_list/1.data_deletion_list.html'),
    ('app/templates/6.datacenter/6-2.erasure/6-2-2.data_deletion_system/1.data_deletion_system.html',
     '/opt/blossom/web/app/templates/6.datacenter/6-2.erasure/6-2-2.data_deletion_system/1.data_deletion_system.html'),
    ('app/templates/6.datacenter/6-3.rack/6-3-1.system_lab/1.system_lab.html',
     '/opt/blossom/web/app/templates/6.datacenter/6-3.rack/6-3-1.system_lab/1.system_lab.html'),
]

host = 'root@192.168.56.108'
for local, remote in files:
    cmd = ['scp', local, f'{host}:{remote}']
    print(f'Deploying {local} ...', flush=True)
    r = subprocess.run(cmd, input=b'123456\n', timeout=15)
    if r.returncode != 0:
        print(f'  FAILED (rc={r.returncode})')
    else:
        print(f'  OK')
print('Done.')
