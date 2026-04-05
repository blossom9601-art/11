"""Add bk_storage_pool and bk_backup_target_policy tables.

Revision ID: 3a7d1c9e4b21
Revises: 2f3a4c5d6e7f
Create Date: 2026-01-01

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3a7d1c9e4b21'
down_revision = '2f3a4c5d6e7f'
branch_labels = None
depends_on = None


def upgrade():
    # bk_storage_pool
    op.create_table(
        'bk_storage_pool',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('pool_name', sa.Text(), nullable=False),
        # NOTE: This refers to hardware_asset.db (service-layer sqlite). No FK constraint.
        sa.Column('storage_asset_id', sa.Integer(), nullable=False),
        sa.Column('remark', sa.Text(), nullable=True),
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.Column('updated_at', sa.Text(), nullable=True),
        sa.Column('updated_by', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=True),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )
    op.create_index('ux_bk_storage_pool_pool_name', 'bk_storage_pool', ['pool_name'], unique=True)
    op.create_index('ix_bk_storage_pool_storage_asset_id', 'bk_storage_pool', ['storage_asset_id'])
    op.create_index('ix_bk_storage_pool_is_deleted', 'bk_storage_pool', ['is_deleted'])

    # bk_backup_target_policy
    op.create_table(
        'bk_backup_target_policy',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('backup_scope', sa.Text(), nullable=False),
        sa.Column('business_name', sa.Text(), nullable=True),
        sa.Column('system_name', sa.Text(), nullable=False),
        sa.Column('ip_address', sa.Text(), nullable=True),
        sa.Column('backup_policy_name', sa.Text(), nullable=False),
        sa.Column('backup_directory', sa.Text(), nullable=False),
        sa.Column('data_type', sa.Text(), nullable=False),
        sa.Column('backup_grade', sa.Text(), nullable=False),
        sa.Column('retention_value', sa.Integer(), nullable=True),
        sa.Column('retention_unit', sa.Text(), nullable=True),
        sa.Column('storage_pool_id', sa.Integer(), sa.ForeignKey('bk_storage_pool.id'), nullable=False),
        sa.Column('offsite_yn', sa.Text(), nullable=False),
        sa.Column('media_type', sa.Text(), nullable=False),
        sa.Column('schedule_name', sa.Text(), nullable=True),
        sa.Column('start_time', sa.Text(), nullable=True),
        sa.Column('remark', sa.Text(), nullable=True),
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.Column('updated_at', sa.Text(), nullable=True),
        sa.Column('updated_by', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=True),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )
    op.create_index('ix_bk_backup_target_policy_pool', 'bk_backup_target_policy', ['storage_pool_id', 'is_deleted'])
    op.create_index('ix_bk_backup_target_policy_is_deleted', 'bk_backup_target_policy', ['is_deleted'])


def downgrade():
    op.drop_index('ix_bk_backup_target_policy_is_deleted', table_name='bk_backup_target_policy')
    op.drop_index('ix_bk_backup_target_policy_pool', table_name='bk_backup_target_policy')
    op.drop_table('bk_backup_target_policy')

    op.drop_index('ix_bk_storage_pool_is_deleted', table_name='bk_storage_pool')
    op.drop_index('ix_bk_storage_pool_storage_asset_id', table_name='bk_storage_pool')
    op.drop_index('ux_bk_storage_pool_pool_name', table_name='bk_storage_pool')
    op.drop_table('bk_storage_pool')
