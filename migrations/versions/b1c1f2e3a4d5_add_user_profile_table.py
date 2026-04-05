"""add user profile table

Revision ID: b1c1f2e3a4d5
Revises: 57840fa18db8
Create Date: 2025-11-22 11:15:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'b1c1f2e3a4d5'
down_revision = '57840fa18db8'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('user',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('emp_no', sa.String(length=30), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=True),
        sa.Column('nickname', sa.String(length=128), nullable=True),
        sa.Column('department', sa.String(length=128), nullable=True),
        sa.Column('location', sa.String(length=128), nullable=True),
        sa.Column('ext_phone', sa.String(length=32), nullable=True),
        sa.Column('mobile_phone', sa.String(length=32), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('role', sa.String(length=50), nullable=True),
        sa.Column('allowed_ip', sa.Text(), nullable=True),
        sa.Column('job', sa.Text(), nullable=True),
        sa.Column('profile_image', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_user_emp_no', 'user', ['emp_no'], unique=True)


def downgrade():
    op.drop_index('ix_user_emp_no', table_name='user')
    op.drop_table('user')
