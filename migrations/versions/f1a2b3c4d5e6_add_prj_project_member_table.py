"""add prj_project_member table

Revision ID: f1a2b3c4d5e6
Revises: e8c1d2f3a4b5
Create Date: 2025-12-14

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f1a2b3c4d5e6'
down_revision = 'e8c1d2f3a4b5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'prj_project_member',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('prj_project.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.Column('member_role', sa.String(length=32), nullable=False, server_default='MEMBER'),
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.UniqueConstraint('project_id', 'user_id', name='uq_prj_project_member_project_user'),
    )

    op.create_index('ix_prj_project_member_project_id', 'prj_project_member', ['project_id'])
    op.create_index('ix_prj_project_member_user_id', 'prj_project_member', ['user_id'])
    op.create_index('ix_prj_project_member_member_role', 'prj_project_member', ['member_role'])
    op.create_index('ix_prj_project_member_is_deleted', 'prj_project_member', ['is_deleted'])


def downgrade():
    op.drop_index('ix_prj_project_member_is_deleted', table_name='prj_project_member')
    op.drop_index('ix_prj_project_member_member_role', table_name='prj_project_member')
    op.drop_index('ix_prj_project_member_user_id', table_name='prj_project_member')
    op.drop_index('ix_prj_project_member_project_id', table_name='prj_project_member')
    op.drop_table('prj_project_member')
