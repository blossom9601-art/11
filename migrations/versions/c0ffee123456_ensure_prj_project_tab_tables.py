"""Ensure prj_project + tab tables exist

Revision ID: c0ffee123456
Revises: b3c4d5e6f701
Create Date: 2026-01-04

This migration backfills project/tab tables for environments where the older
project migrations exist in the repo but are not connected to the active
Alembic revision chain.

It is intentionally idempotent: it checks for table/index existence before
creating.

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c0ffee123456'
down_revision = 'b3c4d5e6f701'
branch_labels = None
depends_on = None


def _has_table(bind, name: str) -> bool:
    try:
        insp = sa.inspect(bind)
        return bool(insp.has_table(name))
    except Exception:
        return False


def _safe_exec(sql: str) -> None:
    try:
        op.execute(sa.text(sql))
    except Exception:
        # Best-effort for cross-db compatibility.
        pass


def _ensure_index_sqlite(table: str, index: str, cols_sql: str) -> None:
    # SQLite supports IF NOT EXISTS; other DBs may not, so wrap in try.
    _safe_exec(f'CREATE INDEX IF NOT EXISTS {index} ON {table}({cols_sql})')


def _ensure_prj_project(bind) -> None:
    if _has_table(bind, 'prj_project'):
        return

    op.create_table(
        'prj_project',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('project_name', sa.Text(), nullable=False),
        sa.Column('project_type', sa.Text(), nullable=False),
        sa.Column('owner_dept_id', sa.Integer(), sa.ForeignKey('org_department.id'), nullable=False),
        sa.Column('manager_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.Column('priority', sa.Text(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.Text(), nullable=False),
        sa.Column('budget_amount', sa.Integer(), nullable=True),
        sa.Column('start_date', sa.Text(), nullable=True),
        sa.Column('expected_end_date', sa.Text(), nullable=True),
        sa.Column('task_count_cached', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('progress_percent', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.Column('updated_at', sa.Text(), nullable=True),
        sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=True),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )

    _ensure_index_sqlite('prj_project', 'ix_prj_project_is_deleted', 'is_deleted')
    _ensure_index_sqlite('prj_project', 'ix_prj_project_status', 'status')
    _ensure_index_sqlite('prj_project', 'ix_prj_project_owner_dept_id', 'owner_dept_id')
    _ensure_index_sqlite('prj_project', 'ix_prj_project_manager_user_id', 'manager_user_id')
    _ensure_index_sqlite('prj_project', 'ix_prj_project_created_by_user_id', 'created_by_user_id')


def _ensure_prj_project_member(bind) -> None:
    if _has_table(bind, 'prj_project_member'):
        return

    op.create_table(
        'prj_project_member',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('prj_project.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.Column('member_role', sa.String(length=32), nullable=False, server_default=sa.text("'MEMBER'")),
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.UniqueConstraint('project_id', 'user_id', name='uq_prj_project_member_project_user'),
    )

    _ensure_index_sqlite('prj_project_member', 'ix_prj_project_member_project_id', 'project_id')
    _ensure_index_sqlite('prj_project_member', 'ix_prj_project_member_user_id', 'user_id')
    _ensure_index_sqlite('prj_project_member', 'ix_prj_project_member_member_role', 'member_role')
    _ensure_index_sqlite('prj_project_member', 'ix_prj_project_member_is_deleted', 'is_deleted')


def _ensure_tab_table(bind, name: str) -> None:
    if _has_table(bind, name):
        return

    op.create_table(
        name,
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('prj_project.id', ondelete='CASCADE'), nullable=False),
        sa.Column('payload_json', sa.Text(), nullable=False),
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.Column('updated_at', sa.Text(), nullable=True),
        sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=True),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )

    _ensure_index_sqlite(name, f'ix_{name}_project_id', 'project_id')
    _ensure_index_sqlite(name, f'ix_{name}_is_deleted', 'is_deleted')


def upgrade():
    bind = op.get_bind()

    # Base tables
    _ensure_prj_project(bind)
    _ensure_prj_project_member(bind)

    # Tab payload tables
    for tab in [
        'prj_tab_integrity',
        'prj_tab_scope',
        'prj_tab_schedule',
        'prj_tab_cost',
        'prj_tab_quality',
        'prj_tab_resource',
        'prj_tab_communication',
        'prj_tab_risk',
        'prj_tab_procurement',
        'prj_tab_stakeholder',
    ]:
        _ensure_tab_table(bind, tab)


def downgrade():
    # Best-effort reverse; keep it conditional for safety.
    bind = op.get_bind()

    for tab in [
        'prj_tab_stakeholder',
        'prj_tab_procurement',
        'prj_tab_risk',
        'prj_tab_communication',
        'prj_tab_resource',
        'prj_tab_quality',
        'prj_tab_cost',
        'prj_tab_schedule',
        'prj_tab_scope',
        'prj_tab_integrity',
    ]:
        if _has_table(bind, tab):
            # Drop indexes if present (SQLite best-effort)
            _safe_exec(f'DROP INDEX IF EXISTS ix_{tab}_is_deleted')
            _safe_exec(f'DROP INDEX IF EXISTS ix_{tab}_project_id')
            op.drop_table(tab)

    if _has_table(bind, 'prj_project_member'):
        _safe_exec('DROP INDEX IF EXISTS ix_prj_project_member_is_deleted')
        _safe_exec('DROP INDEX IF EXISTS ix_prj_project_member_member_role')
        _safe_exec('DROP INDEX IF EXISTS ix_prj_project_member_user_id')
        _safe_exec('DROP INDEX IF EXISTS ix_prj_project_member_project_id')
        op.drop_table('prj_project_member')

    if _has_table(bind, 'prj_project'):
        _safe_exec('DROP INDEX IF EXISTS ix_prj_project_created_by_user_id')
        _safe_exec('DROP INDEX IF EXISTS ix_prj_project_manager_user_id')
        _safe_exec('DROP INDEX IF EXISTS ix_prj_project_owner_dept_id')
        _safe_exec('DROP INDEX IF EXISTS ix_prj_project_status')
        _safe_exec('DROP INDEX IF EXISTS ix_prj_project_is_deleted')
        op.drop_table('prj_project')
