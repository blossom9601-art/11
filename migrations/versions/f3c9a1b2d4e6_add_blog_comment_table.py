"""add blog_comment table

Revision ID: f3c9a1b2d4e6
Revises: e0b1c2d3e4f5
Create Date: 2026-01-04

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f3c9a1b2d4e6'
down_revision = 'e0b1c2d3e4f5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'blog_comment',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('post_id', sa.Integer(), sa.ForeignKey('blog.id', ondelete='CASCADE'), nullable=False),
        sa.Column('parent_id', sa.Integer(), sa.ForeignKey('blog_comment.id', ondelete='CASCADE'), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )
    op.create_index('ix_blog_comment_post_id', 'blog_comment', ['post_id'], unique=False)
    op.create_index('ix_blog_comment_parent_id', 'blog_comment', ['parent_id'], unique=False)
    op.create_index('ix_blog_comment_created_by_user_id', 'blog_comment', ['created_by_user_id'], unique=False)
    op.create_index('ix_blog_comment_created_at', 'blog_comment', ['created_at'], unique=False)
    op.create_index('ix_blog_comment_is_deleted', 'blog_comment', ['is_deleted'], unique=False)


def downgrade():
    op.drop_index('ix_blog_comment_is_deleted', table_name='blog_comment')
    op.drop_index('ix_blog_comment_created_at', table_name='blog_comment')
    op.drop_index('ix_blog_comment_created_by_user_id', table_name='blog_comment')
    op.drop_index('ix_blog_comment_parent_id', table_name='blog_comment')
    op.drop_index('ix_blog_comment_post_id', table_name='blog_comment')
    op.drop_table('blog_comment')
