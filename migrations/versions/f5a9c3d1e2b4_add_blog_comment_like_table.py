"""add blog_comment_like table

Revision ID: f5a9c3d1e2b4
Revises: f4d8e7c6b5a4
Create Date: 2026-01-04

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f5a9c3d1e2b4'
down_revision = 'f4d8e7c6b5a4'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'blog_comment_like',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('comment_id', sa.Integer(), sa.ForeignKey('blog_comment.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint('comment_id', 'created_by_user_id', name='uq_blog_comment_like_comment_user'),
    )
    op.create_index('ix_blog_comment_like_comment_id', 'blog_comment_like', ['comment_id'], unique=False)
    op.create_index('ix_blog_comment_like_created_by_user_id', 'blog_comment_like', ['created_by_user_id'], unique=False)


def downgrade():
    op.drop_index('ix_blog_comment_like_created_by_user_id', table_name='blog_comment_like')
    op.drop_index('ix_blog_comment_like_comment_id', table_name='blog_comment_like')
    op.drop_table('blog_comment_like')
