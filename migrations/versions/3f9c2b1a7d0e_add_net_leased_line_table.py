"""add net_leased_line table

Revision ID: 3f9c2b1a7d0e
Revises: 1aa2bb3cc4dd
Create Date: 2025-12-20

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3f9c2b1a7d0e'
down_revision = '1aa2bb3cc4dd'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'net_leased_line',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('line_group', sa.Text(), nullable=False),
        sa.Column('org_name', sa.Text(), nullable=False),
        sa.Column('status_code', sa.Text(), nullable=False),
        sa.Column('carrier_code', sa.Text(), nullable=True),
        sa.Column('protocol_code', sa.Text(), nullable=True),
        sa.Column('management_owner', sa.Text(), nullable=True),
        sa.Column('line_no', sa.Text(), nullable=False),
        sa.Column('line_name', sa.Text(), nullable=True),
        sa.Column('business_purpose', sa.Text(), nullable=True),
        sa.Column('speed_label', sa.Text(), nullable=True),
        sa.Column('opened_date', sa.Text(), nullable=True),
        sa.Column('closed_date', sa.Text(), nullable=True),
        sa.Column('dr_line_no', sa.Text(), nullable=True),
        sa.Column('device_name', sa.Text(), nullable=True),
        sa.Column('comm_device', sa.Text(), nullable=True),
        sa.Column('slot_no', sa.Integer(), nullable=True),
        sa.Column('port_no', sa.Text(), nullable=True),
        sa.Column('child_device_name', sa.Text(), nullable=True),
        sa.Column('child_port_no', sa.Text(), nullable=True),
        sa.Column('our_jurisdiction', sa.Text(), nullable=True),
        sa.Column('org_jurisdiction', sa.Text(), nullable=True),
        sa.Column('remark', sa.Text(), nullable=True),
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.Column('updated_at', sa.Text(), nullable=True),
        sa.Column('updated_by', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=True),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.UniqueConstraint('line_group', 'line_no', name='uq_net_leased_line_group_no'),
    )

    op.create_index('ix_net_leased_line_line_group', 'net_leased_line', ['line_group'])
    op.create_index('ix_net_leased_line_org_name', 'net_leased_line', ['org_name'])
    op.create_index('ix_net_leased_line_line_no', 'net_leased_line', ['line_no'])
    op.create_index('ix_net_leased_line_is_deleted', 'net_leased_line', ['is_deleted'])


def downgrade():
    op.drop_index('ix_net_leased_line_is_deleted', table_name='net_leased_line')
    op.drop_index('ix_net_leased_line_line_no', table_name='net_leased_line')
    op.drop_index('ix_net_leased_line_org_name', table_name='net_leased_line')
    op.drop_index('ix_net_leased_line_line_group', table_name='net_leased_line')
    op.drop_table('net_leased_line')
