import sqlite3
from app import create_app
from app.services.vendor_manufacturer_service import _resolve_db_path

TARGET_ID = 7
app = create_app()
with app.app_context():
    db_path = _resolve_db_path(app)
    print('resolved_db_path', db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()]

    print('fk_to_biz_vendor_manufacturer')
    for t in tables:
        try:
            fks = cur.execute(f"PRAGMA foreign_key_list({t})").fetchall()
        except Exception:
            continue
        for fk in fks:
            if str(fk[2]).lower() == 'biz_vendor_manufacturer':
                print('fk', t, 'from', fk[3], 'to', fk[4], 'on_update', fk[5], 'on_delete', fk[6])

    print('rows_referencing_target_id')
    candidate_cols = ('vendor_id', 'manufacturer_id', 'vendor_manufacturer_id', 'manufacturer')
    for t in tables:
        try:
            cols = [c[1] for c in cur.execute(f"PRAGMA table_info({t})").fetchall()]
        except Exception:
            continue
        for c in candidate_cols:
            if c in cols:
                try:
                    n = cur.execute(f"SELECT COUNT(*) FROM {t} WHERE {c}=?", (TARGET_ID,)).fetchone()[0]
                except Exception:
                    continue
                if n:
                    print('ref', t, c, n)

    print('triggers_related_to_biz_vendor_manufacturer')
    for name, tbl, sql in cur.execute("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name").fetchall():
        text = (sql or '').lower()
        if 'biz_vendor_manufacturer' in text or tbl == 'biz_vendor_manufacturer':
            print('trigger', name, 'table', tbl)
            print(sql)

    conn.close()
