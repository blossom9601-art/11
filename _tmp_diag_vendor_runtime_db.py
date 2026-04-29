import sqlite3
from app import create_app
from app.services.vendor_manufacturer_service import _resolve_db_path

app = create_app()
with app.app_context():
    db_path = _resolve_db_path(app)
    print('resolved_db_path', db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    print('table_exists')
    t = cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='biz_vendor_manufacturer'").fetchone()
    print(bool(t))

    print('schema_biz_vendor_manufacturer')
    row = cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='biz_vendor_manufacturer'").fetchone()
    print(row[0] if row else 'NOT_FOUND')

    print('foreign_key_list_biz_vendor_manufacturer')
    for fk in cur.execute("PRAGMA foreign_key_list(biz_vendor_manufacturer)").fetchall():
        print(fk)

    print('target_row')
    for r in cur.execute("SELECT id, manufacturer_name, created_by, updated_by, is_deleted FROM biz_vendor_manufacturer WHERE lower(trim(manufacturer_name))='microsoft'").fetchall():
        print(r)

    print('candidate_actors')
    # Try common auth user tables to find valid usernames for FK-bound audit columns.
    for table in ('user', 'users', 'auth_user', 'sys_user', 'biz_user'):
        try:
            cols = [c[1] for c in cur.execute(f"PRAGMA table_info({table})").fetchall()]
        except Exception:
            continue
        if not cols:
            continue
        print('table', table, 'cols', cols)
        if 'username' in cols:
            try:
                for u in cur.execute(f"SELECT username FROM {table} LIMIT 10").fetchall():
                    print('username', u[0])
            except Exception:
                pass

    conn.close()
