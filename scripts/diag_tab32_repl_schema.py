import os
import sqlite3


def main() -> None:
    db = os.path.join('instance', 'dev_blossom.db')
    print('DB exists:', os.path.exists(db), db)
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row

    cols = [r['name'] for r in conn.execute('PRAGMA table_info(tab32_assign_group_replication)').fetchall()]
    print('Columns (before):', cols)

    # Best-effort schema upgrade (mirrors app runtime behavior)
    try:
        if 'repl_storage_system_name' not in cols:
            conn.execute('ALTER TABLE tab32_assign_group_replication ADD COLUMN repl_storage_system_name TEXT')
        if 'repl_method' not in cols:
            conn.execute('ALTER TABLE tab32_assign_group_replication ADD COLUMN repl_method TEXT')
        if 'remark' not in cols:
            conn.execute('ALTER TABLE tab32_assign_group_replication ADD COLUMN remark TEXT')
        conn.commit()
    except Exception as exc:
        print('Schema upgrade skipped/failed:', exc)

    cols = [r['name'] for r in conn.execute('PRAGMA table_info(tab32_assign_group_replication)').fetchall()]
    print('Columns (after):', cols)

    rows = conn.execute(
        'SELECT id, group_id, local_volume_name, repl_storage, repl_storage_system_name, repl_method, remark, repl_volume_name, capacity '
        'FROM tab32_assign_group_replication ORDER BY id DESC LIMIT 10'
    ).fetchall()
    print('Rows:', len(rows))
    for r in rows:
        print(dict(r))

    conn.close()


if __name__ == '__main__':
    main()
