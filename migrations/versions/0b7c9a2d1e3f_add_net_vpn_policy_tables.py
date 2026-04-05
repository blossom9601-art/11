"""add net vpn policy tables

Revision ID: 0b7c9a2d1e3f
Revises: d9f3a1b2c3d4, f8b2c3d4e5f6
Create Date: 2025-12-20

"""

from alembic import op
import sqlalchemy as sa


revision = '0b7c9a2d1e3f'
down_revision = ('d9f3a1b2c3d4', 'f8b2c3d4e5f6')
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table('net_vpn_partner'):
        op.create_table(
            'net_vpn_partner',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('partner_type', sa.String(length=64), nullable=False, server_default=sa.text("'DEFAULT'")),
            sa.Column('org_name', sa.String(length=255), nullable=False),
            sa.Column('note', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='SET NULL'), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='SET NULL'), nullable=True),
            sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
        )

    if not inspector.has_table('net_vpn_line'):
        op.create_table(
            'net_vpn_line',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('vpn_partner_id', sa.Integer(), sa.ForeignKey('net_vpn_partner.id', ondelete='CASCADE'), nullable=False),
            sa.Column('status', sa.String(length=64), nullable=True),
            sa.Column('line_speed', sa.String(length=64), nullable=True),
            sa.Column('line_count', sa.Integer(), nullable=True),
            sa.Column('protocol', sa.String(length=32), nullable=True),
            sa.Column('manager', sa.String(length=255), nullable=True),
            sa.Column('cipher', sa.String(length=255), nullable=True),
            sa.Column('upper_country', sa.String(length=255), nullable=True),
            sa.Column('upper_country_address', sa.String(length=512), nullable=True),
            sa.Column('lower_country', sa.String(length=255), nullable=True),
            sa.Column('lower_country_address', sa.String(length=512), nullable=True),
            sa.Column('note', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='SET NULL'), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='SET NULL'), nullable=True),
            sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
        )

    if not inspector.has_table('net_vpn_line_device'):
        op.create_table(
            'net_vpn_line_device',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('vpn_line_id', sa.Integer(), sa.ForeignKey('net_vpn_line.id', ondelete='CASCADE'), nullable=False),
            sa.Column('device_name', sa.String(length=255), nullable=False),
            sa.Column('note', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='SET NULL'), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='SET NULL'), nullable=True),
            sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
        )

    # Indexes (idempotent)
    def _existing_indexes(table: str):
        if not inspector.has_table(table):
            return set()
        return {i['name'] for i in inspector.get_indexes(table) if i.get('name')}

    idx_partner = _existing_indexes('net_vpn_partner')
    if 'ix_net_vpn_partner_partner_type' not in idx_partner:
        op.create_index('ix_net_vpn_partner_partner_type', 'net_vpn_partner', ['partner_type'], unique=False)
    if 'ix_net_vpn_partner_org_name' not in idx_partner:
        op.create_index('ix_net_vpn_partner_org_name', 'net_vpn_partner', ['org_name'], unique=False)
    if 'ix_net_vpn_partner_is_deleted' not in idx_partner:
        op.create_index('ix_net_vpn_partner_is_deleted', 'net_vpn_partner', ['is_deleted'], unique=False)

    idx_line = _existing_indexes('net_vpn_line')
    if 'ix_net_vpn_line_partner_id' not in idx_line:
        op.create_index('ix_net_vpn_line_partner_id', 'net_vpn_line', ['vpn_partner_id'], unique=False)
    if 'ix_net_vpn_line_status' not in idx_line:
        op.create_index('ix_net_vpn_line_status', 'net_vpn_line', ['status'], unique=False)
    if 'ix_net_vpn_line_is_deleted' not in idx_line:
        op.create_index('ix_net_vpn_line_is_deleted', 'net_vpn_line', ['is_deleted'], unique=False)

    idx_dev = _existing_indexes('net_vpn_line_device')
    if 'ix_net_vpn_line_device_line_id' not in idx_dev:
        op.create_index('ix_net_vpn_line_device_line_id', 'net_vpn_line_device', ['vpn_line_id'], unique=False)
    if 'ix_net_vpn_line_device_device_name' not in idx_dev:
        op.create_index('ix_net_vpn_line_device_device_name', 'net_vpn_line_device', ['device_name'], unique=False)
    if 'ix_net_vpn_line_device_is_deleted' not in idx_dev:
        op.create_index('ix_net_vpn_line_device_is_deleted', 'net_vpn_line_device', ['is_deleted'], unique=False)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # Drop in child->parent order
    if inspector.has_table('net_vpn_line_device'):
        op.drop_index('ix_net_vpn_line_device_is_deleted', table_name='net_vpn_line_device')
        op.drop_index('ix_net_vpn_line_device_device_name', table_name='net_vpn_line_device')
        op.drop_index('ix_net_vpn_line_device_line_id', table_name='net_vpn_line_device')
        op.drop_table('net_vpn_line_device')

    if inspector.has_table('net_vpn_line'):
        op.drop_index('ix_net_vpn_line_is_deleted', table_name='net_vpn_line')
        op.drop_index('ix_net_vpn_line_status', table_name='net_vpn_line')
        op.drop_index('ix_net_vpn_line_partner_id', table_name='net_vpn_line')
        op.drop_table('net_vpn_line')

    if inspector.has_table('net_vpn_partner'):
        op.drop_index('ix_net_vpn_partner_is_deleted', table_name='net_vpn_partner')
        op.drop_index('ix_net_vpn_partner_org_name', table_name='net_vpn_partner')
        op.drop_index('ix_net_vpn_partner_partner_type', table_name='net_vpn_partner')
        op.drop_table('net_vpn_partner')
