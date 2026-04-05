import logging
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional

from flask import current_app

from app.services.network_ad_service import TABLE_NAME as AD_TABLE_NAME
from app.services.network_ad_service import _ensure_parent_dir, _resolve_db_path
from app.services.network_ad_service import migrate_network_ad_tables_from_legacy_db
from app.services.network_ad_service import append_network_ad_log

logger = logging.getLogger(__name__)

FQDN_TABLE_NAME = 'network_ad_fqdn'


def _get_connection(app=None) -> sqlite3.Connection:
    app = app or current_app
    db_path = _resolve_db_path(app)
    _ensure_parent_dir(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    return {
        'fqdn_id': row['fqdn_id'],
        'ad_id': row['ad_id'],
        'status': row['status'] or '',
        'host': (row['host'] if 'host' in row.keys() else '') or '',
        'domain_name': row['domain_name'] or '',
        'fqdn': row['fqdn'] or '',
        'ip_address': row['ip_address'] or '',
        'role': row['role'] or '',
        'purpose': row['purpose'] or '',
        'remark': row['remark'] or '',
        'created_at': row['created_at'],
        'updated_at': row['updated_at'],
        'id': row['fqdn_id'],
    }


def init_network_ad_fqdn_table(app=None) -> None:
    app = app or current_app
    try:
        with _get_connection(app) as conn:
            # Enable FK enforcement (sqlite default off)
            try:
                conn.execute('PRAGMA foreign_keys = ON')
            except Exception:
                pass

            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {FQDN_TABLE_NAME} (
                    fqdn_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ad_id INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'ACTIVE',
                    host TEXT,
                    domain_name TEXT NOT NULL,
                    fqdn TEXT NOT NULL,
                    ip_address TEXT,
                    role TEXT,
                    purpose TEXT,
                    remark TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(ad_id) REFERENCES {AD_TABLE_NAME}(ad_id) ON DELETE CASCADE
                )
                """
            )

            # Best-effort schema evolution for existing DBs.
            try:
                cols = [r[1] for r in conn.execute(f"PRAGMA table_info({FQDN_TABLE_NAME})").fetchall()]
                if 'host' not in cols:
                    conn.execute(f"ALTER TABLE {FQDN_TABLE_NAME} ADD COLUMN host TEXT")
            except Exception:
                logger.exception('Failed to ensure %s.host column', FQDN_TABLE_NAME)

            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{FQDN_TABLE_NAME}_ad_id ON {FQDN_TABLE_NAME}(ad_id)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{FQDN_TABLE_NAME}_status ON {FQDN_TABLE_NAME}(status)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{FQDN_TABLE_NAME}_fqdn ON {FQDN_TABLE_NAME}(fqdn)"
            )

            # Best-effort backfill for host.
            try:
                rows = conn.execute(
                    f"SELECT fqdn_id, fqdn, host FROM {FQDN_TABLE_NAME}"
                ).fetchall()
                for r in rows:
                    existing = (r['host'] or '').strip() if 'host' in r.keys() else ''
                    if existing:
                        continue
                    fqdn = (r['fqdn'] or '').strip()
                    if not fqdn:
                        continue
                    host = fqdn.split('.', 1)[0].strip() if '.' in fqdn else fqdn
                    if not host:
                        continue
                    conn.execute(
                        f"UPDATE {FQDN_TABLE_NAME} SET host=? WHERE fqdn_id=?",
                        (host, int(r['fqdn_id'])),
                    )
            except Exception:
                logger.exception('Failed to backfill %s.host', FQDN_TABLE_NAME)

            conn.commit()
            logger.info('%s table ready', FQDN_TABLE_NAME)

        # Best-effort: migrate legacy project-root DB rows into the current DB.
        try:
            migrate_network_ad_tables_from_legacy_db([FQDN_TABLE_NAME], app=app)
        except Exception:
            logger.exception('Legacy migration (AD FQDN) failed')
    except Exception:
        logger.exception('Failed to initialize %s table', FQDN_TABLE_NAME)
        raise


def list_network_ad_fqdns(ad_id: int, app=None) -> List[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        rows = conn.execute(
            f"SELECT * FROM {FQDN_TABLE_NAME} WHERE ad_id = ? ORDER BY fqdn_id DESC",
            (int(ad_id),),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]


def create_network_ad_fqdn(ad_id: int, payload: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    app = app or current_app
    status = (payload.get('status') or 'ACTIVE').strip() or 'ACTIVE'
    host = (payload.get('host') or '').strip()
    domain_name = (payload.get('domain_name') or '').strip()
    fqdn = (payload.get('fqdn') or '').strip()
    ip_address = (payload.get('ip_address') or '').strip() or None
    role = (payload.get('role') or '').strip() or None
    purpose = (payload.get('purpose') or '').strip() or None
    remark = (payload.get('remark') or '').strip() or None

    if not host and fqdn:
        host = fqdn.split('.', 1)[0].strip() if '.' in fqdn else fqdn

    if not domain_name:
        raise ValueError('도메인명은 필수입니다.')
    if not fqdn:
        raise ValueError('FQDN은 필수입니다.')

    with _get_connection(app) as conn:
        cur = conn.execute(
            f"""
            INSERT INTO {FQDN_TABLE_NAME} (
                ad_id, status, host, domain_name, fqdn, ip_address, role, purpose, remark, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                int(ad_id),
                status,
                host or None,
                domain_name,
                fqdn,
                ip_address,
                role,
                purpose,
                remark,
                _now(),
                _now(),
            ),
        )
        fqdn_id = int(cur.lastrowid)
        conn.commit()

    append_network_ad_log(
        int(ad_id),
        tab_key='gov_ad_policy_domain',
        entity='FQDN',
        entity_id=fqdn_id,
        action='CREATE',
        actor=actor,
        message=f"도메인 {fqdn} 추가",
        diff={'after': {'domain_name': domain_name, 'fqdn': fqdn, 'status': status}},
        app=app,
    )

    return get_network_ad_fqdn(fqdn_id, app=app)  # type: ignore


