"""Add prj_project detail tab tables

Revision ID: c2b1a4d6e7f8
Revises: f1a2b3c4d5e6
Create Date: 2025-12-14

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c2b1a4d6e7f8'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def _create_tab_table(name: str):
    op.create_table(
        name,
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('prj_project.id', ondelete='CASCADE'), nullable=False),
        sa.Column('payload_json', sa.Text(), nullable=False),
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.Column('updated_at', sa.Text()),
        sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id')),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )
    op.create_index(f'ix_{name}_project_id', name, ['project_id'])
    op.create_index(f'ix_{name}_is_deleted', name, ['is_deleted'])


def upgrade():
    _create_tab_table('prj_tab_integrity')
    _create_tab_table('prj_tab_scope')
    _create_tab_table('prj_tab_schedule')
    _create_tab_table('prj_tab_cost')
    _create_tab_table('prj_tab_quality')
    _create_tab_table('prj_tab_resource')
    _create_tab_table('prj_tab_communication')
    _create_tab_table('prj_tab_risk')
    _create_tab_table('prj_tab_procurement')
    _create_tab_table('prj_tab_stakeholder')


def downgrade():
    for name in [
        'prj_tab_stakeholder',
        'prj_tab_procurement',
        'prj_tab_risk',
        'prj_tab_communication',
        'prj_tab_resource',
        'prj_tab_quality',
        'prj_tab_cost',
        'prj_tab_schedule',
        'prj_tab_scope',
        'prj_tab_integrity',
    ]:
        op.drop_index(f'ix_{name}_is_deleted', table_name=name)
        op.drop_index(f'ix_{name}_project_id', table_name=name)
        op.drop_table(name)
