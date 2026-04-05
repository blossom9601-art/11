"""add prj_project table

Revision ID: e8c1d2f3a4b5
Revises: b9d7c2a1e5f4
Create Date: 2025-12-14

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e8c1d2f3a4b5'
down_revision = 'b9d7c2a1e5f4'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'prj_project',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        # 기본 정보
        sa.Column('project_name', sa.Text(), nullable=False),
        sa.Column('project_type', sa.Text(), nullable=False),
        sa.Column('owner_dept_id', sa.Integer(), nullable=False),
        sa.Column('manager_user_id', sa.Integer(), nullable=False),
        sa.Column('priority', sa.Text(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        # 진행/일정
        sa.Column('status', sa.Text(), nullable=False),
        sa.Column('budget_amount', sa.Integer(), nullable=True),
        sa.Column('start_date', sa.Text(), nullable=True),
        sa.Column('expected_end_date', sa.Text(), nullable=True),
        sa.Column('task_count_cached', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('progress_percent', sa.Integer(), nullable=False, server_default=sa.text('0')),
        # 공통 메타
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_user_id', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.Text(), nullable=True),
        sa.Column('updated_by_user_id', sa.Integer(), nullable=True),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
        # FK
        sa.ForeignKeyConstraint(['owner_dept_id'], ['org_department.id']),
        sa.ForeignKeyConstraint(['manager_user_id'], ['org_user.id']),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['org_user.id']),
        sa.ForeignKeyConstraint(['updated_by_user_id'], ['org_user.id']),
    )

    op.create_index('ix_prj_project_is_deleted', 'prj_project', ['is_deleted'])
    op.create_index('ix_prj_project_status', 'prj_project', ['status'])
    op.create_index('ix_prj_project_owner_dept_id', 'prj_project', ['owner_dept_id'])
    op.create_index('ix_prj_project_manager_user_id', 'prj_project', ['manager_user_id'])
    op.create_index('ix_prj_project_created_by_user_id', 'prj_project', ['created_by_user_id'])


def downgrade():
    op.drop_index('ix_prj_project_created_by_user_id', table_name='prj_project')
    op.drop_index('ix_prj_project_manager_user_id', table_name='prj_project')
    op.drop_index('ix_prj_project_owner_dept_id', table_name='prj_project')
    op.drop_index('ix_prj_project_status', table_name='prj_project')
    op.drop_index('ix_prj_project_is_deleted', table_name='prj_project')
    op.drop_table('prj_project')
