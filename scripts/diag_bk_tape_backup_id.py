import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))


def main() -> int:
    backup_id = (sys.argv[1] if len(sys.argv) > 1 else '').strip()
    if not backup_id:
        print('Usage: python scripts/diag_bk_tape_backup_id.py <BACKUP_ID>')
        return 2

    try:
        import sqlalchemy as sa
        from app import create_app, db

        app = create_app()
        app.app_context().push()

        with db.engine.connect() as conn:
            rows = conn.execute(
                sa.text(
                    """
                    SELECT id, backup_id, is_deleted, created_at, updated_at
                    FROM bk_tape
                    WHERE backup_id = :bid
                    ORDER BY id ASC
                    """
                ),
                {"bid": backup_id},
            ).fetchall()

            total = conn.execute(
                sa.text("SELECT COUNT(*) FROM bk_tape")
            ).scalar_one()

        print('db:', str(db.engine.url))
        print('bk_tape total rows:', total)
        print(f"matches for backup_id={backup_id!r}: {len(rows)}")
        for r in rows:
            try:
                print(
                    {
                        'id': int(r[0]),
                        'backup_id': r[1],
                        'is_deleted': int(r[2] or 0),
                        'created_at': r[3],
                        'updated_at': r[4],
                    }
                )
            except Exception:
                print(r)

        if rows:
            print('\nNOTE: list API hides is_deleted=1 unless include_deleted=1')
        return 0
    except Exception as e:
        print('ERROR:', repr(e))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
