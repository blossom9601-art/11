"""Merge backup policy branch heads.

Revision ID: e3b4c5d6f7a8
Revises: c7b8a9d0e1f2, 1b2c3d4e5f67
Create Date: 2026-01-01

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = 'e3b4c5d6f7a8'
down_revision = ('c7b8a9d0e1f2', '1b2c3d4e5f67')
branch_labels = None
depends_on = None


def upgrade():
    # Merge only.
    pass


def downgrade():
    # Merge only.
    pass
