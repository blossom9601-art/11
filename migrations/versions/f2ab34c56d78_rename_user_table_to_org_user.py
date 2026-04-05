"""rename user table to org_user

Revision ID: f2ab34c56d78
Revises: e1f2a3b4c5d6
Create Date: 2025-12-08 00:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'f2ab34c56d78'
down_revision = 'e1f2a3b4c5d6'
branch_labels = None
depends_on = None


def upgrade():
    # Drop the old index before renaming the table to avoid dangling metadata
    op.drop_index('ix_user_emp_no', table_name='user')
    op.rename_table('user', 'org_user')
    op.create_index('ix_org_user_emp_no', 'org_user', ['emp_no'], unique=True)


def downgrade():
    op.drop_index('ix_org_user_emp_no', table_name='org_user')
    op.rename_table('org_user', 'user')
    op.create_index('ix_user_emp_no', 'user', ['emp_no'], unique=True)
