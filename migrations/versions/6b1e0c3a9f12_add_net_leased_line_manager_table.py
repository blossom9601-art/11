"""add net_leased_line_manager table

Revision ID: 6b1e0c3a9f12
Revises: 2d3a4b5c6d7e
Create Date: 2025-12-28

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '6b1e0c3a9f12'
down_revision = '2d3a4b5c6d7e'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'net_leased_line_manager',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('line_id', sa.Integer(), sa.ForeignKey('net_leased_line.id', ondelete='CASCADE'), nullable=False),
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

    op.create_index('ix_net_leased_line_manager_line_id', 'net_leased_line_manager', ['line_id'])
    op.create_index('ix_net_leased_line_manager_is_deleted', 'net_leased_line_manager', ['is_deleted'])
    op.create_index('ix_net_leased_line_manager_name', 'net_leased_line_manager', ['name'])


def downgrade():
    op.drop_index('ix_net_leased_line_manager_name', table_name='net_leased_line_manager')
    op.drop_index('ix_net_leased_line_manager_is_deleted', table_name='net_leased_line_manager')
    op.drop_index('ix_net_leased_line_manager_line_id', table_name='net_leased_line_manager')
    op.drop_table('net_leased_line_manager')
