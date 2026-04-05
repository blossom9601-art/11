"""add network_leased_line_log table

Revision ID: b2c4d6e8f010
Revises: 9a3c1d2e4f50
Create Date: 2025-12-28

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = 'b2c4d6e8f010'
down_revision = '9a3c1d2e4f50'
branch_labels = None
depends_on = None


def _has_index(insp, table_name: str, index_name: str) -> bool:
    try:
        for idx in insp.get_indexes(table_name) or []:
            if idx.get('name') == index_name:
                return True
    except Exception:
        return False
    return False


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    table_name = 'network_leased_line_log'

    if not insp.has_table(table_name):
        op.create_table(
            table_name,
            sa.Column('log_id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('line_id', sa.Integer(), nullable=False),
            sa.Column('line_group', sa.String(length=64), nullable=True),
            sa.Column('tab_key', sa.String(length=255), nullable=False),
            sa.Column('entity', sa.String(length=64), nullable=False),
            sa.Column('entity_id', sa.Integer(), nullable=True),
            sa.Column('action', sa.String(length=16), nullable=False),
            sa.Column('actor', sa.String(length=255), nullable=False),
            sa.Column('message', sa.Text(), nullable=True),
            sa.Column('reason', sa.Text(), nullable=True),
            sa.Column('diff_json', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        )

    # Create indexes (idempotent)
    if not _has_index(insp, table_name, f'idx_{table_name}_line_id'):
        op.create_index(f'idx_{table_name}_line_id', table_name, ['line_id'])
    if not _has_index(insp, table_name, f'idx_{table_name}_created'):
        op.create_index(f'idx_{table_name}_created', table_name, ['created_at'])


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    table_name = 'network_leased_line_log'

    if insp.has_table(table_name):
        try:
            op.drop_index(f'idx_{table_name}_created', table_name=table_name)
        except Exception:
            pass
        try:
            op.drop_index(f'idx_{table_name}_line_id', table_name=table_name)
        except Exception:
            pass
        op.drop_table(table_name)
