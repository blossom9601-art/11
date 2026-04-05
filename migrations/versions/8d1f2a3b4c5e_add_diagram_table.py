"""add diagram table

Revision ID: 8d1f2a3b4c5e
Revises: 6b1e0c3a9f12
Create Date: 2025-12-28

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8d1f2a3b4c5e'
down_revision = '6b1e0c3a9f12'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'diagram',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('line_id', sa.Integer(), sa.ForeignKey('net_leased_line.id', ondelete='CASCADE'), nullable=False),
        sa.Column('file_path', sa.Text(), nullable=True),
        sa.Column('original_name', sa.Text(), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('content_type', sa.Text(), nullable=True),
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('updated_at', sa.Text(), nullable=True),
        sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.UniqueConstraint('line_id', name='uq_diagram_line_id'),
    )

    op.create_index('ix_diagram_line_id', 'diagram', ['line_id'])
    op.create_index('ix_diagram_is_deleted', 'diagram', ['is_deleted'])


def downgrade():
    op.drop_index('ix_diagram_is_deleted', table_name='diagram')
    op.drop_index('ix_diagram_line_id', table_name='diagram')
    op.drop_table('diagram')
