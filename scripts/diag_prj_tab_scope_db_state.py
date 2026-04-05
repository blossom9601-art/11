import sqlite3
from pathlib import Path


def main() -> int:
    db_path = Path(__file__).resolve().parents[1] / 'instance' / 'dev_blossom.db'
    print('db_path:', db_path)
    if not db_path.exists():
        print('ERROR: db file missing')
        return 2

    con = sqlite3.connect(str(db_path))
    try:
        cur = con.cursor()
        try:
            version = cur.execute('select version_num from alembic_version').fetchone()
        except Exception as e:
            version = None
            print('alembic_version read error:', repr(e))

        print('alembic_version:', version)

        names = ['prj_project', 'prj_project_member', 'prj_tab_integrity', 'prj_tab_scope']
        rows = cur.execute(
            "select name from sqlite_master where type='table' and name in (%s)"
            % (','.join('?' for _ in names)),
            names,
        ).fetchall()
        found = {r[0] for r in rows}
        print('tables_found:', sorted(found))
        missing = [n for n in names if n not in found]
        print('tables_missing:', missing)
        return 0
    finally:
        con.close()


if __name__ == '__main__':
    raise SystemExit(main())
