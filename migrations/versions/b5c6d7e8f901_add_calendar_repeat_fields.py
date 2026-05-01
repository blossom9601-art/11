"""add calendar repeat fields

Revision ID: b5c6d7e8f901
Revises: a2b3c4d5e6f7
Create Date: 2026-05-01

"""
from alembic import op
import sqlalchemy as sa


revision = 'b5c6d7e8f901'
down_revision = 'a2b3c4d5e6f7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('cal_schedule', sa.Column('repeat_type', sa.String(length=20), server_default=sa.text("'none'"), nullable=False))
    op.add_column('cal_schedule', sa.Column('repeat_rule', sa.Text(), nullable=True))
    op.create_index('ix_cal_schedule_repeat_type', 'cal_schedule', ['repeat_type'], unique=False)


def downgrade():
    op.drop_index('ix_cal_schedule_repeat_type', table_name='cal_schedule')
    op.drop_column('cal_schedule', 'repeat_rule')
    op.drop_column('cal_schedule', 'repeat_type')
