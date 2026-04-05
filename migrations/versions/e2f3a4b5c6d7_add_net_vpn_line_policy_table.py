"""add net_vpn_line_policy table

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-02-22 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'e2f3a4b5c6d7'
down_revision = 'd1e2f3a4b5c6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'net_vpn_line_policy',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('vpn_line_id', sa.Integer, sa.ForeignKey('net_vpn_line.id', ondelete='CASCADE'), nullable=False, unique=True),

        # Hardware
        sa.Column('model_self', sa.String(255)),
        sa.Column('model_org', sa.String(255)),
        sa.Column('fw_self', sa.String(255)),
        sa.Column('fw_org', sa.String(255)),

        # IPSEC SA
        sa.Column('ipsec_life_self', sa.String(255)),
        sa.Column('ipsec_life_org', sa.String(255)),
        sa.Column('mode_self', sa.String(255)),
        sa.Column('mode_org', sa.String(255)),
        sa.Column('method_self', sa.String(255)),
        sa.Column('method_org', sa.String(255)),
        sa.Column('pfs_self', sa.String(255)),
        sa.Column('pfs_org', sa.String(255)),
        sa.Column('retrans_self', sa.String(255)),
        sa.Column('retrans_org', sa.String(255)),
        sa.Column('cipher_proto_self', sa.String(255)),
        sa.Column('cipher_proto_org', sa.String(255)),
        sa.Column('cipher_algo_self', sa.String(255)),
        sa.Column('cipher_algo_org', sa.String(255)),
        sa.Column('auth_algo_self', sa.String(255)),
        sa.Column('auth_algo_org', sa.String(255)),

        # ISAKMP SA
        sa.Column('isakmp_life_self', sa.String(255)),
        sa.Column('isakmp_life_org', sa.String(255)),
        sa.Column('isakmp_mode_self', sa.String(255)),
        sa.Column('isakmp_mode_org', sa.String(255)),
        sa.Column('ike_auth_self', sa.String(255)),
        sa.Column('ike_auth_org', sa.String(255)),
        sa.Column('ike_time_self', sa.String(255)),
        sa.Column('ike_time_org', sa.String(255)),
        sa.Column('psk_self', sa.String(255)),
        sa.Column('psk_org', sa.String(255)),
        sa.Column('dpd_self', sa.String(255)),
        sa.Column('dpd_org', sa.String(255)),
        sa.Column('isakmp_cipher_self', sa.String(255)),
        sa.Column('isakmp_cipher_org', sa.String(255)),
        sa.Column('hash_algo_self', sa.String(255)),
        sa.Column('hash_algo_org', sa.String(255)),
        sa.Column('dh_group_self', sa.String(255)),
        sa.Column('dh_group_org', sa.String(255)),
        sa.Column('local_id_type_self', sa.String(255)),
        sa.Column('local_id_type_org', sa.String(255)),
        sa.Column('local_id_active_self', sa.String(255)),
        sa.Column('local_id_active_org', sa.String(255)),
        sa.Column('local_id_standby_self', sa.String(255)),
        sa.Column('local_id_standby_org', sa.String(255)),

        # CID
        sa.Column('cid_active_self', sa.String(255)),
        sa.Column('cid_active_org', sa.String(255)),
        sa.Column('cid_standby_self', sa.String(255)),
        sa.Column('cid_standby_org', sa.String(255)),

        # IP
        sa.Column('peer_ip_self', sa.String(255)),
        sa.Column('peer_ip_org', sa.String(255)),

        # 비고
        sa.Column('note_self', sa.Text),
        sa.Column('note_org', sa.Text),

        # audit
        sa.Column('created_at', sa.Text, nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_user_id', sa.Integer, sa.ForeignKey('org_user.id', ondelete='SET NULL')),
        sa.Column('updated_at', sa.Text),
        sa.Column('updated_by_user_id', sa.Integer, sa.ForeignKey('org_user.id', ondelete='SET NULL')),
        sa.Column('is_deleted', sa.Integer, nullable=False, server_default=sa.text('0')),
    )
    op.create_index('ix_net_vpn_line_policy_vpn_line_id', 'net_vpn_line_policy', ['vpn_line_id'])
    op.create_index('ix_net_vpn_line_policy_is_deleted', 'net_vpn_line_policy', ['is_deleted'])


def downgrade():
    op.drop_index('ix_net_vpn_line_policy_is_deleted', table_name='net_vpn_line_policy')
    op.drop_index('ix_net_vpn_line_policy_vpn_line_id', table_name='net_vpn_line_policy')
    op.drop_table('net_vpn_line_policy')
