"""add sort_order to user_memo

Revision ID: 8a2c4d1e9f33
Revises: 6aa1b2c3d4e5
Create Date: 2026-01-03

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8a2c4d1e9f33'
down_revision = '6aa1b2c3d4e5'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user_memo', sa.Column('sort_order', sa.Integer(), nullable=False, server_default=sa.text('0')))
    op.create_index('ix_user_memo_group_sort_order', 'user_memo', ['group_id', 'sort_order'])

    # Backfill with stable ordering so existing memos keep a predictable layout.
    # Use id as monotonic increasing order.
    op.execute("UPDATE user_memo SET sort_order = id WHERE sort_order IS NULL OR sort_order = 0")


def downgrade():
    op.drop_index('ix_user_memo_group_sort_order', table_name='user_memo')
    op.drop_column('user_memo', 'sort_order')
