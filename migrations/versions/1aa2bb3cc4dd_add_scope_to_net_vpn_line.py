"""add scope to net vpn line

Revision ID: 1aa2bb3cc4dd
Revises: 0b7c9a2d1e3f
Create Date: 2025-12-20

"""

from alembic import op
import sqlalchemy as sa


revision = '1aa2bb3cc4dd'
down_revision = '0b7c9a2d1e3f'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table('net_vpn_line'):
        return

    cols = {c['name'] for c in inspector.get_columns('net_vpn_line')}
    if 'scope' not in cols:
        # Partition key for VPN policy tabs (VPN1~VPN5)
        op.add_column(
            'net_vpn_line',
            sa.Column('scope', sa.String(length=32), nullable=False, server_default=sa.text("'VPN1'")),
        )

    idx = {i['name'] for i in inspector.get_indexes('net_vpn_line') if i.get('name')}
    if 'ix_net_vpn_line_scope' not in idx:
        op.create_index('ix_net_vpn_line_scope', 'net_vpn_line', ['scope'], unique=False)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table('net_vpn_line'):
        return

    idx = {i['name'] for i in inspector.get_indexes('net_vpn_line') if i.get('name')}
    if 'ix_net_vpn_line_scope' in idx:
        op.drop_index('ix_net_vpn_line_scope', table_name='net_vpn_line')

    cols = {c['name'] for c in inspector.get_columns('net_vpn_line')}
    if 'scope' in cols:
        with op.batch_alter_table('net_vpn_line') as batch_op:
            batch_op.drop_column('scope')
