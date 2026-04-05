"""add company column to user profile

Revision ID: c3d4e5f6a7b8
Revises: b1c1f2e3a4d5
Create Date: 2025-11-22 12:05:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c3d4e5f6a7b8'
down_revision = 'b1c1f2e3a4d5'
branch_labels = None
depends_on = None

def upgrade():
    # user 테이블에 company 컬럼 추가 (nullable)
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('company', sa.String(length=128), nullable=True))


def downgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('company')
