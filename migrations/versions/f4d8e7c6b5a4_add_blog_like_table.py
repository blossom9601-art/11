"""add blog_like table

Revision ID: f4d8e7c6b5a4
Revises: f3c9a1b2d4e6
Create Date: 2026-01-04

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f4d8e7c6b5a4'
down_revision = 'f3c9a1b2d4e6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'blog_like',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('post_id', sa.Integer(), sa.ForeignKey('blog.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint('post_id', 'created_by_user_id', name='uq_blog_like_post_user'),
    )
    op.create_index('ix_blog_like_post_id', 'blog_like', ['post_id'], unique=False)
    op.create_index('ix_blog_like_created_by_user_id', 'blog_like', ['created_by_user_id'], unique=False)


def downgrade():
    op.drop_index('ix_blog_like_created_by_user_id', table_name='blog_like')
    op.drop_index('ix_blog_like_post_id', table_name='blog_like')
    op.drop_table('blog_like')
