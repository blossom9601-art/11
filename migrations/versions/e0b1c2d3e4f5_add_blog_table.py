"""add blog table

Revision ID: e0b1c2d3e4f5
Revises: d4b3c2a1f0e9
Create Date: 2026-01-03

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e0b1c2d3e4f5'
down_revision = 'd4b3c2a1f0e9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'blog',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('content_html', sa.Text(), nullable=False),
        sa.Column('tags', sa.Text(), nullable=True),
        sa.Column('image_data_url', sa.Text(), nullable=True),
        sa.Column('attachments_json', sa.Text(), nullable=True),
        sa.Column('author', sa.String(length=120), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_blog_created_at', 'blog', ['created_at'], unique=False)


def downgrade():
    op.drop_index('ix_blog_created_at', table_name='blog')
    op.drop_table('blog')
