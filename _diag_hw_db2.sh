#!/bin/bash
HOST="root@192.168.56.105"
sshpass -p '123456' ssh $HOST << 'REMOTE'
cd /opt/blossom/lumina/web

echo "=== Tables in hardware_asset.db ==="
python3.9 -c "
import sqlite3, os
db_path = 'instance/hardware_asset.db'
if not os.path.exists(db_path):
    print('DB NOT FOUND:', db_path)
else:
    conn = sqlite3.connect(db_path)
    tables = [r[0] for r in conn.execute(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").fetchall()]
    print(f'Total tables: {len(tables)}')
    for t in tables:
        cnt = conn.execute(f'SELECT COUNT(*) FROM [{t}]').fetchone()[0]
        print(f'  {t}: {cnt} rows')
    conn.close()
"

echo ""
echo "=== All instance/*.db files and their tables ==="
python3.9 -c "
import sqlite3, os, glob
for db_file in sorted(glob.glob('instance/*.db')):
    conn = sqlite3.connect(db_file)
    tables = [r[0] for r in conn.execute(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").fetchall()]
    print(f'{db_file}: {len(tables)} tables -> {tables[:10]}')
    conn.close()
"

echo ""
echo "=== Check which DB has biz_work_category ==="
python3.9 -c "
import sqlite3, os, glob
for db_file in sorted(glob.glob('instance/*.db')):
    conn = sqlite3.connect(db_file)
    tables = [r[0] for r in conn.execute(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").fetchall()]
    if 'biz_work_category' in tables:
        print(f'FOUND biz_work_category in {db_file}')
    conn.close()
print('Search complete')
"

echo ""
echo "=== Check biz_work_category in MySQL ==="
export PYTHONPATH=/opt/blossom/lumina/web
set -a; source /etc/blossom/lumina/web.env 2>/dev/null; set +a
python3.9 -c "
import pymysql
conn = pymysql.connect(host='127.0.0.1', port=3306, user='lumina_admin', password='LuminaAdmin2026Secure', database='lumina')
cursor = conn.cursor()
cursor.execute(\"SHOW TABLES LIKE '%work%'\")
print('MySQL work-related tables:')
for r in cursor.fetchall():
    print(f'  {r[0]}')
cursor.execute(\"SHOW TABLES LIKE '%biz%'\")
print('MySQL biz-related tables:')
for r in cursor.fetchall():
    print(f'  {r[0]}')
conn.close()
"

echo ""
echo "=== Check hardware_asset_service.py init function ==="
grep -n 'biz_work_category\|init_hardware_asset\|CREATE TABLE' /opt/blossom/lumina/web/app/services/hardware_asset_service.py | head -20
REMOTE
