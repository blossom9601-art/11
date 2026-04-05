"""add work report tables

Revision ID: d9f3a1b2c3d4
Revises: c2b1a4d6e7f8
Create Date: 2025-12-16

"""

from alembic import op
import sqlalchemy as sa


revision = 'd9f3a1b2c3d4'
down_revision = 'c2b1a4d6e7f8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'wrk_report',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('prj_project.id', ondelete='SET NULL')),
        sa.Column('doc_no', sa.String(length=64)),
        sa.Column('draft_date', sa.Date()),
        sa.Column('draft_dept', sa.String(length=255)),
        sa.Column('recv_dept', sa.String(length=255)),
        sa.Column('doc_level', sa.String(length=32), server_default=sa.text("'일반'"), nullable=False),
        sa.Column('retention', sa.String(length=32), server_default=sa.text("'3년'"), nullable=False),
        sa.Column('read_perm', sa.String(length=64), server_default=sa.text("'팀원이상'"), nullable=False),
        sa.Column('task_title', sa.String(length=255), nullable=False),
        sa.Column('project_name', sa.String(length=255)),
        sa.Column('targets', sa.Text()),
        sa.Column('target_pairs_json', sa.Text()),
        sa.Column('business', sa.String(length=255)),
        sa.Column('owner_dept_id', sa.Integer(), sa.ForeignKey('org_department.id', ondelete='SET NULL')),
        sa.Column('owner_user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='SET NULL')),
        sa.Column('worker_name', sa.String(length=128)),
        sa.Column('partner_dept_text', sa.String(length=255)),
        sa.Column('participants_text', sa.String(length=512)),
        sa.Column('vendor_text', sa.String(length=255)),
        sa.Column('vendor_staff_text', sa.String(length=512)),
        sa.Column('start_datetime', sa.DateTime()),
        sa.Column('end_datetime', sa.DateTime()),
        sa.Column('overview', sa.Text()),
        sa.Column('service', sa.Text()),
        sa.Column('precheck', sa.Text()),
        sa.Column('procedure', sa.Text()),
        sa.Column('postcheck', sa.Text()),
        sa.Column('resources', sa.Text()),
        sa.Column('etc', sa.Text()),
        sa.Column('report_result', sa.Text()),
        sa.Column('payload_json', sa.Text()),
        sa.Column('status', sa.String(length=32), server_default=sa.text("'REVIEW'"), nullable=False),
        sa.Column('approved_at', sa.DateTime()),
        sa.Column('result_submitted_at', sa.DateTime()),
        sa.Column('completed_at', sa.DateTime()),
        sa.Column('archived_at', sa.DateTime()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.Column('updated_at', sa.DateTime()),
        sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id')),
        sa.Column('is_deleted', sa.Integer(), server_default=sa.text('0'), nullable=False),
    )
    op.create_index('ix_wrk_report_status', 'wrk_report', ['status'])
    op.create_index('ix_wrk_report_project_id', 'wrk_report', ['project_id'])
    op.create_index('ix_wrk_report_owner_user_id', 'wrk_report', ['owner_user_id'])
    op.create_index('ix_wrk_report_created_by_user_id', 'wrk_report', ['created_by_user_id'])
    op.create_index('ix_wrk_report_is_deleted', 'wrk_report', ['is_deleted'])

    op.create_table(
        'wrk_report_classification',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('report_id', sa.Integer(), sa.ForeignKey('wrk_report.id', ondelete='CASCADE'), nullable=False),
        sa.Column('value', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.UniqueConstraint('report_id', 'value', name='uq_wrk_report_classification_report_value'),
    )
    op.create_index('ix_wrk_report_classification_report_id', 'wrk_report_classification', ['report_id'])

    op.create_table(
        'wrk_report_worktype',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('report_id', sa.Integer(), sa.ForeignKey('wrk_report.id', ondelete='CASCADE'), nullable=False),
        sa.Column('value', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.UniqueConstraint('report_id', 'value', name='uq_wrk_report_worktype_report_value'),
    )
    op.create_index('ix_wrk_report_worktype_report_id', 'wrk_report_worktype', ['report_id'])

    op.create_table(
        'wrk_report_participant_user',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('report_id', sa.Integer(), sa.ForeignKey('wrk_report.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('org_user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.UniqueConstraint('report_id', 'user_id', name='uq_wrk_report_participant_user_report_user'),
    )
    op.create_index('ix_wrk_report_participant_user_report_id', 'wrk_report_participant_user', ['report_id'])
    op.create_index('ix_wrk_report_participant_user_user_id', 'wrk_report_participant_user', ['user_id'])

    op.create_table(
        'wrk_report_participant_dept',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('report_id', sa.Integer(), sa.ForeignKey('wrk_report.id', ondelete='CASCADE'), nullable=False),
        sa.Column('dept_id', sa.Integer(), sa.ForeignKey('org_department.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.UniqueConstraint('report_id', 'dept_id', name='uq_wrk_report_participant_dept_report_dept'),
    )
    op.create_index('ix_wrk_report_participant_dept_report_id', 'wrk_report_participant_dept', ['report_id'])
    op.create_index('ix_wrk_report_participant_dept_dept_id', 'wrk_report_participant_dept', ['dept_id'])

    op.create_table(
        'wrk_report_vendor',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('report_id', sa.Integer(), sa.ForeignKey('wrk_report.id', ondelete='CASCADE'), nullable=False),
        sa.Column('vendor_name', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
    )
    op.create_index('ix_wrk_report_vendor_report_id', 'wrk_report_vendor', ['report_id'])

    op.create_table(
        'wrk_report_vendor_staff',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('vendor_id', sa.Integer(), sa.ForeignKey('wrk_report_vendor.id', ondelete='CASCADE'), nullable=False),
        sa.Column('staff_name', sa.String(length=255), nullable=False),
        sa.Column('memo', sa.Text()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
    )
    op.create_index('ix_wrk_report_vendor_staff_vendor_id', 'wrk_report_vendor_staff', ['vendor_id'])

    op.create_table(
        'wrk_report_approval',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('report_id', sa.Integer(), sa.ForeignKey('wrk_report.id', ondelete='CASCADE'), nullable=False),
        sa.Column('phase', sa.String(length=16), nullable=False),
        sa.Column('approver_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
        sa.Column('approved_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('memo', sa.Text()),
        sa.UniqueConstraint('report_id', 'phase', name='uq_wrk_report_approval_report_phase'),
    )
    op.create_index('ix_wrk_report_approval_report_id', 'wrk_report_approval', ['report_id'])
    op.create_index('ix_wrk_report_approval_approver_user_id', 'wrk_report_approval', ['approver_user_id'])

    op.create_table(
        'wrk_report_file',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('report_id', sa.Integer(), sa.ForeignKey('wrk_report.id', ondelete='CASCADE'), nullable=False),
        sa.Column('stored_name', sa.String(length=255), nullable=False),
        sa.Column('original_name', sa.String(length=255), nullable=False),
        sa.Column('content_type', sa.String(length=255)),
        sa.Column('size_bytes', sa.Integer()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('org_user.id'), nullable=False),
    )
    op.create_index('ix_wrk_report_file_report_id', 'wrk_report_file', ['report_id'])


def downgrade():
    op.drop_index('ix_wrk_report_file_report_id', table_name='wrk_report_file')
    op.drop_table('wrk_report_file')

    op.drop_index('ix_wrk_report_approval_approver_user_id', table_name='wrk_report_approval')
    op.drop_index('ix_wrk_report_approval_report_id', table_name='wrk_report_approval')
    op.drop_table('wrk_report_approval')

    op.drop_index('ix_wrk_report_vendor_staff_vendor_id', table_name='wrk_report_vendor_staff')
    op.drop_table('wrk_report_vendor_staff')

    op.drop_index('ix_wrk_report_vendor_report_id', table_name='wrk_report_vendor')
    op.drop_table('wrk_report_vendor')

    op.drop_index('ix_wrk_report_participant_dept_dept_id', table_name='wrk_report_participant_dept')
    op.drop_index('ix_wrk_report_participant_dept_report_id', table_name='wrk_report_participant_dept')
    op.drop_table('wrk_report_participant_dept')

    op.drop_index('ix_wrk_report_participant_user_user_id', table_name='wrk_report_participant_user')
    op.drop_index('ix_wrk_report_participant_user_report_id', table_name='wrk_report_participant_user')
    op.drop_table('wrk_report_participant_user')

    op.drop_index('ix_wrk_report_worktype_report_id', table_name='wrk_report_worktype')
    op.drop_table('wrk_report_worktype')

    op.drop_index('ix_wrk_report_classification_report_id', table_name='wrk_report_classification')
    op.drop_table('wrk_report_classification')

    op.drop_index('ix_wrk_report_is_deleted', table_name='wrk_report')
    op.drop_index('ix_wrk_report_created_by_user_id', table_name='wrk_report')
    op.drop_index('ix_wrk_report_owner_user_id', table_name='wrk_report')
    op.drop_index('ix_wrk_report_project_id', table_name='wrk_report')
    op.drop_index('ix_wrk_report_status', table_name='wrk_report')
    op.drop_table('wrk_report')
