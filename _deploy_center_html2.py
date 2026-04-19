import subprocess, os

host = 'root@192.168.56.108'
base_remote = '/opt/blossom/web'

files = [
    'app/templates/6.datacenter/6-1.access/6-1-2.access_records/1.access_records_list.html',
    'app/templates/6.datacenter/6-1.access/6-1-3.authority_control/1.authority_control_list.html',
    'app/templates/6.datacenter/6-1.access/6-1-4.authority_records/1.authority_records_list.html',
    'app/templates/6.datacenter/6-1.access/6-1-5.access_system/1.access_system_list.html',
    'app/templates/6.datacenter/6-2.erasure/6-2-1.data_deletion_list/1.data_deletion_list.html',
    'app/templates/6.datacenter/6-2.erasure/6-2-2.data_deletion_system/1.data_deletion_system.html',
    'app/templates/6.datacenter/6-3.rack/6-3-1.system_lab/1.system_lab.html',
]

# Build ssh command to create dirs + copy via single session
dirs = set()
for f in files:
    dirs.add(os.path.dirname(f))

mkdir_cmd = ' ; '.join(f'mkdir -p {base_remote}/{d}' for d in sorted(dirs))
print('Creating remote dirs...')
r = subprocess.run(['ssh', host, mkdir_cmd], timeout=15)
print(f'  rc={r.returncode}')

for f in files:
    remote = f'{base_remote}/{f}'
    print(f'Deploying {os.path.basename(f)} -> {remote}')
    r = subprocess.run(['scp', f, f'{host}:{remote}'], timeout=15)
    print(f'  rc={r.returncode}')

print('All done.')
