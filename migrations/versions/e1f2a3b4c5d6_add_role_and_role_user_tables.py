"""add role and role_user tables

Revision ID: e1f2a3b4c5d6
Revises: dcd48bd980e7
Create Date: 2025-11-23 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'e1f2a3b4c5d6'
down_revision = 'dcd48bd980e7'
branch_labels = None
depends_on = None

def upgrade():
    # SQLite does not allow non-constant expressions like (datetime("now")) as DEFAULT in this context.
    # Use CURRENT_TIMESTAMP which is supported and equivalent for created_at/updated_at initial values.
    op.create_table(
        'role',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(length=128), nullable=False, unique=True, index=True),
        sa.Column('description', sa.String(length=512)),
        sa.Column('dashboard_read', sa.Boolean(), server_default=sa.text('0')),
        sa.Column('dashboard_write', sa.Boolean(), server_default=sa.text('0')),
        sa.Column('hardware_read', sa.Boolean(), server_default=sa.text('0')),
        sa.Column('hardware_write', sa.Boolean(), server_default=sa.text('0')),
        sa.Column('software_read', sa.Boolean(), server_default=sa.text('0')),
        sa.Column('software_write', sa.Boolean(), server_default=sa.text('0')),
        sa.Column('governance_read', sa.Boolean(), server_default=sa.text('0')),
        sa.Column('governance_write', sa.Boolean(), server_default=sa.text('0')),
        sa.Column('datacenter_read', sa.Boolean(), server_default=sa.text('0')),
        sa.Column('datacenter_write', sa.Boolean(), server_default=sa.text('0')),
        sa.Column('cost_read', sa.Boolean(), server_default=sa.text('0')),
        sa.Column('cost_write', sa.Boolean(), server_default=sa.text('0')),
        sa.Column('project_read', sa.Boolean(), server_default=sa.text('0')),
        sa.Column('project_write', sa.Boolean(), server_default=sa.text('0')),
        sa.Column('category_read', sa.Boolean(), server_default=sa.text('0')),
        sa.Column('category_write', sa.Boolean(), server_default=sa.text('0')),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_table(
        'role_user',
        sa.Column('role_id', sa.Integer(), sa.ForeignKey('role.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('mapped_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
    )


def downgrade():
    op.drop_table('role_user')
    op.drop_table('role')
