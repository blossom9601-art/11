"""add net leased line attachment table

Revision ID: c7b8a9d0e1f2
Revises: b2c4d6e8f010
Create Date: 2025-12-28

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c7b8a9d0e1f2'
down_revision = 'b2c4d6e8f010'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'net_leased_line_attachment',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column(
            'line_id',
            sa.Integer(),
            sa.ForeignKey('net_leased_line.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('file_name', sa.Text(), nullable=False),
        sa.Column('file_path', sa.Text(), nullable=True),
        sa.Column('file_size', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('mime_type', sa.Text(), nullable=True),
        sa.Column('upload_token', sa.Text(), nullable=True),
        sa.Column('created_at', sa.Text(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column(
            'created_by_user_id',
            sa.Integer(),
            sa.ForeignKey('org_user.id', ondelete='SET NULL'),
            nullable=True,
        ),
        sa.Column('updated_at', sa.Text(), nullable=True),
        sa.Column(
            'updated_by_user_id',
            sa.Integer(),
            sa.ForeignKey('org_user.id', ondelete='SET NULL'),
            nullable=True,
        ),
        sa.Column('is_deleted', sa.Integer(), server_default=sa.text('0'), nullable=False),
    )
    op.create_index('ix_net_leased_line_attachment_line_id', 'net_leased_line_attachment', ['line_id'])
    op.create_index('ix_net_leased_line_attachment_is_deleted', 'net_leased_line_attachment', ['is_deleted'])


def downgrade():
    op.drop_index('ix_net_leased_line_attachment_is_deleted', table_name='net_leased_line_attachment')
    op.drop_index('ix_net_leased_line_attachment_line_id', table_name='net_leased_line_attachment')
    op.drop_table('net_leased_line_attachment')
