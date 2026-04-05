"""add sort_order to user_memo_group

Revision ID: c1f0a7d9b2e1
Revises: 8a2c4d1e9f33
Create Date: 2026-01-03

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c1f0a7d9b2e1'
down_revision = '8a2c4d1e9f33'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user_memo_group', sa.Column('sort_order', sa.Integer(), nullable=False, server_default=sa.text('0')))
    op.create_index('ix_user_memo_group_owner_sort_order', 'user_memo_group', ['owner_user_id', 'sort_order'])

    # Backfill: keep default group '기본보기' pinned at 0; give others stable ordering by id.
    op.execute("UPDATE user_memo_group SET sort_order = 0 WHERE trim(name) = '기본보기'")
    op.execute("UPDATE user_memo_group SET sort_order = id WHERE trim(name) != '기본보기' AND (sort_order IS NULL OR sort_order = 0)")


def downgrade():
    op.drop_index('ix_user_memo_group_owner_sort_order', table_name='user_memo_group')
    op.drop_column('user_memo_group', 'sort_order')
