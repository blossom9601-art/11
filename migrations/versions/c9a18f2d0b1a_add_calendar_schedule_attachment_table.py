"""add calendar schedule attachment table

Revision ID: c9a18f2d0b1a
Revises: f7a1c2d3e4b5
Create Date: 2025-12-14

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c9a18f2d0b1a'
down_revision = 'f7a1c2d3e4b5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'cal_schedule_attachment',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('schedule_id', sa.Integer(), nullable=False),
        sa.Column('stored_name', sa.String(length=255), nullable=False),
        sa.Column('original_name', sa.String(length=255), nullable=False),
        sa.Column('content_type', sa.String(length=255), nullable=True),
        sa.Column('size_bytes', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['schedule_id'], ['cal_schedule.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['org_user.id']),
    )
    op.create_index(
        'ix_cal_schedule_attachment_schedule_id',
        'cal_schedule_attachment',
        ['schedule_id'],
        unique=False,
    )


def downgrade():
    op.drop_index('ix_cal_schedule_attachment_schedule_id', table_name='cal_schedule_attachment')
    op.drop_table('cal_schedule_attachment')
