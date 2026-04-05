"""Add project_number column to prj_project

Revision ID: a2b3c4d5e6f7
Revises: f9a8b7c6d5e4
Create Date: 2026-02-28

Adds ``project_number`` (unique, nullable) text column to prj_project.
Existing rows will be backfilled with PRJ-00000000-NNNN format.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a2b3c4d5e6f7'
down_revision = 'f9a8b7c6d5e4'
branch_labels = None
depends_on = None


def _has_column(bind, table: str, column: str) -> bool:
    try:
        insp = sa.inspect(bind)
        cols = [c['name'] for c in insp.get_columns(table)]
        return column in cols
    except Exception:
        return False


def upgrade():
    bind = op.get_bind()

    if not _has_column(bind, 'prj_project', 'project_number'):
        op.add_column('prj_project', sa.Column('project_number', sa.String(20), nullable=True))

        # Create unique index
        try:
            op.execute(sa.text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_prj_project_project_number "
                "ON prj_project(project_number)"
            ))
        except Exception:
            pass

    # Backfill existing rows that have no project_number
    try:
        result = bind.execute(sa.text(
            "SELECT id, created_at FROM prj_project "
            "WHERE project_number IS NULL OR project_number LIKE 'PRJ-00000000-%' "
            "ORDER BY id"
        ))
        rows = result.fetchall()
        for idx, row in enumerate(rows, start=1):
            # Extract year from created_at (TEXT like '2026-01-15 ...')
            try:
                year = str(row[1])[:4]
                if not year.isdigit():
                    year = '2026'
            except Exception:
                year = '2026'
            pnum = 'PRJ-' + year + '-' + str(idx).zfill(5)
            bind.execute(sa.text(
                "UPDATE prj_project SET project_number = :pn WHERE id = :pid"
            ), {'pn': pnum, 'pid': row[0]})
    except Exception:
        pass


def downgrade():
    bind = op.get_bind()

    if _has_column(bind, 'prj_project', 'project_number'):
        try:
            op.execute(sa.text("DROP INDEX IF EXISTS ix_prj_project_project_number"))
        except Exception:
            pass
        op.drop_column('prj_project', 'project_number')
