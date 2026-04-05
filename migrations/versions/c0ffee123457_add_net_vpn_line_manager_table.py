"""add net_vpn_line_manager table

Revision ID: c0ffee123457
Revises: c0ffee123456
Create Date: 2026-01-04

This migration is intentionally idempotent to support environments where the
VPN migrations may exist but are not connected to the active Alembic chain.

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c0ffee123457'
down_revision = 'c0ffee123456'
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

    # If VPN base tables are not present in this environment, skip creating the
    # manager table. The API will report "migration required" until VPN base
    # tables exist.
    if not _has_table(bind, 'net_vpn_line'):
        return

    if _has_table(bind, 'net_vpn_line_manager'):
        return

    op.create_table(
        'net_vpn_line_manager',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('vpn_line_id', sa.Integer(), sa.ForeignKey('net_vpn_line.id', ondelete='CASCADE'), nullable=False),
        sa.Column('org', sa.Text(), nullable=True),
        sa.Column('name', sa.Text(), nullable=True),
        sa.Column('role', sa.Text(), nullable=True),
        sa.Column('phone', sa.Text(), nullable=True),
        sa.Column('email', sa.Text(), nullable=True),
        sa.Column('remark', sa.Text(), nullable=True),
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('updated_at', sa.Text(), nullable=True),
        sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )

    # Prefer SQLite-safe idempotent index creation.
    _ensure_index_sqlite('net_vpn_line_manager', 'ix_net_vpn_line_manager_vpn_line_id', 'vpn_line_id')
    _ensure_index_sqlite('net_vpn_line_manager', 'ix_net_vpn_line_manager_is_deleted', 'is_deleted')
    _ensure_index_sqlite('net_vpn_line_manager', 'ix_net_vpn_line_manager_name', 'name')


def downgrade():
    bind = op.get_bind()
    if not _has_table(bind, 'net_vpn_line_manager'):
        return

    # Best-effort drops.
    try:
        op.drop_table('net_vpn_line_manager')
    except Exception:
        pass
