"""add net leased line task table

Revision ID: 9a3c1d2e4f50
Revises: 8d1f2a3b4c5e
Create Date: 2025-12-28

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9a3c1d2e4f50'
down_revision = '8d1f2a3b4c5e'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'net_leased_line_task',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('line_id', sa.Integer(), sa.ForeignKey('net_leased_line.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(length=32)),
        sa.Column('task_no', sa.String(length=128)),
        sa.Column('name', sa.String(length=255)),
        sa.Column('type', sa.String(length=64)),
        sa.Column('category', sa.String(length=64)),
        sa.Column('start', sa.String(length=32)),
        sa.Column('end', sa.String(length=32)),
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='SET NULL')),
        sa.Column('updated_at', sa.Text()),
        sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='SET NULL')),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )

    op.create_index('ix_net_leased_line_task_line_id', 'net_leased_line_task', ['line_id'])
    op.create_index('ix_net_leased_line_task_is_deleted', 'net_leased_line_task', ['is_deleted'])


def downgrade():
    op.drop_index('ix_net_leased_line_task_is_deleted', table_name='net_leased_line_task')
    op.drop_index('ix_net_leased_line_task_line_id', table_name='net_leased_line_task')
    op.drop_table('net_leased_line_task')
