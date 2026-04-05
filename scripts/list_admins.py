import os, sqlite3, json

# Determine DB file (development config uses dev_blossom.db by default)
CWD = os.getcwd()
primary = os.path.join(CWD, 'dev_blossom.db')
secondary = os.path.join(CWD, 'blossom.db')
if os.path.exists(primary):
    db_path = primary
elif os.path.exists(secondary):
    db_path = secondary
else:
    print(json.dumps({'error':'db_not_found','searched':[primary, secondary]}))
    raise SystemExit(1)

conn = sqlite3.connect(db_path)
cur = conn.cursor()
try:
    cur.execute("SELECT emp_no, email, role FROM auth_users")
    rows = cur.fetchall()
except Exception as e:
    print(json.dumps({'error':'query_failed','detail':str(e)}))
    conn.close()
    raise SystemExit(2)

admins = []
for emp_no, email, role in rows:
    emp_u = (emp_no or '').strip().upper()
    role_u = (role or '').strip().upper()
    prefix = (email.split('@')[0].strip().upper() if email and '@' in email else '')
    if role_u in ('ADMIN','관리자','ADMINISTRATOR') or emp_u == 'ADMIN' or prefix == 'ADMIN':
        admins.append({
            'emp_no': emp_no,
            'email': email,
            'role': role,
            'match': 'role' if role_u in ('ADMIN','관리자','ADMINISTRATOR') else ('emp_no' if emp_u=='ADMIN' else 'email_prefix')
        })

print(json.dumps({'db_file': db_path, 'admin_count': len(admins), 'admins': admins}, ensure_ascii=False))
conn.close()
