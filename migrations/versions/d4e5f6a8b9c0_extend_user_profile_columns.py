"""extend user profile columns to match admin page

Revision ID: d4e5f6a8b9c0
Revises: c3d4e5f6a7b8
Create Date: 2025-11-22 17:25:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd4e5f6a8b9c0'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None

def upgrade():
    # Add new columns to existing 'user' table (created in previous migrations)
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('last_login_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('password_changed_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('password_expires_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('locked', sa.Boolean(), nullable=True))
        batch_op.add_column(sa.Column('fail_cnt', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('note', sa.Text(), nullable=True))

def downgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('note')
        batch_op.drop_column('fail_cnt')
        batch_op.drop_column('locked')
        batch_op.drop_column('password_expires_at')
        batch_op.drop_column('password_changed_at')
        batch_op.drop_column('last_login_at')
