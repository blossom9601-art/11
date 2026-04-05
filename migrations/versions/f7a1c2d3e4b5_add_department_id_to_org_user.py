"""add department_id to org_user

Revision ID: f7a1c2d3e4b5
Revises: a4f7d9b8c6e7
Create Date: 2025-12-14 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f7a1c2d3e4b5'
down_revision = 'a4f7d9b8c6e7'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    existing_cols = {c['name'] for c in inspector.get_columns('org_user')}
    if 'department_id' not in existing_cols:
        op.add_column('org_user', sa.Column('department_id', sa.Integer(), nullable=True))

    existing_indexes = {i['name'] for i in inspector.get_indexes('org_user') if i.get('name')}
    if 'ix_org_user_department_id' not in existing_indexes:
        op.create_index('ix_org_user_department_id', 'org_user', ['department_id'], unique=False)

    if bind.dialect.name != 'sqlite':
        existing_fks = {fk.get('name') for fk in inspector.get_foreign_keys('org_user')}
        if 'fk_org_user_department_id' not in existing_fks:
            op.create_foreign_key(
                'fk_org_user_department_id',
                'org_user',
                'org_department',
                ['department_id'],
                ['id'],
            )

    org_department = sa.table(
        'org_department',
        sa.column('id', sa.Integer()),
        sa.column('dept_code', sa.String()),
        sa.column('dept_name', sa.String()),
    )
    org_user = sa.table(
        'org_user',
        sa.column('id', sa.Integer()),
        sa.column('department', sa.String()),
        sa.column('department_id', sa.Integer()),
    )

    dept_rows = bind.execute(sa.select(org_department.c.id, org_department.c.dept_code, org_department.c.dept_name)).fetchall()
    token_to_id = {}
    for dept_id, dept_code, dept_name in dept_rows:
        if dept_code:
            token_to_id[str(dept_code).strip().lower()] = int(dept_id)
        if dept_name:
            token_to_id[str(dept_name).strip().lower()] = int(dept_id)

    user_rows = bind.execute(
        sa.select(org_user.c.id, org_user.c.department)
        .where(org_user.c.department_id.is_(None))
        .where(org_user.c.department.isnot(None))
    ).fetchall()

    for user_id, dept_token in user_rows:
        token = (dept_token or '').strip().lower()
        if not token:
            continue
        resolved = token_to_id.get(token)
        if not resolved:
            continue
        bind.execute(
            org_user.update()
            .where(org_user.c.id == int(user_id))
            .values(department_id=int(resolved))
        )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if bind.dialect.name != 'sqlite':
        existing_fks = {fk.get('name') for fk in inspector.get_foreign_keys('org_user')}
        if 'fk_org_user_department_id' in existing_fks:
            op.drop_constraint('fk_org_user_department_id', 'org_user', type_='foreignkey')

    existing_indexes = {i['name'] for i in inspector.get_indexes('org_user') if i.get('name')}
    if 'ix_org_user_department_id' in existing_indexes:
        op.drop_index('ix_org_user_department_id', table_name='org_user')

    existing_cols = {c['name'] for c in inspector.get_columns('org_user')}
    if 'department_id' in existing_cols:
        op.drop_column('org_user', 'department_id')
