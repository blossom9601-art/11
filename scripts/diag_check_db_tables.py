from __future__ import annotations

import sys
from pathlib import Path
import sqlite3

import sqlalchemy as sa


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


from app import create_app, db
from app.services.network_dns_policy_log_service import (
    TABLE_NAME as DNS_LOG_TABLE,
    _resolve_db_path as resolve_dns_log_db_path,
    init_network_dns_policy_log_table,
)
from app.services.network_leased_line_log_service import (
    TABLE_NAME as LEASED_LOG_TABLE,
    _resolve_db_path as resolve_leased_log_db_path,
    init_network_leased_line_log_table,
)


def main() -> None:
    app = create_app()
    app.app_context().push()

    insp = sa.inspect(db.engine)
    tables = set(insp.get_table_names())

    engine_db = getattr(db.engine.url, 'database', None)
    print('engine_url:', db.engine.url)
    print('engine_database:', engine_db)
    print('config.SQLALCHEMY_DATABASE_URI:', app.config.get('SQLALCHEMY_DATABASE_URI'))
    print('leased_log_db_path:', resolve_leased_log_db_path(app))
    print('dns_log_db_path:', resolve_dns_log_db_path(app))

    root_db = REPO_ROOT / 'dev_blossom.db'
    instance_db = REPO_ROOT / 'instance' / 'dev_blossom.db'
    print('root_db:', str(root_db))
    print('instance_db:', str(instance_db))

    targets = [
        'net_leased_line',
        LEASED_LOG_TABLE,
        DNS_LOG_TABLE,
        'network_ad_log',
    ]

    print('\n[before]')
    for t in targets:
        print(f'- {t}:', 'OK' if t in tables else 'MISSING')

    missing = [t for t in (LEASED_LOG_TABLE, DNS_LOG_TABLE) if t not in tables]
    if missing:
        print('\ninit_missing_tables:', missing)
        if LEASED_LOG_TABLE in missing:
            init_network_leased_line_log_table(app)
        if DNS_LOG_TABLE in missing:
            init_network_dns_policy_log_table(app)

    def _sqlite_has_table(db_path: str | None, table: str) -> bool:
        if not db_path:
            return False
        p = Path(db_path)
        if not p.exists():
            return False
        with sqlite3.connect(str(p)) as conn:
            row = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
                (table,),
            ).fetchone()
        return bool(row)

    def _sqlite_list_tables_like(db_path: str | None, patterns: list[str]) -> list[str]:
        if not db_path:
            return []
        p = Path(db_path)
        if not p.exists():
            return []
        likes = [pat.replace('%', '\\%').replace('_', '\\_') for pat in patterns]
        clauses = ' OR '.join(["name LIKE ? ESCAPE '\\'" for _ in likes])
        sql = f"SELECT name FROM sqlite_master WHERE type='table' AND ({clauses}) ORDER BY name"
        with sqlite3.connect(str(p)) as conn:
            rows = conn.execute(sql, likes).fetchall()
        return [r[0] for r in rows]

    leased_db_path = resolve_leased_log_db_path(app)
    dns_db_path = resolve_dns_log_db_path(app)

    print('\n[sqlite_master check]')
    print('- engine_db has network_leased_line_log:', _sqlite_has_table(engine_db, LEASED_LOG_TABLE))
    print('- engine_db has network_dns_policy_log:', _sqlite_has_table(engine_db, DNS_LOG_TABLE))
    print('- leased_log_db has network_leased_line_log:', _sqlite_has_table(leased_db_path, LEASED_LOG_TABLE))
    print('- dns_log_db has network_dns_policy_log:', _sqlite_has_table(dns_db_path, DNS_LOG_TABLE))

    manager_patterns = [
        '%manager%',
        '%담당자%',
        '%leased%manager%',
        '%leased_line%manager%',
        '%leasedline%manager%',
        '%dedicated%manager%',
        '%dedicatedline%manager%',
        '%net_leased_line%manager%',
    ]
    print('\n[sqlite_master manager tables]')
    for label, path in (
        ('engine_db', engine_db),
        ('root_db', str(root_db)),
        ('instance_db', str(instance_db)),
    ):
        matches = _sqlite_list_tables_like(path, manager_patterns)
        print(f'- {label} manager-like tables:', matches if matches else 'NONE')

    insp2 = sa.inspect(db.engine)
    tables2 = set(insp2.get_table_names())

    print('\n[after]')
    for t in targets:
        print(f'- {t}:', 'OK' if t in tables2 else 'MISSING')


if __name__ == '__main__':
    main()
