import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

cmds = [
    # login
    'curl -sk -c /tmp/ck.txt -b /tmp/ck.txt '
    '-H "Content-Type: application/json" '
    '-X POST https://localhost/api/login '
    '-d \'{"username":"admin","password":"admin"}\'',
    # list trend
    'curl -sk -b /tmp/ck.txt '
    '"https://localhost/api/insight/items?category=trend&page=1&page_size=10"',
]

for cmd in cmds:
    print(f'\n>>> {cmd[:80]}...')
    _, o, e = ssh.exec_command(cmd)
    print(o.read().decode())

# now try delete with XHR header - get the item id first
_, o, _ = ssh.exec_command(
    'curl -sk -b /tmp/ck.txt '
    '"https://localhost/api/insight/items?category=trend&page=1&page_size=10"'
)
import json
data = json.loads(o.read().decode())
items = data.get('items', [])
print(f'\nFound {len(items)} items:')
for it in items:
    print(f"  id={it['id']} title={it['title']}")

if items:
    test_id = items[0]['id']
    print(f'\nTrying DELETE id={test_id}...')
    _, o, _ = ssh.exec_command(
        f'curl -sk -b /tmp/ck.txt '
        f'-X DELETE '
        f'-H "X-Requested-With: XMLHttpRequest" '
        f'-H "Accept: application/json" '
        f'"https://localhost/api/insight/items/{test_id}"'
    )
    print(o.read().decode())

    # verify
    _, o, _ = ssh.exec_command(
        'curl -sk -b /tmp/ck.txt '
        '"https://localhost/api/insight/items?category=trend&page=1&page_size=10"'
    )
    after = json.loads(o.read().decode())
    print(f'\nAfter delete: {after.get("totalCount")} items')

ssh.close()
