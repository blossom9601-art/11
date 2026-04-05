import os
import sqlite3


def main() -> int:
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    db_path = os.path.join(repo_root, 'dev_blossom.db')
    if not os.path.exists(db_path):
        print('DB not found:', db_path)
        return 2

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute('PRAGMA foreign_keys = ON')
    except Exception:
        pass

    def has_table(name: str) -> bool:
        row = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone()
        return bool(row)

    def count(name: str, where: str = '1=1') -> int:
        if not has_table(name):
            return -1
        return int(conn.execute(f"SELECT COUNT(*) AS c FROM {name} WHERE {where}").fetchone()['c'])

    tables = ['biz_work_group', 'biz_work_status', 'biz_work_division', 'org_department']
    print('db_path:', db_path)
    for t in tables:
        if not has_table(t):
            print(f'{t}: MISSING')
            continue
        if 'is_deleted' in {r['name'] for r in conn.execute(f"PRAGMA table_info({t})").fetchall()}:
            total = count(t, '1=1')
            active = count(t, 'is_deleted=0')
            deleted = count(t, 'is_deleted=1')
            print(f'{t}: total={total} active={active} deleted={deleted}')
        else:
            print(f'{t}: total={count(t)}')

    if has_table('biz_work_group'):
        rows = conn.execute(
            "SELECT id, group_code, group_name, status_code, division_code, dept_code, is_deleted FROM biz_work_group ORDER BY id DESC LIMIT 10"
        ).fetchall()
        print('\nlatest biz_work_group rows:')
        for r in rows:
            print(dict(r))

    # FK sanity: foreign_key_check prints rows when violations exist
    try:
        fk_issues = conn.execute('PRAGMA foreign_key_check').fetchall()
        print('\nforeign_key_check rows:', len(fk_issues))
        for r in fk_issues[:20]:
            print(tuple(r))
    except Exception as e:
        print('foreign_key_check failed:', type(e).__name__, e)

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
