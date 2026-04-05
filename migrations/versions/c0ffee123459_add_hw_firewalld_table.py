"""add hw_firewalld table

Revision ID: c0ffee123459
Revises: c0ffee123458
Create Date: 2026-01-22

This migration is intentionally idempotent because some environments may already
have the hw_firewalld table created at runtime by the API service.

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c0ffee123459'
down_revision = 'c0ffee123458'
branch_labels = None
depends_on = None


def _has_table(bind, name: str) -> bool:
    try:
        insp = sa.inspect(bind)
        return bool(insp.has_table(name))
    except Exception:
        return False


def _safe_exec(sql: str) -> None:
    try:
        op.execute(sa.text(sql))
    except Exception:
        pass


def _ensure_index_sqlite(table: str, index: str, cols_sql: str) -> None:
    _safe_exec(f'CREATE INDEX IF NOT EXISTS {index} ON {table}({cols_sql})')


def _get_cols_sqlite(bind, table: str) -> set[str]:
    try:
        rows = bind.execute(sa.text(f'PRAGMA table_info({table})')).fetchall()
        return {r[1] for r in rows}  # (cid, name, type, notnull, dflt_value, pk)
    except Exception:
        return set()


def _add_col_sqlite(table: str, col: str, ddl: str, *, cols: set[str]) -> None:
    if col in cols:
        return
    _safe_exec(f'ALTER TABLE {table} ADD COLUMN {col} {ddl}')
    cols.add(col)


def upgrade():
    bind = op.get_bind()

    if not _has_table(bind, 'hw_firewalld'):
        op.create_table(
            'hw_firewalld',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('scope_key', sa.Text(), nullable=False),
            sa.Column('asset_id', sa.Integer(), nullable=False),
            sa.Column('priority', sa.Integer(), nullable=False, server_default=sa.text('9999')),
            sa.Column('direction', sa.Text(), nullable=True),
            sa.Column('fw_status', sa.Text(), nullable=True),
            sa.Column('policy_name', sa.Text(), nullable=True),
            sa.Column('source', sa.Text(), nullable=True),
            sa.Column('destination', sa.Text(), nullable=True),
            sa.Column('proto', sa.Text(), nullable=True),
            sa.Column('port', sa.Text(), nullable=True),
            sa.Column('action', sa.Text(), nullable=True),
            sa.Column('fw_log', sa.Text(), nullable=True),
            sa.Column('expires_at', sa.Text(), nullable=True),
            sa.Column('remark', sa.Text(), nullable=True),
            sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('created_by', sa.Text(), nullable=True),
            sa.Column('updated_at', sa.Text(), nullable=True),
            sa.Column('updated_by', sa.Text(), nullable=True),
        )
    else:
        cols = _get_cols_sqlite(bind, 'hw_firewalld')
        _add_col_sqlite('hw_firewalld', 'priority', 'INTEGER NOT NULL DEFAULT 9999', cols=cols)
        _add_col_sqlite('hw_firewalld', 'direction', 'TEXT', cols=cols)
        _add_col_sqlite('hw_firewalld', 'destination', 'TEXT', cols=cols)
        _add_col_sqlite('hw_firewalld', 'fw_log', 'TEXT', cols=cols)
        _add_col_sqlite('hw_firewalld', 'expires_at', 'TEXT', cols=cols)

    _ensure_index_sqlite('hw_firewalld', 'idx_hw_firewalld_scope_asset', 'scope_key, asset_id')
    _ensure_index_sqlite('hw_firewalld', 'idx_hw_firewalld_scope_asset_priority', 'scope_key, asset_id, priority, id')


def downgrade():
    bind = op.get_bind()
    if not _has_table(bind, 'hw_firewalld'):
        return

    try:
        op.drop_table('hw_firewalld')
    except Exception:
        pass
