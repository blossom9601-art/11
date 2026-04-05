"""add access_permission table

Revision ID: 2d3a4b5c6d7e
Revises: 4a6d2c1f9b10
Create Date: 2025-12-21

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2d3a4b5c6d7e'
down_revision = '4a6d2c1f9b10'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'access_permission',
        sa.Column('permission_id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('department_id', sa.Integer(), sa.ForeignKey('org_department.id', ondelete='CASCADE'), nullable=False),
        sa.Column('person_type', sa.Text(), nullable=True),
        sa.Column('access_level', sa.Text(), nullable=True),
        sa.Column('status', sa.Text(), nullable=True),
        sa.Column('remark', sa.Text(), nullable=True),
        sa.Column('permission_start_date', sa.Text(), nullable=True),
        sa.Column('permission_end_date', sa.Text(), nullable=True),
        sa.Column('last_changed_at', sa.Text(), nullable=True),
        sa.Column('last_changed_by', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('dc_future_room', sa.Text(), server_default=sa.text("'X'"), nullable=False),
        sa.Column('dc_future_control', sa.Text(), server_default=sa.text("'X'"), nullable=False),
        sa.Column('dc_eulji_room', sa.Text(), server_default=sa.text("'X'"), nullable=False),
        sa.Column('dc_disaster_room', sa.Text(), server_default=sa.text("'X'"), nullable=False),
        sa.Column('created_at', sa.Text(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.Text(), nullable=True),
    )

    op.create_index('ix_access_permission_user_id', 'access_permission', ['user_id'])
    op.create_index('ix_access_permission_department_id', 'access_permission', ['department_id'])
    op.create_index('ix_access_permission_status', 'access_permission', ['status'])


def downgrade():
    op.drop_index('ix_access_permission_status', table_name='access_permission')
    op.drop_index('ix_access_permission_department_id', table_name='access_permission')
    op.drop_index('ix_access_permission_user_id', table_name='access_permission')
    op.drop_table('access_permission')
