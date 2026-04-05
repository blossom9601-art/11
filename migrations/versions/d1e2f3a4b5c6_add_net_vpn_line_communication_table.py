"""add net_vpn_line_communication table

Revision ID: d1e2f3a4b5c6
Revises: c0ffee123457
Create Date: 2026-02-22 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'd1e2f3a4b5c6'
down_revision = 'c0ffee123457'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'net_vpn_line_communication',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('vpn_line_id', sa.Integer, sa.ForeignKey('net_vpn_line.id', ondelete='CASCADE'), nullable=False),
        sa.Column('self_division', sa.String(255)),
        sa.Column('line', sa.String(255)),
        sa.Column('work_name', sa.String(255)),
        sa.Column('real_ip', sa.Text),
        sa.Column('l4_ip', sa.Text),
        sa.Column('nat_ip', sa.Text),
        sa.Column('port_self', sa.String(255)),
        sa.Column('vpn_ip_self', sa.Text),
        sa.Column('direction', sa.String(8)),
        sa.Column('vpn_ip_org', sa.Text),
        sa.Column('nw_ip_org', sa.Text),
        sa.Column('port_org', sa.String(255)),
        sa.Column('sort_order', sa.Integer, nullable=False, server_default=sa.text('0')),
        sa.Column('created_at', sa.Text, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_user_id', sa.Integer, sa.ForeignKey('org_user.id', ondelete='SET NULL')),
        sa.Column('updated_at', sa.Text),
        sa.Column('updated_by_user_id', sa.Integer, sa.ForeignKey('org_user.id', ondelete='SET NULL')),
        sa.Column('is_deleted', sa.Integer, nullable=False, server_default=sa.text('0')),
    )
    op.create_index('ix_net_vpn_line_comm_vpn_line_id', 'net_vpn_line_communication', ['vpn_line_id'])
    op.create_index('ix_net_vpn_line_comm_is_deleted', 'net_vpn_line_communication', ['is_deleted'])


def downgrade():
    op.drop_index('ix_net_vpn_line_comm_is_deleted', table_name='net_vpn_line_communication')
    op.drop_index('ix_net_vpn_line_comm_vpn_line_id', table_name='net_vpn_line_communication')
    op.drop_table('net_vpn_line_communication')
