"""drop hw_storage_basic sync fields

Revision ID: c0ffee12345c
Revises: c0ffee12345b
Create Date: 2026-01-28

"""

from alembic import op
import sqlalchemy as sa


revision = 'c0ffee12345c'
down_revision = 'c0ffee12345b'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table('hw_storage_basic'):
        return

    cols = {c['name'] for c in inspector.get_columns('hw_storage_basic')}
    to_drop = [c for c in ('sync_enabled', 'sync_method', 'sync_storage', 'phone') if c in cols]
    if not to_drop:
        return

    with op.batch_alter_table('hw_storage_basic') as batch_op:
        for c in to_drop:
            batch_op.drop_column(c)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table('hw_storage_basic'):
        return

    cols = {c['name'] for c in inspector.get_columns('hw_storage_basic')}

    with op.batch_alter_table('hw_storage_basic') as batch_op:
        if 'sync_enabled' not in cols:
            batch_op.add_column(sa.Column('sync_enabled', sa.String(length=1), nullable=True))
        if 'sync_method' not in cols:
            batch_op.add_column(sa.Column('sync_method', sa.Text(), nullable=True))
        if 'sync_storage' not in cols:
            batch_op.add_column(sa.Column('sync_storage', sa.Text(), nullable=True))
        if 'phone' not in cols:
            batch_op.add_column(sa.Column('phone', sa.Text(), nullable=True))
