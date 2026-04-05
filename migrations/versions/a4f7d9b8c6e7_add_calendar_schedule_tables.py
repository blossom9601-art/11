"""add calendar schedule tables

Revision ID: a4f7d9b8c6e7
Revises: f2ab34c56d78
Create Date: 2025-12-08 00:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'a4f7d9b8c6e7'
down_revision = 'f2ab34c56d78'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'cal_schedule',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('start_datetime', sa.DateTime(), nullable=False),
        sa.Column('end_datetime', sa.DateTime(), nullable=False),
        sa.Column('is_all_day', sa.Boolean(), server_default=sa.text('0'), nullable=False),
        sa.Column('location', sa.String(length=255)),
        sa.Column('event_type', sa.String(length=50), nullable=False),
        sa.Column('owner_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.Column('owner_dept_id', sa.Integer(), sa.ForeignKey('org_department.id')),
        sa.Column('share_scope', sa.String(length=20), server_default=sa.text("'ALL'"), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('color_code', sa.String(length=32)),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id')),
        sa.Column('is_deleted', sa.Boolean(), server_default=sa.text('0'), nullable=False),
    )
    op.create_index('ix_cal_schedule_range', 'cal_schedule', ['start_datetime', 'end_datetime'])
    op.create_index('ix_cal_schedule_owner_user_id', 'cal_schedule', ['owner_user_id'])
    op.create_index('ix_cal_schedule_owner_dept_id', 'cal_schedule', ['owner_dept_id'])
    op.create_index('ix_cal_schedule_share_scope', 'cal_schedule', ['share_scope'])

    op.create_table(
        'cal_schedule_share_user',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('schedule_id', sa.Integer(), sa.ForeignKey('cal_schedule.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('can_edit', sa.Boolean(), server_default=sa.text('0'), nullable=False),
        sa.Column('notification_enabled', sa.Boolean(), server_default=sa.text('1'), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.UniqueConstraint('schedule_id', 'user_id', name='uq_cal_schedule_share_user'),
    )
    op.create_index('ix_cal_schedule_share_user_user_id', 'cal_schedule_share_user', ['user_id'])

    op.create_table(
        'cal_schedule_share_dept',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('schedule_id', sa.Integer(), sa.ForeignKey('cal_schedule.id', ondelete='CASCADE'), nullable=False),
        sa.Column('dept_id', sa.Integer(), sa.ForeignKey('org_department.id'), nullable=False),
        sa.Column('can_edit', sa.Boolean(), server_default=sa.text('0'), nullable=False),
        sa.Column('notification_enabled', sa.Boolean(), server_default=sa.text('1'), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.UniqueConstraint('schedule_id', 'dept_id', name='uq_cal_schedule_share_dept'),
    )
    op.create_index('ix_cal_schedule_share_dept_dept_id', 'cal_schedule_share_dept', ['dept_id'])


def downgrade():
    op.drop_index('ix_cal_schedule_share_dept_dept_id', table_name='cal_schedule_share_dept')
    op.drop_table('cal_schedule_share_dept')
    op.drop_index('ix_cal_schedule_share_user_user_id', table_name='cal_schedule_share_user')
    op.drop_table('cal_schedule_share_user')
    op.drop_index('ix_cal_schedule_share_scope', table_name='cal_schedule')
    op.drop_index('ix_cal_schedule_owner_dept_id', table_name='cal_schedule')
    op.drop_index('ix_cal_schedule_owner_user_id', table_name='cal_schedule')
    op.drop_index('ix_cal_schedule_range', table_name='cal_schedule')
    op.drop_table('cal_schedule')
