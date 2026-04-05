"""add svc_ticket tables

Revision ID: b9d7c2a1e5f4
Revises: c9a18f2d0b1a
Create Date: 2025-12-14

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b9d7c2a1e5f4'
down_revision = 'c9a18f2d0b1a'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'svc_ticket',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('ticket_type', sa.Text(), nullable=False),
        sa.Column('category', sa.Text(), nullable=True),
        sa.Column('priority', sa.Text(), nullable=False),
        sa.Column('status', sa.Text(), nullable=False, server_default=sa.text("'접수대기'")),
        sa.Column('requester_user_id', sa.Integer(), nullable=False),
        sa.Column('requester_dept_id', sa.Integer(), nullable=True),
        sa.Column('assignee_user_id', sa.Integer(), nullable=True),
        sa.Column('assignee_dept_id', sa.Integer(), nullable=True),
        sa.Column('target_object', sa.Text(), nullable=True),
        sa.Column('due_at', sa.Text(), nullable=False),
        sa.Column('detail', sa.Text(), nullable=True),
        sa.Column('resolved_at', sa.Text(), nullable=True),
        sa.Column('closed_at', sa.Text(), nullable=True),
        sa.Column('resolution_summary', sa.Text(), nullable=True),
        sa.Column('created_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_user_id', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.Text(), nullable=True),
        sa.Column('updated_by_user_id', sa.Integer(), nullable=True),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.ForeignKeyConstraint(['requester_user_id'], ['org_user.id']),
        sa.ForeignKeyConstraint(['requester_dept_id'], ['org_department.id']),
        sa.ForeignKeyConstraint(['assignee_user_id'], ['org_user.id']),
        sa.ForeignKeyConstraint(['assignee_dept_id'], ['org_department.id']),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['org_user.id']),
        sa.ForeignKeyConstraint(['updated_by_user_id'], ['org_user.id']),
    )
    op.create_index('ix_svc_ticket_is_deleted', 'svc_ticket', ['is_deleted'])
    op.create_index('ix_svc_ticket_status', 'svc_ticket', ['status'])
    op.create_index('ix_svc_ticket_priority', 'svc_ticket', ['priority'])
    op.create_index('ix_svc_ticket_requester_user_id', 'svc_ticket', ['requester_user_id'])
    op.create_index('ix_svc_ticket_assignee_user_id', 'svc_ticket', ['assignee_user_id'])

    op.create_table(
        'svc_ticket_file',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('ticket_id', sa.Integer(), nullable=False),
        sa.Column('file_path', sa.Text(), nullable=False),
        sa.Column('original_name', sa.Text(), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('content_type', sa.Text(), nullable=True),
        sa.Column('uploaded_at', sa.Text(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('uploaded_by_user_id', sa.Integer(), nullable=False),
        sa.Column('is_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.ForeignKeyConstraint(['ticket_id'], ['svc_ticket.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['uploaded_by_user_id'], ['org_user.id']),
    )
    op.create_index('ix_svc_ticket_file_ticket_id', 'svc_ticket_file', ['ticket_id'])
    op.create_index('ix_svc_ticket_file_is_deleted', 'svc_ticket_file', ['is_deleted'])


def downgrade():
    op.drop_index('ix_svc_ticket_file_is_deleted', table_name='svc_ticket_file')
    op.drop_index('ix_svc_ticket_file_ticket_id', table_name='svc_ticket_file')
    op.drop_table('svc_ticket_file')

    op.drop_index('ix_svc_ticket_assignee_user_id', table_name='svc_ticket')
    op.drop_index('ix_svc_ticket_requester_user_id', table_name='svc_ticket')
    op.drop_index('ix_svc_ticket_priority', table_name='svc_ticket')
    op.drop_index('ix_svc_ticket_status', table_name='svc_ticket')
    op.drop_index('ix_svc_ticket_is_deleted', table_name='svc_ticket')
    op.drop_table('svc_ticket')
