"""add hw_server_backup_policy table

Revision ID: aa21bc34de56
Revises: f5a9c3d1e2b4
Create Date: 2026-01-04

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'aa21bc34de56'
down_revision = 'f5a9c3d1e2b4'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'hw_server_backup_policy',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('asset_category', sa.String(length=32), nullable=False),
        sa.Column('asset_id', sa.Integer(), nullable=False),
        sa.Column('policy_name', sa.Text(), nullable=False),
        sa.Column('backup_directory', sa.Text(), nullable=False),
        sa.Column('library', sa.Text(), nullable=True),
        sa.Column('data', sa.Text(), nullable=True),
        sa.Column('grade', sa.Text(), nullable=True),
        sa.Column('retention', sa.Text(), nullable=True),
        sa.Column('offsite_yn', sa.String(length=1), nullable=True),
        sa.Column('media', sa.Text(), nullable=True),
        sa.Column('schedule', sa.Text(), nullable=True),
        sa.Column('start_time', sa.String(length=16), nullable=True),
        sa.Column('created_at', sa.Text(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.Text(), nullable=True),
        sa.Column('is_deleted', sa.Integer(), server_default=sa.text('0'), nullable=False),
    )

    op.create_index(
        'ix_hw_server_bk_policy_asset',
        'hw_server_backup_policy',
        ['asset_category', 'asset_id', 'is_deleted'],
    )
    op.create_index(
        'ix_hw_server_bk_policy_is_deleted',
        'hw_server_backup_policy',
        ['is_deleted'],
    )


def downgrade():
    op.drop_index('ix_hw_server_bk_policy_is_deleted', table_name='hw_server_backup_policy')
    op.drop_index('ix_hw_server_bk_policy_asset', table_name='hw_server_backup_policy')
    op.drop_table('hw_server_backup_policy')
