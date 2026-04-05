"""add hw_activate table

Revision ID: c0ffee123458
Revises: c0ffee123457
Create Date: 2026-01-22

This migration is intentionally idempotent because some environments may already
have the hw_activate table created at runtime by the API service.

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c0ffee123458'
down_revision = 'c0ffee123457'
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


def upgrade():
    bind = op.get_bind()

    if not _has_table(bind, 'hw_activate'):
        op.create_table(
            'hw_activate',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('scope_key', sa.Text(), nullable=False),
            sa.Column('asset_id', sa.Integer(), nullable=False),
            sa.Column('svc_type', sa.Text(), nullable=True),
            sa.Column('svc_name', sa.Text(), nullable=True),
            sa.Column('account', sa.Text(), nullable=True),
            sa.Column('start_proc', sa.Text(), nullable=True),
            sa.Column('stop_proc', sa.Text(), nullable=True),
            sa.Column('check_method', sa.Text(), nullable=True),
            sa.Column('owner', sa.Text(), nullable=True),
            sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('created_by', sa.Text(), nullable=True),
            sa.Column('updated_at', sa.Text(), nullable=True),
            sa.Column('updated_by', sa.Text(), nullable=True),
        )

    # Prefer SQLite-safe idempotent index creation.
    _ensure_index_sqlite('hw_activate', 'idx_hw_activate_scope_asset', 'scope_key, asset_id')


def downgrade():
    bind = op.get_bind()
    if not _has_table(bind, 'hw_activate'):
        return

    # Best-effort drops.
    try:
        op.drop_table('hw_activate')
    except Exception:
        pass
