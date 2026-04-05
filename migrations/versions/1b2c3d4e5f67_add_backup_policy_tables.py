"""Add bk_tape, bk_library, bk_location tables.

Revision ID: 1b2c3d4e5f67
Revises: a2f537df1c01
Create Date: 2026-01-01

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1b2c3d4e5f67'
down_revision = 'a2f537df1c01'
branch_labels = None
depends_on = None


def upgrade():
    # bk_library
    op.create_table(
        'bk_library',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('library_name', sa.Text(), nullable=False),
        sa.Column('backup_device_asset_id', sa.Integer(), nullable=False),
        sa.Column('remark', sa.Text(), nullable=True),
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.Column('updated_at', sa.Text(), nullable=True),
        sa.Column('updated_by', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=True),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )
    op.create_index('ux_bk_library_name', 'bk_library', ['library_name'], unique=True)
    op.create_index('ix_bk_library_backup_device_asset_id', 'bk_library', ['backup_device_asset_id'])
    op.create_index('ix_bk_library_is_deleted', 'bk_library', ['is_deleted'])

    # bk_location
    op.create_table(
        'bk_location',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('location_name', sa.Text(), nullable=False),
        sa.Column('location_detail', sa.Text(), nullable=True),
        sa.Column('remark', sa.Text(), nullable=True),
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.Column('updated_at', sa.Text(), nullable=True),
        sa.Column('updated_by', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=True),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )
    op.create_index('ux_bk_location_name', 'bk_location', ['location_name'], unique=True)
    op.create_index('ix_bk_location_is_deleted', 'bk_location', ['is_deleted'])

    # bk_tape
    op.create_table(
        'bk_tape',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('backup_id', sa.Text(), nullable=False),
        sa.Column('backup_policy_name', sa.Text(), nullable=False),
        sa.Column('retention_type', sa.Text(), nullable=False),
        sa.Column('backup_size_k', sa.Integer(), nullable=False),
        sa.Column(
            'backup_size_t',
            sa.Float(),
            sa.Computed('ROUND(backup_size_k / 1099511627776.0, 6)', persisted=True),
        ),
        sa.Column('library_id', sa.Integer(), sa.ForeignKey('bk_library.id'), nullable=False),
        sa.Column('backup_created_date', sa.Text(), nullable=False),
        sa.Column('backup_created_year', sa.Integer(), nullable=False),
        sa.Column('backup_expired_date', sa.Text(), nullable=True),
        sa.Column('backup_status', sa.Text(), nullable=False),
        sa.Column('location_id', sa.Integer(), sa.ForeignKey('bk_location.id'), nullable=False),
        sa.Column('remark', sa.Text(), nullable=True),
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.Column('updated_at', sa.Text(), nullable=True),
        sa.Column('updated_by', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=True),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )
    op.create_index('ux_bk_tape_backup_id', 'bk_tape', ['backup_id'], unique=True)
    op.create_index('ix_bk_tape_library', 'bk_tape', ['library_id', 'is_deleted'])
    op.create_index('ix_bk_tape_location', 'bk_tape', ['location_id', 'is_deleted'])


def downgrade():
    op.drop_index('ix_bk_tape_location', table_name='bk_tape')
    op.drop_index('ix_bk_tape_library', table_name='bk_tape')
    op.drop_index('ux_bk_tape_backup_id', table_name='bk_tape')
    op.drop_table('bk_tape')

    op.drop_index('ix_bk_location_is_deleted', table_name='bk_location')
    op.drop_index('ux_bk_location_name', table_name='bk_location')
    op.drop_table('bk_location')

    op.drop_index('ix_bk_library_is_deleted', table_name='bk_library')
    op.drop_index('ix_bk_library_backup_device_asset_id', table_name='bk_library')
    op.drop_index('ux_bk_library_name', table_name='bk_library')
    op.drop_table('bk_library')
