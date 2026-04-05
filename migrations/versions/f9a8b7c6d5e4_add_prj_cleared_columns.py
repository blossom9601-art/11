"""Add cleared column to prj_project and prj_project_member

Revision ID: d1e2f3a4b5c6
Revises: c0ffee123456
Create Date: 2026-02-25

Adds ``cleared`` integer column (default 0) to both tables so that users
can hide completed projects from their kanban board via the "비우기" button.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f9a8b7c6d5e4'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def _col_exists(table: str, column: str) -> bool:
    """Return True if *column* already exists in *table* (SQLite safe)."""
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = [c['name'] for c in insp.get_columns(table)]
    return column in cols


def upgrade():
    if not _col_exists('prj_project', 'cleared'):
        with op.batch_alter_table('prj_project') as batch_op:
            batch_op.add_column(sa.Column('cleared', sa.Integer(), nullable=False, server_default=sa.text('0')))

    if not _col_exists('prj_project_member', 'cleared'):
        with op.batch_alter_table('prj_project_member') as batch_op:
            batch_op.add_column(sa.Column('cleared', sa.Integer(), nullable=False, server_default=sa.text('0')))


def downgrade():
    with op.batch_alter_table('prj_project_member') as batch_op:
        batch_op.drop_column('cleared')

    with op.batch_alter_table('prj_project') as batch_op:
        batch_op.drop_column('cleared')
