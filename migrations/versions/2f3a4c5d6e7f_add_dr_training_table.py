"""Add dr_training table.

Revision ID: 2f3a4c5d6e7f
Revises: e3b4c5d6f7a8
Create Date: 2026-01-01

"""

from alembic import op
import sqlalchemy as sa


revision = '2f3a4c5d6e7f'
down_revision = 'e3b4c5d6f7a8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'dr_training',
        sa.Column('training_id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('training_year', sa.Integer(), nullable=False),
        sa.Column('training_date', sa.Text(), nullable=False),
        sa.Column('training_name', sa.String(length=200), nullable=False),
        sa.Column('training_type', sa.String(length=30), nullable=False),
        sa.Column('training_status', sa.String(length=20), nullable=False),
        sa.Column('training_result', sa.String(length=20), nullable=False),
        sa.Column('target_system_count', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('participant_count', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('participant_org', sa.String(length=200), nullable=True),
        sa.Column('recovery_time_minutes', sa.Integer(), nullable=True),
        sa.Column('recovery_time_text', sa.String(length=50), nullable=True),
        sa.Column('training_remark', sa.Text(), nullable=True),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=True),
        sa.Column('updated_at', sa.Text(), nullable=True),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )

    op.create_index('idx_dr_training_year_date', 'dr_training', ['training_year', 'training_date'])
    op.create_index('idx_dr_training_status', 'dr_training', ['training_status'])
    op.create_index('idx_dr_training_result', 'dr_training', ['training_result'])
    op.create_index('idx_dr_training_deleted', 'dr_training', ['is_deleted'])


def downgrade():
    op.drop_index('idx_dr_training_deleted', table_name='dr_training')
    op.drop_index('idx_dr_training_result', table_name='dr_training')
    op.drop_index('idx_dr_training_status', table_name='dr_training')
    op.drop_index('idx_dr_training_year_date', table_name='dr_training')
    op.drop_table('dr_training')
