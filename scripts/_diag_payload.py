"""Check agent payload data"""
import sqlite3, os, json

db = os.path.join('instance', 'dev_blossom.db')
conn = sqlite3.connect(db)
conn.row_factory = sqlite3.Row
row = conn.execute('SELECT payload FROM agent_pending WHERE id=1').fetchone()
p = json.loads(row['payload'])

print('interfaces:', len(p.get('interfaces', [])))
for i in p['interfaces'][:2]:
    print('  iface:', i.get('iface'), 'slot:', i.get('slot'), 'port:', i.get('port'))
    print('  serial:', i.get('serial'))
    ips = i.get('ip_addresses', [])
    print('  ip_addresses:', ips[:2])
    dets = i.get('details', [])
    print('  details count:', len(dets))
    if dets:
        print('  detail[0]:', dets[0])

print()
print('accounts:', len(p.get('accounts', [])))
for a in p['accounts'][:3]:
    print(' ', a.get('account_name'), a.get('account_type'))

print()
print('packages:', len(p.get('packages', [])))
for pk in p['packages'][:3]:
    print(' ', pk.get('package_name'), pk.get('version'))

conn.close()
