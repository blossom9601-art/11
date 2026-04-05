"""add hw_server_authority table

Revision ID: c0ffee12345a
Revises: c0ffee123459
Create Date: 2026-01-23

This migration is intentionally idempotent because some environments may already
have the hw_server_authority table created at runtime by the sqlite3 service.

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c0ffee12345a'
down_revision = 'c0ffee123459'
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

    if not _has_table(bind, 'hw_server_authority'):
        op.create_table(
            'hw_server_authority',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('asset_id', sa.Integer(), nullable=False),
            sa.Column('asset_type', sa.Text(), nullable=False),
            sa.Column('status', sa.Text(), nullable=False, server_default=sa.text("'ENABLE'")),
            sa.Column('type', sa.Text(), nullable=False),
            sa.Column('target', sa.Text(), nullable=False),
            sa.Column('action', sa.Text(), nullable=False),
            sa.Column('command', sa.Text(), nullable=True),
            sa.Column('options', sa.Text(), nullable=True),
            sa.Column('expires_at', sa.Text(), nullable=True),
            sa.Column('remark', sa.Text(), nullable=True),
            sa.Column('created_at', sa.Text(), nullable=False),
            sa.Column('created_by', sa.Text(), nullable=False),
            sa.Column('updated_at', sa.Text(), nullable=True),
            sa.Column('updated_by', sa.Text(), nullable=True),
            sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
        )
    else:
        cols = _get_cols_sqlite(bind, 'hw_server_authority')
        _add_col_sqlite('hw_server_authority', 'status', "TEXT NOT NULL DEFAULT 'ENABLE'", cols=cols)
        _add_col_sqlite('hw_server_authority', 'options', 'TEXT', cols=cols)
        _add_col_sqlite('hw_server_authority', 'expires_at', 'TEXT', cols=cols)

    _ensure_index_sqlite('hw_server_authority', 'idx_hw_server_authority_asset', 'asset_type, asset_id, is_deleted')


def downgrade():
    bind = op.get_bind()
    if not _has_table(bind, 'hw_server_authority'):
        return

    try:
        op.drop_table('hw_server_authority')
    except Exception:
        pass