def get_network_ad_fqdn(fqdn_id: int, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    with _get_connection(app) as conn:
        row = conn.execute(
            f"SELECT * FROM {FQDN_TABLE_NAME} WHERE fqdn_id = ?",
            (int(fqdn_id),),
        ).fetchone()
        return _row_to_dict(row) if row else None


def update_network_ad_fqdn(fqdn_id: int, payload: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    app = app or current_app
    before = get_network_ad_fqdn(fqdn_id, app=app)
    if not before:
        return None

    status = (payload.get('status') if 'status' in payload else before.get('status'))
    host = (payload.get('host') if 'host' in payload else before.get('host'))
    domain_name = (payload.get('domain_name') if 'domain_name' in payload else before.get('domain_name'))
    fqdn = (payload.get('fqdn') if 'fqdn' in payload else before.get('fqdn'))
    ip_address = (payload.get('ip_address') if 'ip_address' in payload else before.get('ip_address'))
    role = (payload.get('role') if 'role' in payload else before.get('role'))
    purpose = (payload.get('purpose') if 'purpose' in payload else before.get('purpose'))
    remark = (payload.get('remark') if 'remark' in payload else before.get('remark'))

    status = (str(status or '').strip() or 'ACTIVE')
    host = (str(host or '').strip() or None)
    domain_name = (str(domain_name or '').strip())
    fqdn = (str(fqdn or '').strip())
    ip_address = (str(ip_address or '').strip() or None)
    role = (str(role or '').strip() or None)
    purpose = (str(purpose or '').strip() or None)
    remark = (str(remark or '').strip() or None)

    if not host and fqdn:
        host = fqdn.split('.', 1)[0].strip() if '.' in fqdn else fqdn

    if not domain_name:
        raise ValueError('도메인명은 필수입니다.')
    if not fqdn:
        raise ValueError('FQDN은 필수입니다.')

    with _get_connection(app) as conn:
        conn.execute(
            f"""
            UPDATE {FQDN_TABLE_NAME}
            SET status=?, host=?, domain_name=?, fqdn=?, ip_address=?, role=?, purpose=?, remark=?, updated_at=?
            WHERE fqdn_id=?
            """,
            (
                status,
                host,
                domain_name,
                fqdn,
                ip_address,
                role,
                purpose,
                remark,
                _now(),
                int(fqdn_id),
            ),
        )
        conn.commit()

    after = get_network_ad_fqdn(fqdn_id, app=app)

    changed: Dict[str, Any] = {}
    try:
        keys = ('status', 'host', 'domain_name', 'fqdn', 'ip_address', 'role', 'purpose', 'remark')
        if after:
            for k in keys:
                if before.get(k) != after.get(k):
                    changed[k] = {'before': before.get(k), 'after': after.get(k)}
    except Exception:
        changed = {}

    append_network_ad_log(
        int(before['ad_id']),
        tab_key='gov_ad_policy_domain',
        entity='FQDN',
        entity_id=int(fqdn_id),
        action='UPDATE',
        actor=actor,
        message=f"도메인 {((after or {}).get('fqdn') or before.get('fqdn') or '')} 수정 (데이터 {len(changed)}개 수정)".strip(),
        diff={'before': before, 'after': after, 'changed': changed},
        app=app,
    )
    return after


def delete_network_ad_fqdn(fqdn_id: int, actor: str, app=None) -> bool:
    app = app or current_app
    before = get_network_ad_fqdn(fqdn_id, app=app)
    if not before:
        return False
    ad_id = int(before['ad_id'])

    with _get_connection(app) as conn:
        conn.execute(
            f"DELETE FROM {FQDN_TABLE_NAME} WHERE fqdn_id=?",
            (int(fqdn_id),),
        )
        conn.commit()

    append_network_ad_log(
        ad_id,
        tab_key='gov_ad_policy_domain',
        entity='FQDN',
        entity_id=int(fqdn_id),
        action='DELETE',
        actor=actor,
        message=f"도메인 {before.get('fqdn') or ''} 삭제".strip(),
        diff={'before': before},
        app=app,
    )
    return True
