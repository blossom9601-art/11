"""add motto to org_user

Revision ID: 5e6f7a8b9c0d
Revises: 3a7d1c9e4b21
Create Date: 2026-01-02 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5e6f7a8b9c0d'
down_revision = '3a7d1c9e4b21'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    existing_cols = {c['name'] for c in inspector.get_columns('org_user')}
    if 'motto' not in existing_cols:
        op.add_column('org_user', sa.Column('motto', sa.Text(), nullable=True))


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    existing_cols = {c['name'] for c in inspector.get_columns('org_user')}
    if 'motto' in existing_cols:
        op.drop_column('org_user', 'motto')
