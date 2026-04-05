"""add user memo tables

Revision ID: 6aa1b2c3d4e5
Revises: 5e6f7a8b9c0d
Create Date: 2026-01-02

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '6aa1b2c3d4e5'
down_revision = '5e6f7a8b9c0d'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_memo_group',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('owner_user_id', sa.Integer(), sa.ForeignKey('auth_users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.Text(), nullable=True),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )
    op.create_index('ix_user_memo_group_owner_user_id', 'user_memo_group', ['owner_user_id'])
    op.create_index('ix_user_memo_group_is_deleted', 'user_memo_group', ['is_deleted'])

    op.create_table(
        'user_memo',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('group_id', sa.Integer(), sa.ForeignKey('user_memo_group.id', ondelete='CASCADE'), nullable=False),
        sa.Column('owner_user_id', sa.Integer(), sa.ForeignKey('auth_users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.Text(), nullable=True),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('starred', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('pinned', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.Text(), nullable=True),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )
    op.create_index('ix_user_memo_owner_user_id', 'user_memo', ['owner_user_id'])
    op.create_index('ix_user_memo_group_id', 'user_memo', ['group_id'])
    op.create_index('ix_user_memo_updated_at', 'user_memo', ['updated_at'])
    op.create_index('ix_user_memo_created_at', 'user_memo', ['created_at'])
    op.create_index('ix_user_memo_is_deleted', 'user_memo', ['is_deleted'])


def downgrade():
    op.drop_index('ix_user_memo_is_deleted', table_name='user_memo')
    op.drop_index('ix_user_memo_created_at', table_name='user_memo')
    op.drop_index('ix_user_memo_updated_at', table_name='user_memo')
    op.drop_index('ix_user_memo_group_id', table_name='user_memo')
    op.drop_index('ix_user_memo_owner_user_id', table_name='user_memo')
    op.drop_table('user_memo')

    op.drop_index('ix_user_memo_group_is_deleted', table_name='user_memo_group')
    op.drop_index('ix_user_memo_group_owner_user_id', table_name='user_memo_group')
    op.drop_table('user_memo_group')
