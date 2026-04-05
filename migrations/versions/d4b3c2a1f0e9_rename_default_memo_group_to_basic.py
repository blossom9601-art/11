"""rename default memo group label to 기본보기

Revision ID: d4b3c2a1f0e9
Revises: c1f0a7d9b2e1
Create Date: 2026-01-03

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = 'd4b3c2a1f0e9'
down_revision = 'c1f0a7d9b2e1'
branch_labels = None
depends_on = None


def upgrade():
    # Rename existing default group label (legacy: 전체보기 -> 기본보기)
    op.execute("UPDATE user_memo_group SET name='기본보기' WHERE trim(name)='전체보기'")

    # Ensure the default group is pinned at the top for manual ordering.
    op.execute("UPDATE user_memo_group SET sort_order=0 WHERE trim(name)='기본보기'")


def downgrade():
    # Best-effort revert
    op.execute("UPDATE user_memo_group SET name='전체보기' WHERE trim(name)='기본보기'")
