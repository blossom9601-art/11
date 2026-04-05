import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

import sqlalchemy as sa
from flask import current_app

logger = logging.getLogger(__name__)

TABLE_NAME = 'network_leased_line_log'

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')

def _get_engine(app=None):
    # Import lazily to avoid circular imports at module import time.
    from app import db

    _app = app or current_app
    try:
        with _app.app_context():
            return db.engine
    except Exception:
        return db.engine


def _format_datetime_kst(value: Any) -> str:
    if value is None:
        return ''
    if isinstance(value, datetime):
        dt = value
        dt = dt + timedelta(hours=9)
        return dt.strftime('%Y-%m-%d %H:%M:%S')
    raw = (value or '').strip() if isinstance(value, str) else ''
    if not raw:
        return ''
    try:
        # Many backends (and sqlite CURRENT_TIMESTAMP) store UTC timestamps.
        dt = datetime.strptime(raw, '%Y-%m-%d %H:%M:%S')
        dt = dt + timedelta(hours=9)
        return dt.strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        return raw


def _row_to_dict(row: Any) -> Dict[str, Any]:
    if not row:
        return {}
    m = row._mapping if hasattr(row, '_mapping') else row
    diff = None
    raw = m.get('diff_json')
    if raw:
        try:
            diff = json.loads(raw)
        except Exception:
            diff = None
    return {
        'log_id': m.get('log_id'),
        'line_id': m.get('line_id'),
        'line_group': m.get('line_group'),
        'tab_key': m.get('tab_key'),
        'entity': m.get('entity'),
        'entity_id': m.get('entity_id'),
        'action': m.get('action'),
        'actor': m.get('actor'),
        'message': m.get('message'),
        'reason': (m.get('reason') or ''),
        'diff': diff,
        'created_at': _format_datetime_kst(m.get('created_at')),
    }


def _table() -> sa.Table:
    md = sa.MetaData()
    return sa.Table(
        TABLE_NAME,
        md,
        sa.Column('log_id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('line_id', sa.Integer, nullable=False),
        sa.Column('line_group', sa.String(64)),
        sa.Column('tab_key', sa.String(255), nullable=False),
        sa.Column('entity', sa.String(64), nullable=False),
        sa.Column('entity_id', sa.Integer),
        sa.Column('action', sa.String(16), nullable=False),
        sa.Column('actor', sa.String(255), nullable=False),
        sa.Column('message', sa.Text),
        sa.Column('reason', sa.Text),
        sa.Column('diff_json', sa.Text),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )


def init_network_leased_line_log_table(app=None) -> None:
    app = app or current_app
    try:
        engine = _get_engine(app)
        t = _table()
        insp = sa.inspect(engine)
        with engine.begin() as conn:
            if not insp.has_table(TABLE_NAME):
                t.create(bind=conn)
            else:
                # Ensure missing columns are backfilled on older DBs.
                try:
                    cols = {c['name'] for c in insp.get_columns(TABLE_NAME)}
                    if 'reason' not in cols:
                        conn.execute(sa.text(f"ALTER TABLE {TABLE_NAME} ADD COLUMN reason TEXT"))
                except Exception:
                    logger.exception('Failed to ensure %s.reason column', TABLE_NAME)

            try:
                conn.execute(sa.text(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_line_id ON {TABLE_NAME}(line_id)"))
            except Exception:
                pass
            try:
                conn.execute(sa.text(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_created ON {TABLE_NAME}(created_at)"))
            except Exception:
                pass
        logger.info('%s table ready', TABLE_NAME)
    except Exception:
        logger.exception('Failed to initialize %s table', TABLE_NAME)
        raise


def append_network_leased_line_log(
    line_id: int,
    *,
    line_group: Optional[str] = None,
    tab_key: str,
    entity: str,
    entity_id: Optional[int] = None,
    action: str,
    actor: str,
    message: str,
    diff: Optional[Dict[str, Any]] = None,
    app=None,
) -> None:
    app = app or current_app
    actor = (actor or 'system').strip() or 'system'
    payload = json.dumps(diff, ensure_ascii=False) if diff else None
    engine = _get_engine(app)
    t = _table()
    with engine.begin() as conn:
        conn.execute(
            sa.insert(t).values(
                line_id=int(line_id),
                line_group=(line_group or '').strip() or None,
                tab_key=(tab_key or '').strip() or 'gov_dedicatedline_detail',
                entity=(entity or 'LEASED_LINE').strip() or 'LEASED_LINE',
                entity_id=int(entity_id) if entity_id is not None else None,
                action=(action or '').strip().upper() or 'UPDATE',
                actor=actor,
                message=(message or '').strip() or None,
                reason=None,
                diff_json=payload,
            )
        )


def list_network_leased_line_logs(
    line_id: int,
    *,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    app=None,
) -> Dict[str, Any]:
    app = app or current_app
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))
    offset = (page - 1) * page_size

    engine = _get_engine(app)
    t = _table()
    with engine.connect() as conn:
        rows = conn.execute(
            sa.select(t)
            .where(t.c.line_id == int(line_id))
            .order_by(t.c.created_at.desc(), t.c.log_id.desc())
            .limit(page_size)
            .offset(offset)
        ).fetchall()
        total = conn.execute(
            sa.select(sa.func.count()).select_from(t).where(t.c.line_id == int(line_id))
        ).scalar_one()

    return {
        'items': [_row_to_dict(r) for r in rows],
        'total': int(total or 0),
        'page': page,
        'page_size': page_size,
    }


def update_network_leased_line_log_reason(
    line_id: int,
    log_id: int,
    *,
    reason: str,
    app=None,
) -> Optional[Dict[str, Any]]:
    app = app or current_app
    lid = int(line_id)
    rid = int(log_id)
    reason_text = (reason or '').strip()

    engine = _get_engine(app)
    t = _table()
    with engine.begin() as conn:
        exists = conn.execute(
            sa.select(t.c.log_id).where(sa.and_(t.c.line_id == lid, t.c.log_id == rid)).limit(1)
        ).fetchone()
        if not exists:
            return None
        conn.execute(
            sa.update(t)
            .where(sa.and_(t.c.line_id == lid, t.c.log_id == rid))
            .values(reason=reason_text)
        )
        updated = conn.execute(
            sa.select(t).where(sa.and_(t.c.line_id == lid, t.c.log_id == rid)).limit(1)
        ).fetchone()
    return _row_to_dict(updated)
