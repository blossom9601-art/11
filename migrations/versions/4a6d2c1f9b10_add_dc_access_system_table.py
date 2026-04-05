"""add dc_access_system table

Revision ID: 4a6d2c1f9b10
Revises: 3f9c2b1a7d0e
Create Date: 2025-12-21

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4a6d2c1f9b10'
down_revision = '3f9c2b1a7d0e'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'dc_access_system',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('system_code', sa.Text(), nullable=False, unique=True),
        sa.Column('business_status_code', sa.Text(), nullable=False),
        sa.Column('business_name', sa.Text(), nullable=False),
        sa.Column('system_name', sa.Text(), nullable=False),
        sa.Column('system_ip', sa.Text(), nullable=True),
        sa.Column('manage_ip', sa.Text(), nullable=True),
        sa.Column('manufacturer_name', sa.Text(), nullable=True),
        sa.Column('system_model_name', sa.Text(), nullable=True),
        sa.Column('serial_number', sa.Text(), nullable=True),
        sa.Column('center_code', sa.Text(), sa.ForeignKey('org_center.center_code'), nullable=True),
        sa.Column('system_location', sa.Text(), nullable=True),
        sa.Column('system_dept_code', sa.Text(), sa.ForeignKey('org_department.dept_code'), nullable=True),
        sa.Column('system_manager_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=True),
        sa.Column('service_dept_code', sa.Text(), sa.ForeignKey('org_department.dept_code'), nullable=True),
        sa.Column('service_manager_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=True),
        sa.Column('remark', sa.Text(), nullable=True),
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.Column('updated_at', sa.Text(), nullable=True),
        sa.Column('updated_by', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=True),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )

    op.create_index('ix_dc_access_system_system_code', 'dc_access_system', ['system_code'])
    op.create_index('ix_dc_access_system_is_deleted', 'dc_access_system', ['is_deleted'])


def downgrade():
    op.drop_index('ix_dc_access_system_is_deleted', table_name='dc_access_system')
    op.drop_index('ix_dc_access_system_system_code', table_name='dc_access_system')
    op.drop_table('dc_access_system')
