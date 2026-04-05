"""add ticker_message and ticker_config tables

Revision ID: a1b2c3d4e5f6
Revises: d1e2f3a4b5c6
Create Date: 2026-02-22 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'a1b2c3d4e5f6'
down_revision = ('e2f3a4b5c6d7', 'c0ffee12345d')
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'ticker_message',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('severity', sa.String(length=16), nullable=False, server_default=sa.text("'info'")),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.Text(), nullable=True),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )
    op.create_index('ix_ticker_message_sort_order', 'ticker_message', ['sort_order'], unique=False)
    op.create_index('ix_ticker_message_is_deleted', 'ticker_message', ['is_deleted'], unique=False)

    op.create_table(
        'ticker_config',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('speed', sa.Integer(), nullable=False, server_default=sa.text('35')),
        sa.Column('paused', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('updated_at', sa.Text(), nullable=True),
    )

    # Insert default config row (singleton)
    op.execute("INSERT INTO ticker_config (id, speed, paused) VALUES (1, 35, 0)")


def downgrade():
    op.drop_index('ix_ticker_message_is_deleted', table_name='ticker_message')
    op.drop_index('ix_ticker_message_sort_order', table_name='ticker_message')
    op.drop_table('ticker_message')
    op.drop_table('ticker_config')
