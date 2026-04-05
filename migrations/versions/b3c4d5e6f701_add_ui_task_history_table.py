"""add ui_task_history table

Revision ID: b3c4d5e6f701
Revises: ab12cd34ef67
Create Date: 2026-01-04

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b3c4d5e6f701'
down_revision = 'ab12cd34ef67'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'ui_task_history',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('scope_type', sa.Text(), nullable=False),
        sa.Column('scope_id', sa.Integer(), nullable=True),
        sa.Column('scope_ref', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=True),
        sa.Column('task_no', sa.String(length=128), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=True),
        sa.Column('type', sa.String(length=64), nullable=True),
        sa.Column('category', sa.String(length=64), nullable=True),
        sa.Column('start', sa.String(length=32), nullable=True),
        sa.Column('end', sa.String(length=32), nullable=True),
        sa.Column('created_at', sa.Text(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('updated_at', sa.Text(), nullable=True),
        sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('is_deleted', sa.Integer(), server_default=sa.text('0'), nullable=False),
    )

    op.create_index(
        'ix_ui_task_history_scope',
        'ui_task_history',
        ['scope_type', 'scope_id', 'is_deleted'],
    )
    op.create_index(
        'ix_ui_task_history_scope_ref',
        'ui_task_history',
        ['scope_type', 'scope_ref', 'is_deleted'],
    )
    op.create_index(
        'ix_ui_task_history_is_deleted',
        'ui_task_history',
        ['is_deleted'],
    )


def downgrade():
    op.drop_index('ix_ui_task_history_is_deleted', table_name='ui_task_history')
    op.drop_index('ix_ui_task_history_scope_ref', table_name='ui_task_history')
    op.drop_index('ix_ui_task_history_scope', table_name='ui_task_history')
    op.drop_table('ui_task_history')
