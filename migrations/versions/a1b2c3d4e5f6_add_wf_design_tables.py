"""add wf_design and wf_design_version tables

Revision ID: a1b2c3d4e5f6
Revises: None
Create Date: 2025-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'a1b2c3d4e5f6'
down_revision = None
branch_labels = ('wf_design',)
depends_on = None


def upgrade():
    op.create_table(
        'wf_design',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text, server_default=''),
        sa.Column('owner_user_id', sa.Integer, sa.ForeignKey('org_user.id'), nullable=True),
        sa.Column('status', sa.String(20), server_default='draft', nullable=False),
        sa.Column('latest_version', sa.Integer, server_default='0', nullable=False),
        sa.Column('thumbnail', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column('is_deleted', sa.Integer, server_default='0', nullable=False),
    )
    op.create_index('ix_wf_design_owner', 'wf_design', ['owner_user_id'])
    op.create_index('ix_wf_design_status', 'wf_design', ['status'])
    op.create_index('ix_wf_design_deleted', 'wf_design', ['is_deleted'])

    op.create_table(
        'wf_design_version',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('workflow_id', sa.String(36),
                  sa.ForeignKey('wf_design.id', ondelete='CASCADE'), nullable=False),
        sa.Column('version', sa.Integer, nullable=False),
        sa.Column('definition_json', sa.Text, server_default='{}'),
        sa.Column('created_by', sa.Integer, sa.ForeignKey('org_user.id'), nullable=True),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index('ix_wf_design_version_wf', 'wf_design_version', ['workflow_id'])


def downgrade():
    op.drop_table('wf_design_version')
    op.drop_table('wf_design')
