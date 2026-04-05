"""add wrk_report_comment table

Revision ID: f8b2c3d4e5f6
Revises: f7a1c2d3e4b5
Create Date: 2025-12-17 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f8b2c3d4e5f6'
down_revision = 'f7a1c2d3e4b5'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table('wrk_report_comment'):
        op.create_table(
            'wrk_report_comment',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('report_id', sa.Integer(), sa.ForeignKey('wrk_report.id', ondelete='CASCADE'), nullable=False),
            sa.Column('text', sa.Text(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='SET NULL'), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='SET NULL'), nullable=True),
            sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
        )

    existing_indexes = {i['name'] for i in inspector.get_indexes('wrk_report_comment') if i.get('name')} if inspector.has_table('wrk_report_comment') else set()

    if 'ix_wrk_report_comment_report_id' not in existing_indexes:
        op.create_index('ix_wrk_report_comment_report_id', 'wrk_report_comment', ['report_id'], unique=False)
    if 'ix_wrk_report_comment_created_by_user_id' not in existing_indexes:
        op.create_index('ix_wrk_report_comment_created_by_user_id', 'wrk_report_comment', ['created_by_user_id'], unique=False)
    if 'ix_wrk_report_comment_is_deleted' not in existing_indexes:
        op.create_index('ix_wrk_report_comment_is_deleted', 'wrk_report_comment', ['is_deleted'], unique=False)
    if 'ix_wrk_report_comment_created_at' not in existing_indexes:
        op.create_index('ix_wrk_report_comment_created_at', 'wrk_report_comment', ['created_at'], unique=False)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table('wrk_report_comment'):
        existing_indexes = {i['name'] for i in inspector.get_indexes('wrk_report_comment') if i.get('name')}
        for idx in [
            'ix_wrk_report_comment_created_at',
            'ix_wrk_report_comment_is_deleted',
            'ix_wrk_report_comment_created_by_user_id',
            'ix_wrk_report_comment_report_id',
        ]:
            if idx in existing_indexes:
                op.drop_index(idx, table_name='wrk_report_comment')
        op.drop_table('wrk_report_comment')
