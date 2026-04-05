import os
import sqlite3

INSTANCE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'instance')
CANDIDATES = [
    os.path.join(INSTANCE_DIR, name)
    for name in (
        'dev_blossom.db',
        'blossom.db',
        'opex_contract.db',
        'capex_contract.db',
    )
]


def table_exists(con: sqlite3.Connection, table: str) -> bool:
    row = con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1", (table,)
    ).fetchone()
    return bool(row)


def columns(con: sqlite3.Connection, table: str) -> list[str]:
    return [r[1] for r in con.execute(f"PRAGMA table_info({table})").fetchall()]


def ensure_memo(con: sqlite3.Connection, table: str) -> bool:
    cols = columns(con, table)
    changed = False
    if 'memo' not in cols:
        con.execute(f"ALTER TABLE {table} ADD COLUMN memo TEXT")
        changed = True
        cols = columns(con, table)

    if 'description' in cols:
        con.execute(
            f"UPDATE {table} SET memo = description WHERE memo IS NULL AND description IS NOT NULL"
        )
        con.execute(
            f"UPDATE {table} SET description = memo WHERE description IS NULL AND memo IS NOT NULL"
        )
    return changed


print('== memo schema check / auto-fix ==')
print('instance dir:', INSTANCE_DIR)

found_any = False
for path in CANDIDATES:
    if not os.path.exists(path):
        continue

    con = sqlite3.connect(path)
    try:
        for table in ('opex_contract', 'capex_contract'):
            if not table_exists(con, table):
                continue
            found_any = True
            before_cols = columns(con, table)
            had = 'memo' in before_cols
            changed = ensure_memo(con, table)
            con.commit()
            after_cols = columns(con, table)
            print(f"{os.path.basename(path)} :: {table} had_memo={had} changed={changed} now_memo={'memo' in after_cols}")
    finally:
        con.close()

if not found_any:
    print('No opex_contract/capex_contract tables found in candidate DBs.')
