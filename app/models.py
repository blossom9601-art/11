from datetime import datetime, timezone, timedelta
import uuid

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import Computed
from sqlalchemy.sql import func
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

class User(db.Model):
    """사용자 정보"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(100), nullable=False, unique=True)
    password = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(20), default='user')  # admin, user
    is_active = db.Column(db.Boolean, default=True)
    last_login = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<User {self.email}>'

class Company(db.Model):
    """회사 정보"""
    __tablename__ = 'companies'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    business_number = db.Column(db.String(20), unique=True)
    address = db.Column(db.Text)
    phone = db.Column(db.String(20))
    email = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 관계
    employees = db.relationship('Employee', backref='company', lazy=True)
    servers = db.relationship('Server', backref='company', lazy=True)

class Employee(db.Model):
    """직원 정보"""
    __tablename__ = 'employees'
    
    id = db.Column(db.Integer, primary_key=True)
    company_id = db.Column(db.Integer, db.ForeignKey('companies.id'), nullable=False, index=True)
    name = db.Column(db.String(50), nullable=False)
    employee_id = db.Column(db.String(20), unique=True)
    department = db.Column(db.String(50))
    position = db.Column(db.String(50))
    email = db.Column(db.String(100))
    phone = db.Column(db.String(20))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Server(db.Model):
    """서버 정보"""
    __tablename__ = 'servers'
    
    id = db.Column(db.Integer, primary_key=True)
    company_id = db.Column(db.Integer, db.ForeignKey('companies.id'), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    ip_address = db.Column(db.String(15))
    hostname = db.Column(db.String(100))
    os_type = db.Column(db.String(50))
    cpu = db.Column(db.String(100))
    memory = db.Column(db.String(50))
    storage = db.Column(db.String(100))
    status = db.Column(db.String(20), default='active', index=True)  # active, inactive, maintenance
    location = db.Column(db.String(100))
    rack_position = db.Column(db.String(20))
    purchase_date = db.Column(db.Date)
    warranty_expiry = db.Column(db.Date)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Storage(db.Model):
    """스토리지 정보"""
    __tablename__ = 'storages'
    
    id = db.Column(db.Integer, primary_key=True)
    company_id = db.Column(db.Integer, db.ForeignKey('companies.id'), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50))  # NAS, SAN, DAS
    capacity = db.Column(db.String(50))
    used_capacity = db.Column(db.String(50))
    ip_address = db.Column(db.String(15))
    location = db.Column(db.String(100))
    status = db.Column(db.String(20), default='active', index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Network(db.Model):
    """네트워크 정보"""
    __tablename__ = 'networks'
    
    id = db.Column(db.Integer, primary_key=True)
    company_id = db.Column(db.Integer, db.ForeignKey('companies.id'), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    ip_range = db.Column(db.String(50))
    subnet_mask = db.Column(db.String(15))
    gateway = db.Column(db.String(15))
    dns_servers = db.Column(db.Text)
    vlan_id = db.Column(db.Integer)
    status = db.Column(db.String(20), default='active', index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Software(db.Model):
    """소프트웨어 정보"""
    __tablename__ = 'software'
    
    id = db.Column(db.Integer, primary_key=True)
    company_id = db.Column(db.Integer, db.ForeignKey('companies.id'), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    version = db.Column(db.String(50))
    type = db.Column(db.String(50))  # OS, Database, Middleware, etc.
    license_key = db.Column(db.String(200))
    license_expiry = db.Column(db.Date)
    server_id = db.Column(db.Integer, db.ForeignKey('servers.id'))
    status = db.Column(db.String(20), default='active', index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Maintenance(db.Model):
    """유지보수 정보"""
    __tablename__ = 'maintenance'
    
    id = db.Column(db.Integer, primary_key=True)
    company_id = db.Column(db.Integer, db.ForeignKey('companies.id'), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    type = db.Column(db.String(50))  # contract, inspection, repair
    vendor = db.Column(db.String(100))
    start_date = db.Column(db.Date)
    end_date = db.Column(db.Date)
    cost = db.Column(db.Numeric(10, 2))
    status = db.Column(db.String(20), default='active', index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Project(db.Model):
    """프로젝트 정보"""
    __tablename__ = 'projects'
    
    id = db.Column(db.Integer, primary_key=True)
    company_id = db.Column(db.Integer, db.ForeignKey('companies.id'), nullable=False, index=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    start_date = db.Column(db.Date)
    end_date = db.Column(db.Date)
    status = db.Column(db.String(20), default='planning', index=True)  # planning, in_progress, completed, cancelled
    priority = db.Column(db.String(20), default='medium')  # low, medium, high, critical
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 관계
    tasks = db.relationship('Task', backref='project', lazy=True)

class Task(db.Model):
    """작업 정보"""
    __tablename__ = 'tasks'
    
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    assigned_to = db.Column(db.Integer, db.ForeignKey('employees.id'))
    start_date = db.Column(db.Date)
    due_date = db.Column(db.Date)
    status = db.Column(db.String(20), default='pending', index=True)  # pending, in_progress, completed, cancelled
    priority = db.Column(db.String(20), default='medium')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow) 

class AuthUser(db.Model):
    """인증 사용자 정보"""
    __tablename__ = 'auth_users'
    
    id = db.Column(db.Integer, primary_key=True)
    emp_no = db.Column(db.String(30), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    email = db.Column(db.String(255))
    role = db.Column(db.String(50), default='user')
    status = db.Column(db.String(20), default='active')  # active, inactive, locked
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login_at = db.Column(db.DateTime)
    login_fail_cnt = db.Column(db.Integer, default=0)
    locked_until = db.Column(db.DateTime)
    # 약관 최종 동의 시각 (월별 재동의 요구)
    last_terms_accepted_at = db.Column(db.DateTime)
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256', salt_length=16)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def is_locked(self):
        if self.locked_until and self.locked_until > datetime.utcnow():
            return True
        return False
    
    def increment_fail_count(self):
        self.login_fail_cnt += 1
        if self.login_fail_cnt >= 5:  # 5회 실패시 계정 잠금
            from datetime import timedelta
            self.locked_until = datetime.utcnow() + timedelta(minutes=30)
    
    def reset_fail_count(self):
        self.login_fail_cnt = 0
        self.locked_until = None

    def needs_terms(self):
        """월별 약관 재동의 필요 여부.
        - 최초 로그인 (last_terms_accepted_at 없음)
        - 저장된 동의 월(UTC 기준)과 현재 월이 다름
        """
        if not self.last_terms_accepted_at:
            return True
        now = datetime.utcnow()
        return self.last_terms_accepted_at.strftime('%Y%m') != now.strftime('%Y%m')

class AuthLoginHistory(db.Model):
    """로그인 히스토리"""
    __tablename__ = 'auth_login_history'
    
    id = db.Column(db.Integer, primary_key=True)
    emp_no = db.Column(db.String(30), nullable=False, index=True)
    ip_address = db.Column(db.String(45))
    user_agent = db.Column(db.Text)
    success = db.Column(db.Boolean, nullable=False)
    logged_at = db.Column(db.DateTime, default=datetime.utcnow)

class AuthPasswordHistory(db.Model):
    """비밀번호 변경 히스토리"""
    __tablename__ = 'auth_password_history'
    
    id = db.Column(db.Integer, primary_key=True)
    emp_no = db.Column(db.String(30), nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    changed_at = db.Column(db.DateTime, default=datetime.utcnow)
    changed_by = db.Column(db.String(30), nullable=False)

class AuthRole(db.Model):
    """역할 및 권한 정보"""
    __tablename__ = 'auth_roles'
    
    role = db.Column(db.String(50), primary_key=True)
    description = db.Column(db.String(255))
    permissions = db.Column(db.Text)  # JSON 형태로 저장 

class RackLayout(db.Model):
    """데이터센터 상면도 레이아웃 저장 (층별/페이지별)"""
    __tablename__ = 'rack_layouts'

    id = db.Column(db.Integer, primary_key=True)
    floor_key = db.Column(db.String(100), unique=True, nullable=False)  # 예: future-5f, future-6f, eulji-15f, drcenter-4f
    data = db.Column(db.Text, nullable=False)  # JSON 문자열 (박스 목록)
    updated_by = db.Column(db.String(100))     # 저장 사용자 식별자 (emp_no 또는 user id)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class OrgDepartment(db.Model):
    """조직 부서 테이블 (org_department)"""
    __tablename__ = 'org_department'
    __table_args__ = (
        db.Index('ix_org_department_code', 'dept_code'),
        db.Index('ix_org_department_parent_code', 'parent_dept_code'),
        db.Index('ix_org_department_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    dept_code = db.Column(db.String(64), unique=True, nullable=False)
    dept_name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    manager_name = db.Column(db.String(128))
    manager_emp_no = db.Column(db.String(64))
    member_count = db.Column(db.Integer, default=0)
    hw_count = db.Column(db.Integer, default=0)
    sw_count = db.Column(db.Integer, default=0)
    remark = db.Column(db.Text)
    parent_dept_code = db.Column(db.String(64))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(64), nullable=False, default='system')
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = db.Column(db.String(64))
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)

    def __repr__(self):
        return f'<OrgDepartment {self.dept_code}>'

class UserProfile(db.Model):
    """관리 UI 확장 사용자 프로필 (기본 인증 auth_users 와 분리)
    - 모달에서 입력하는 상세 정보 저장
    - dev 환경에서 'org_user' 단일 테이블명 요구에 따라 __tablename__='org_user'
    """
    __tablename__ = 'org_user'

    id = db.Column(db.Integer, primary_key=True)
    emp_no = db.Column(db.String(30), unique=True, nullable=False, index=True)
    name = db.Column(db.String(128))
    nickname = db.Column(db.String(128))
    company = db.Column(db.String(128))  # 회사명
    department_id = db.Column(db.Integer, db.ForeignKey('org_department.id'))
    department = db.Column(db.String(128))
    employment_status = db.Column(db.String(20), default='재직')  # 재직상태: 재직/휴직/퇴직
    ext_phone = db.Column(db.String(32))
    mobile_phone = db.Column(db.String(32))
    email = db.Column(db.String(255))
    role = db.Column(db.String(50))
    allowed_ip = db.Column(db.Text)  # 쉼표 구분 IP 목록
    job = db.Column(db.Text)
    profile_image = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # 확장 컬럼 (페이지 컬럼 반영)
    last_login_at = db.Column(db.DateTime)          # 최근 로그인 (AuthUser와 중복 저장 가능, 옵션)
    password_changed_at = db.Column(db.DateTime)    # 비밀번호 변경 시각
    password_expires_at = db.Column(db.DateTime)    # 비밀번호 만료 시각
    locked = db.Column(db.Boolean, default=False)   # 계정 잠금 여부 (표시용 캐시)
    fail_cnt = db.Column(db.Integer, default=0)     # 로그인 실패 횟수 (표시용 캐시)
    note = db.Column(db.Text)                       # 비고
    motto = db.Column(db.Text)                      # 슬로건/한줄 메시지
    signature_image = db.Column(db.Text)             # 서명 이미지 (base64 data URL)

    department_ref = db.relationship('OrgDepartment', foreign_keys=[department_id])

    def __repr__(self):
        return f'<UserProfile {self.emp_no}>'


class WrkReport(db.Model):
    """작업보고서 본 테이블 (wrk_report)

    Status codes:
    - REVIEW -> APPROVED -> (auto) SCHEDULED -> (auto) IN_PROGRESS -> COMPLETED -> ARCHIVED
    """

    __tablename__ = 'wrk_report'
    __table_args__ = (
        db.Index('ix_wrk_report_status', 'status'),
        db.Index('ix_wrk_report_project_id', 'project_id'),
        db.Index('ix_wrk_report_owner_user_id', 'owner_user_id'),
        db.Index('ix_wrk_report_created_by_user_id', 'created_by_user_id'),
        db.Index('ix_wrk_report_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)

    project_id = db.Column(db.Integer, db.ForeignKey('prj_project.id', ondelete='SET NULL'))

    doc_no = db.Column(db.String(64))
    draft_date = db.Column(db.Date)
    draft_dept = db.Column(db.String(255))
    recv_dept = db.Column(db.String(255))
    doc_level = db.Column(db.String(32), nullable=False, server_default=db.text("'일반'"))
    retention = db.Column(db.String(32), nullable=False, server_default=db.text("'3년'"))
    read_perm = db.Column(db.String(64), nullable=False, server_default=db.text("'팀원이상'"))

    task_title = db.Column(db.String(255), nullable=False)
    project_name = db.Column(db.String(255))

    targets = db.Column(db.Text)
    target_pairs_json = db.Column(db.Text)
    business = db.Column(db.String(255))

    owner_dept_id = db.Column(db.Integer, db.ForeignKey('org_department.id', ondelete='SET NULL'))
    owner_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    worker_name = db.Column(db.String(128))

    partner_dept_text = db.Column(db.String(255))
    participants_text = db.Column(db.String(512))
    vendor_text = db.Column(db.String(255))
    vendor_staff_text = db.Column(db.String(512))

    start_datetime = db.Column(db.DateTime)
    end_datetime = db.Column(db.DateTime)

    overview = db.Column(db.Text)
    service = db.Column(db.Text)
    precheck = db.Column(db.Text)
    procedure = db.Column(db.Text)
    postcheck = db.Column(db.Text)
    resources = db.Column(db.Text)
    etc = db.Column(db.Text)
    report_result = db.Column(db.Text)
    result_type = db.Column(db.String(64))          # 결과 유형: 정상완료 / 일부완료 / 미완료 / 롤백
    actual_start_time = db.Column(db.String(64))     # 실제 시작시간 (datetime-local)
    actual_end_time = db.Column(db.String(64))       # 실제 종료시간 (datetime-local)
    actual_duration = db.Column(db.String(64))       # 실제 소요 시간 (예: "2시간 30분")
    impact = db.Column(db.String(64))
    cancel_reason = db.Column(db.Text)  # 작업취소 사유

    payload_json = db.Column(db.Text)

    status = db.Column(db.String(32), nullable=False, server_default=db.text("'REVIEW'"))
    approved_at = db.Column(db.DateTime)
    result_submitted_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)
    archived_at = db.Column(db.DateTime)

    created_at = db.Column(db.DateTime, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.DateTime)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))
    cleared = db.Column(db.Integer, nullable=False, server_default=db.text('0'))
    version = db.Column(db.Integer, nullable=False, server_default=db.text('1'))

    owner_dept = db.relationship('OrgDepartment', foreign_keys=[owner_dept_id], lazy='joined')
    owner_user = db.relationship('UserProfile', foreign_keys=[owner_user_id], lazy='joined')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')
    project = db.relationship('PrjProject', foreign_keys=[project_id], lazy='joined')

    classifications = db.relationship('WrkReportClassification', back_populates='report', cascade='all, delete-orphan', lazy='selectin')
    worktypes = db.relationship('WrkReportWorktype', back_populates='report', cascade='all, delete-orphan', lazy='selectin')
    participant_users = db.relationship('WrkReportParticipantUser', back_populates='report', cascade='all, delete-orphan', lazy='selectin')
    participant_depts = db.relationship('WrkReportParticipantDept', back_populates='report', cascade='all, delete-orphan', lazy='selectin')
    vendors = db.relationship('WrkReportVendor', back_populates='report', cascade='all, delete-orphan', lazy='selectin')
    approvals = db.relationship('WrkReportApproval', back_populates='report', cascade='all, delete-orphan', lazy='selectin')
    files = db.relationship('WrkReportFile', back_populates='report', cascade='all, delete-orphan', lazy='selectin')
    comments = db.relationship('WrkReportComment', back_populates='report', cascade='all, delete-orphan', lazy='selectin')


class WrkReportClassification(db.Model):
    __tablename__ = 'wrk_report_classification'
    __table_args__ = (
        db.UniqueConstraint('report_id', 'value', name='uq_wrk_report_classification_report_value'),
        db.Index('ix_wrk_report_classification_report_id', 'report_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey('wrk_report.id', ondelete='CASCADE'), nullable=False)
    value = db.Column(db.String(64), nullable=False)

    created_at = db.Column(db.DateTime, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)

    report = db.relationship('WrkReport', back_populates='classifications')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')


class WrkReportWorktype(db.Model):
    __tablename__ = 'wrk_report_worktype'
    __table_args__ = (
        db.UniqueConstraint('report_id', 'value', name='uq_wrk_report_worktype_report_value'),
        db.Index('ix_wrk_report_worktype_report_id', 'report_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey('wrk_report.id', ondelete='CASCADE'), nullable=False)
    value = db.Column(db.String(64), nullable=False)

    created_at = db.Column(db.DateTime, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)

    report = db.relationship('WrkReport', back_populates='worktypes')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')


class WrkReportParticipantUser(db.Model):
    __tablename__ = 'wrk_report_participant_user'
    __table_args__ = (
        db.UniqueConstraint('report_id', 'user_id', name='uq_wrk_report_participant_user_report_user'),
        db.Index('ix_wrk_report_participant_user_report_id', 'report_id'),
        db.Index('ix_wrk_report_participant_user_user_id', 'user_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey('wrk_report.id', ondelete='CASCADE'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='CASCADE'), nullable=False)

    created_at = db.Column(db.DateTime, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)

    report = db.relationship('WrkReport', back_populates='participant_users')
    user = db.relationship('UserProfile', foreign_keys=[user_id], lazy='joined')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')


class WrkReportParticipantDept(db.Model):
    __tablename__ = 'wrk_report_participant_dept'
    __table_args__ = (
        db.UniqueConstraint('report_id', 'dept_id', name='uq_wrk_report_participant_dept_report_dept'),
        db.Index('ix_wrk_report_participant_dept_report_id', 'report_id'),
        db.Index('ix_wrk_report_participant_dept_dept_id', 'dept_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey('wrk_report.id', ondelete='CASCADE'), nullable=False)
    dept_id = db.Column(db.Integer, db.ForeignKey('org_department.id', ondelete='CASCADE'), nullable=False)

    created_at = db.Column(db.DateTime, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)

    report = db.relationship('WrkReport', back_populates='participant_depts')
    dept = db.relationship('OrgDepartment', foreign_keys=[dept_id], lazy='joined')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')


class WrkReportVendor(db.Model):
    __tablename__ = 'wrk_report_vendor'
    __table_args__ = (
        db.Index('ix_wrk_report_vendor_report_id', 'report_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey('wrk_report.id', ondelete='CASCADE'), nullable=False)
    vendor_name = db.Column(db.String(255), nullable=False)

    created_at = db.Column(db.DateTime, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)

    report = db.relationship('WrkReport', back_populates='vendors')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')

    staffs = db.relationship('WrkReportVendorStaff', back_populates='vendor', cascade='all, delete-orphan', lazy='selectin')


class WrkReportVendorStaff(db.Model):
    __tablename__ = 'wrk_report_vendor_staff'
    __table_args__ = (
        db.Index('ix_wrk_report_vendor_staff_vendor_id', 'vendor_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    vendor_id = db.Column(db.Integer, db.ForeignKey('wrk_report_vendor.id', ondelete='CASCADE'), nullable=False)
    staff_name = db.Column(db.String(255), nullable=False)
    memo = db.Column(db.Text)

    created_at = db.Column(db.DateTime, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)

    vendor = db.relationship('WrkReportVendor', back_populates='staffs')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')


class WrkReportApproval(db.Model):
    __tablename__ = 'wrk_report_approval'
    __table_args__ = (
        db.UniqueConstraint('report_id', 'phase', name='uq_wrk_report_approval_report_phase'),
        db.Index('ix_wrk_report_approval_report_id', 'report_id'),
        db.Index('ix_wrk_report_approval_approver_user_id', 'approver_user_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey('wrk_report.id', ondelete='CASCADE'), nullable=False)
    phase = db.Column(db.String(16), nullable=False)
    approver_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    approved_at = db.Column(db.DateTime, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    memo = db.Column(db.Text)

    report = db.relationship('WrkReport', back_populates='approvals')
    approver = db.relationship('UserProfile', foreign_keys=[approver_user_id], lazy='joined')


class WrkReportFile(db.Model):
    __tablename__ = 'wrk_report_file'
    __table_args__ = (
        db.Index('ix_wrk_report_file_report_id', 'report_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey('wrk_report.id', ondelete='CASCADE'), nullable=False)
    stored_name = db.Column(db.String(255), nullable=False)
    original_name = db.Column(db.String(255), nullable=False)
    content_type = db.Column(db.String(255))
    size_bytes = db.Column(db.Integer)

    created_at = db.Column(db.DateTime, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)

    report = db.relationship('WrkReport', back_populates='files')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')


class WrkReportComment(db.Model):
    __tablename__ = 'wrk_report_comment'
    __table_args__ = (
        db.Index('ix_wrk_report_comment_report_id', 'report_id'),
        db.Index('ix_wrk_report_comment_created_by_user_id', 'created_by_user_id'),
        db.Index('ix_wrk_report_comment_is_deleted', 'is_deleted'),
        db.Index('ix_wrk_report_comment_created_at', 'created_at'),
    )

    id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey('wrk_report.id', ondelete='CASCADE'), nullable=False)
    text = db.Column(db.Text, nullable=False)

    created_at = db.Column(db.DateTime, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    updated_at = db.Column(db.DateTime)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    report = db.relationship('WrkReport', back_populates='comments')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')


class WrkReportUserClear(db.Model):
    """유저별 비우기 상태 (wrk_report_user_clear)

    각 사용자가 개별적으로 비우기 처리한 내역.
    report_id + user_id 가 존재하면 해당 유저에게는 숨김.
    """
    __tablename__ = 'wrk_report_user_clear'
    __table_args__ = (
        db.UniqueConstraint('report_id', 'user_id', name='uq_wrk_report_user_clear_report_user'),
        db.Index('ix_wrk_report_user_clear_report_id', 'report_id'),
        db.Index('ix_wrk_report_user_clear_user_id', 'user_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey('wrk_report.id', ondelete='CASCADE'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='CASCADE'), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))

    report = db.relationship('WrkReport', backref=db.backref('user_clears', cascade='all, delete-orphan', lazy='dynamic'))
    user = db.relationship('UserProfile', foreign_keys=[user_id], lazy='joined')


class Role(db.Model):
    """역할 테이블 (새 권한 시스템)
    - 사용자 지정 역할명/설명
    - 개별 섹션 read/write 플래그 컬럼
    - user(Profile) 과 다대다 매핑 (role_user)
    """
    __tablename__ = 'role'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(128), unique=True, nullable=False, index=True)
    description = db.Column(db.String(512))
    # 권한 플래그 (대시보드 ~ 카테고리)
    dashboard_read = db.Column(db.Boolean, default=False)
    dashboard_write = db.Column(db.Boolean, default=False)
    hardware_read = db.Column(db.Boolean, default=False)
    hardware_write = db.Column(db.Boolean, default=False)
    software_read = db.Column(db.Boolean, default=False)
    software_write = db.Column(db.Boolean, default=False)
    governance_read = db.Column(db.Boolean, default=False)
    governance_write = db.Column(db.Boolean, default=False)
    datacenter_read = db.Column(db.Boolean, default=False)
    datacenter_write = db.Column(db.Boolean, default=False)
    cost_read = db.Column(db.Boolean, default=False)
    cost_write = db.Column(db.Boolean, default=False)
    project_read = db.Column(db.Boolean, default=False)
    project_write = db.Column(db.Boolean, default=False)
    category_read = db.Column(db.Boolean, default=False)
    category_write = db.Column(db.Boolean, default=False)
    insight_read = db.Column(db.Boolean, default=False)
    insight_write = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    users = db.relationship('UserProfile', secondary='role_user', backref='roles')

    def __repr__(self):
        return f'<Role {self.name}>'

class RoleUser(db.Model):
    """역할-사용자 매핑 (다대다)"""
    __tablename__ = 'role_user'

    role_id = db.Column(db.Integer, db.ForeignKey('role.id', ondelete='CASCADE'), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='CASCADE'), primary_key=True)
    mapped_at = db.Column(db.DateTime, default=datetime.utcnow)


class Menu(db.Model):
    """권한 관리용 메뉴 트리"""
    __tablename__ = 'menu'

    id = db.Column(db.Integer, primary_key=True)
    menu_code = db.Column(db.String(64), unique=True, nullable=False, index=True)
    menu_name = db.Column(db.String(128), nullable=False)
    parent_menu_id = db.Column(db.Integer, db.ForeignKey('menu.id'), nullable=True)
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    children = db.relationship('Menu', backref=db.backref('parent', remote_side=[id]), lazy='dynamic')

    def __repr__(self):
        return f'<Menu {self.menu_code}>'


class RoleMenuPermission(db.Model):
    """역할 ↔ 메뉴 권한"""
    __tablename__ = 'role_menu_permission'
    __table_args__ = (
        db.UniqueConstraint('role_id', 'menu_id', name='uq_role_menu'),
    )

    id = db.Column(db.Integer, primary_key=True)
    role_id = db.Column(db.Integer, db.ForeignKey('role.id', ondelete='CASCADE'), nullable=False, index=True)
    menu_id = db.Column(db.Integer, db.ForeignKey('menu.id', ondelete='CASCADE'), nullable=False, index=True)
    permission_type = db.Column(db.String(10), nullable=False, default='NONE')


class DepartmentMenuPermission(db.Model):
    """부서 ↔ 메뉴 권한"""
    __tablename__ = 'department_menu_permission'
    __table_args__ = (
        db.UniqueConstraint('dept_id', 'menu_id', name='uq_dept_menu'),
    )

    id = db.Column(db.Integer, primary_key=True)
    dept_id = db.Column(db.Integer, db.ForeignKey('org_department.id', ondelete='CASCADE'), nullable=False, index=True)
    menu_id = db.Column(db.Integer, db.ForeignKey('menu.id', ondelete='CASCADE'), nullable=False, index=True)
    permission_type = db.Column(db.String(10), nullable=False, default='NONE')


class UserMenuPermission(db.Model):
    """사용자 직접 ↔ 메뉴 권한 (최우선)"""
    __tablename__ = 'user_menu_permission'
    __table_args__ = (
        db.UniqueConstraint('user_id', 'menu_id', name='uq_user_menu'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='CASCADE'), nullable=False, index=True)
    menu_id = db.Column(db.Integer, db.ForeignKey('menu.id', ondelete='CASCADE'), nullable=False, index=True)
    permission_type = db.Column(db.String(10), nullable=False, default='NONE')


class PermissionAuditLog(db.Model):
    """권한 변경 감사 로그"""
    __tablename__ = 'permission_audit_log'

    id = db.Column(db.Integer, primary_key=True)
    target_type = db.Column(db.String(20), nullable=False, default='role')  # role, department, user
    target_id = db.Column(db.Integer, nullable=False, default=0)
    menu_code = db.Column(db.String(64), nullable=False)
    before_permission = db.Column(db.String(10))
    after_permission = db.Column(db.String(10))
    changed_by = db.Column(db.String(128))
    changed_at = db.Column(db.DateTime, default=datetime.utcnow)
    # 레거시 호환 컬럼
    role_id = db.Column(db.Integer, nullable=True)
    role_name = db.Column(db.String(128))


# ── 상세화면(탭) 권한 모델 ──

class DetailPage(db.Model):
    """상세화면(탭) 권한 관리용 트리"""
    __tablename__ = 'detail_page'

    id = db.Column(db.Integer, primary_key=True)
    page_code = db.Column(db.String(64), unique=True, nullable=False, index=True)
    page_name = db.Column(db.String(128), nullable=False)
    parent_page_id = db.Column(db.Integer, db.ForeignKey('detail_page.id'), nullable=True)
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    children = db.relationship('DetailPage', backref=db.backref('parent', remote_side=[id]), lazy='dynamic')

    def __repr__(self):
        return f'<DetailPage {self.page_code}>'


class RoleDetailPermission(db.Model):
    """역할 ↔ 상세화면 권한"""
    __tablename__ = 'role_detail_permission'
    __table_args__ = (
        db.UniqueConstraint('role_id', 'page_id', name='uq_role_detail'),
    )

    id = db.Column(db.Integer, primary_key=True)
    role_id = db.Column(db.Integer, db.ForeignKey('role.id', ondelete='CASCADE'), nullable=False, index=True)
    page_id = db.Column(db.Integer, db.ForeignKey('detail_page.id', ondelete='CASCADE'), nullable=False, index=True)
    permission_type = db.Column(db.String(10), nullable=False, default='NONE')


class DepartmentDetailPermission(db.Model):
    """부서 ↔ 상세화면 권한"""
    __tablename__ = 'department_detail_permission'
    __table_args__ = (
        db.UniqueConstraint('dept_id', 'page_id', name='uq_dept_detail'),
    )

    id = db.Column(db.Integer, primary_key=True)
    dept_id = db.Column(db.Integer, db.ForeignKey('org_department.id', ondelete='CASCADE'), nullable=False, index=True)
    page_id = db.Column(db.Integer, db.ForeignKey('detail_page.id', ondelete='CASCADE'), nullable=False, index=True)
    permission_type = db.Column(db.String(10), nullable=False, default='NONE')


class UserDetailPermission(db.Model):
    """사용자 직접 ↔ 상세화면 권한 (최우선)"""
    __tablename__ = 'user_detail_permission'
    __table_args__ = (
        db.UniqueConstraint('user_id', 'page_id', name='uq_user_detail'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='CASCADE'), nullable=False, index=True)
    page_id = db.Column(db.Integer, db.ForeignKey('detail_page.id', ondelete='CASCADE'), nullable=False, index=True)
    permission_type = db.Column(db.String(10), nullable=False, default='NONE')


class CalSchedule(db.Model):
    """공용 일정 레코드를 저장"""
    __tablename__ = 'cal_schedule'
    __table_args__ = (
        db.Index('ix_cal_schedule_range', 'start_datetime', 'end_datetime'),
        db.Index('ix_cal_schedule_owner_user_id', 'owner_user_id'),
        db.Index('ix_cal_schedule_owner_dept_id', 'owner_dept_id'),
        db.Index('ix_cal_schedule_share_scope', 'share_scope'),
    )

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    start_datetime = db.Column(db.DateTime, nullable=False)
    end_datetime = db.Column(db.DateTime, nullable=False)
    is_all_day = db.Column(db.Boolean, nullable=False, default=False)
    location = db.Column(db.String(255))
    event_type = db.Column(db.String(50), nullable=False)
    owner_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    owner_dept_id = db.Column(db.Integer, db.ForeignKey('org_department.id'))
    share_scope = db.Column(db.String(20), nullable=False, default='ALL')
    description = db.Column(db.Text)
    color_code = db.Column(db.String(32))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    version = db.Column(db.Integer, nullable=False, server_default=db.text('1'))

    owner = db.relationship('UserProfile', foreign_keys=[owner_user_id], lazy='joined')
    share_users = db.relationship(
        'CalScheduleShareUser',
        back_populates='schedule',
        cascade='all, delete-orphan',
        lazy='selectin',
    )
    share_departments = db.relationship(
        'CalScheduleShareDept',
        back_populates='schedule',
        cascade='all, delete-orphan',
        lazy='selectin',
    )

    attachments = db.relationship(
        'CalScheduleAttachment',
        back_populates='schedule',
        cascade='all, delete-orphan',
        lazy='selectin',
        order_by='CalScheduleAttachment.id.asc()',
    )


class CalScheduleAttachment(db.Model):
    """일정 첨부파일 메타데이터"""
    __tablename__ = 'cal_schedule_attachment'
    __table_args__ = (
        db.Index('ix_cal_schedule_attachment_schedule_id', 'schedule_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    schedule_id = db.Column(db.Integer, db.ForeignKey('cal_schedule.id', ondelete='CASCADE'), nullable=False)
    stored_name = db.Column(db.String(255), nullable=False)
    original_name = db.Column(db.String(255), nullable=False)
    content_type = db.Column(db.String(255))
    size_bytes = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)

    schedule = db.relationship('CalSchedule', back_populates='attachments')


class CalScheduleShareUser(db.Model):
    """선택 공유 사용자 매핑"""
    __tablename__ = 'cal_schedule_share_user'
    __table_args__ = (
        db.UniqueConstraint('schedule_id', 'user_id', name='uq_cal_schedule_share_user'),
        db.Index('ix_cal_schedule_share_user_user_id', 'user_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    schedule_id = db.Column(db.Integer, db.ForeignKey('cal_schedule.id', ondelete='CASCADE'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='CASCADE'), nullable=False)
    can_edit = db.Column(db.Boolean, nullable=False, default=False)
    notification_enabled = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)

    schedule = db.relationship('CalSchedule', back_populates='share_users')
    user = db.relationship('UserProfile', foreign_keys=[user_id], lazy='joined')


class CalScheduleShareDept(db.Model):
    """선택 공유 부서 매핑"""
    __tablename__ = 'cal_schedule_share_dept'
    __table_args__ = (
        db.UniqueConstraint('schedule_id', 'dept_id', name='uq_cal_schedule_share_dept'),
        db.Index('ix_cal_schedule_share_dept_dept_id', 'dept_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    schedule_id = db.Column(db.Integer, db.ForeignKey('cal_schedule.id', ondelete='CASCADE'), nullable=False)
    dept_id = db.Column(db.Integer, db.ForeignKey('org_department.id'), nullable=False)
    can_edit = db.Column(db.Boolean, nullable=False, default=False)
    notification_enabled = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)

    schedule = db.relationship('CalSchedule', back_populates='share_departments')


class SvcTicket(db.Model):
    """서비스 티켓 (svc_ticket)

    Notes:
    - The spec uses TEXT timestamps (SQLite). We keep them as Text columns with
      server defaults to match the requested DDL closely.
    - Soft-delete uses integer flags (0/1) to match existing patterns.
    """

    __tablename__ = 'svc_ticket'
    __table_args__ = (
        db.Index('ix_svc_ticket_is_deleted', 'is_deleted'),
        db.Index('ix_svc_ticket_status', 'status'),
        db.Index('ix_svc_ticket_priority', 'priority'),
        db.Index('ix_svc_ticket_requester_user_id', 'requester_user_id'),
        db.Index('ix_svc_ticket_assignee_user_id', 'assignee_user_id'),
    )

    id = db.Column(db.Integer, primary_key=True)

    # 화면 입력 값
    title = db.Column(db.Text, nullable=False)
    ticket_type = db.Column(db.Text, nullable=False)
    category = db.Column(db.Text)

    priority = db.Column(db.String(64), nullable=False)
    status = db.Column(db.String(64), nullable=False, server_default=db.text("'PENDING'"))

    requester_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    requester_dept_id = db.Column(db.Integer, db.ForeignKey('org_department.id'))

    assignee_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    assignee_dept_id = db.Column(db.Integer, db.ForeignKey('org_department.id'))
    assignee_json = db.Column(db.Text)  # JSON: [{"user_id":N,"name":"...","dept":"...","display":"..."}]

    target_object = db.Column(db.Text)
    due_at = db.Column(db.Text, nullable=False)
    detail = db.Column(db.Text)

    # 처리/완료 확장
    resolved_at = db.Column(db.Text)
    closed_at = db.Column(db.Text)
    resolution_summary = db.Column(db.Text)

    # 공통 메타
    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.Text)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))
    cleared = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    requester = db.relationship('UserProfile', foreign_keys=[requester_user_id], lazy='joined')
    assignee = db.relationship('UserProfile', foreign_keys=[assignee_user_id], lazy='joined')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')

    files = db.relationship(
        'SvcTicketFile',
        back_populates='ticket',
        cascade='all, delete-orphan',
        lazy='selectin',
        order_by='SvcTicketFile.id.asc()',
    )


class SvcTicketFile(db.Model):
    """티켓 첨부파일 (svc_ticket_file)"""

    __tablename__ = 'svc_ticket_file'
    __table_args__ = (
        db.Index('ix_svc_ticket_file_ticket_id', 'ticket_id'),
        db.Index('ix_svc_ticket_file_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.Integer, db.ForeignKey('svc_ticket.id', ondelete='CASCADE'), nullable=False)
    file_path = db.Column(db.Text, nullable=False)
    original_name = db.Column(db.Text, nullable=False)
    file_size = db.Column(db.Integer)
    content_type = db.Column(db.Text)

    uploaded_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    uploaded_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    ticket = db.relationship('SvcTicket', back_populates='files')
    uploaded_by = db.relationship('UserProfile', foreign_keys=[uploaded_by_user_id], lazy='joined')


class PrjProject(db.Model):
        """프로젝트 기본 테이블 (prj_project)

        Notes:
        - The requested DDL uses TEXT dates/timestamps (SQLite). We mirror that with
            Text columns + server defaults, similar to `SvcTicket`.
        - Soft delete uses integer flags (0/1).
        """

        __tablename__ = 'prj_project'
        __table_args__ = (
                db.Index('ix_prj_project_is_deleted', 'is_deleted'),
                db.Index('ix_prj_project_status', 'status'),
                db.Index('ix_prj_project_owner_dept_id', 'owner_dept_id'),
                db.Index('ix_prj_project_manager_user_id', 'manager_user_id'),
                db.Index('ix_prj_project_created_by_user_id', 'created_by_user_id'),
        )

        id = db.Column(db.Integer, primary_key=True)
        project_number = db.Column(db.String(20), unique=True, nullable=True)  # 자동 생성 프로젝트 번호 (예: PRJ-20260228-0001)

        # 기본 정보
        project_name = db.Column(db.Text, nullable=False)
        project_type = db.Column(db.Text, nullable=False)
        owner_dept_id = db.Column(db.Integer, db.ForeignKey('org_department.id'), nullable=False)
        manager_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
        priority = db.Column(db.Text)
        description = db.Column(db.Text)

        # GORF (Goal / Organization / Research / Finance)
        gorf_goal = db.Column(db.Text)
        gorf_organization = db.Column(db.Text)
        gorf_research = db.Column(db.Text)
        gorf_finance = db.Column(db.Text)

        # 진행/일정
        status = db.Column(db.String(64), nullable=False)
        budget_amount = db.Column(db.Integer)
        start_date = db.Column(db.Text)
        expected_end_date = db.Column(db.Text)
        task_count_cached = db.Column(db.Integer, nullable=False, server_default=db.text('0'))
        progress_percent = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

        # 비우기 (완료 목록 숨김)
        cleared = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

        # 공통 메타
        created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
        created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
        updated_at = db.Column(db.Text)
        updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'))
        is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

        @property
        def schedule_progress_rate(self):
            """시작일~종료일 기간 중 오늘 기준 일정 진행률(%) 계산"""
            from datetime import date as _date
            try:
                if not self.start_date or not self.expected_end_date:
                    return None
                sd = _date.fromisoformat(str(self.start_date).strip()[:10])
                ed = _date.fromisoformat(str(self.expected_end_date).strip()[:10])
                today = _date.today()
                total_days = (ed - sd).days
                if total_days <= 0:
                    return 100 if today >= ed else 0
                elapsed = (today - sd).days
                if elapsed <= 0:
                    return 0
                if elapsed >= total_days:
                    return 100
                return round(elapsed / total_days * 100)
            except Exception:
                return None

        owner_dept = db.relationship('OrgDepartment', foreign_keys=[owner_dept_id], lazy='joined')
        manager = db.relationship('UserProfile', foreign_keys=[manager_user_id], lazy='joined')
        created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
        updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')

        members = db.relationship(
            'PrjProjectMember',
            back_populates='project',
            cascade='all, delete-orphan',
            lazy='selectin',
            order_by='PrjProjectMember.id.asc()',
        )


class PrjProjectMember(db.Model):
    """프로젝트 참여자/리더 매핑 (prj_project_member)"""

    __tablename__ = 'prj_project_member'
    __table_args__ = (
        db.UniqueConstraint('project_id', 'user_id', name='uq_prj_project_member_project_user'),
        db.Index('ix_prj_project_member_project_id', 'project_id'),
        db.Index('ix_prj_project_member_user_id', 'user_id'),
        db.Index('ix_prj_project_member_member_role', 'member_role'),
        db.Index('ix_prj_project_member_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('prj_project.id', ondelete='CASCADE'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    member_role = db.Column(db.String(32), nullable=False, server_default=db.text("'MEMBER'"))

    cleared = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    project = db.relationship('PrjProject', back_populates='members')
    user = db.relationship('UserProfile', foreign_keys=[user_id], lazy='joined')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')


class PrjTabIntegrity(db.Model):
    """프로젝트 상세 탭: 통합 관리 (tab71)"""

    __tablename__ = 'prj_tab_integrity'
    __table_args__ = (
        db.Index('ix_prj_tab_integrity_project_id', 'project_id'),
        db.Index('ix_prj_tab_integrity_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('prj_project.id', ondelete='CASCADE'), nullable=False)
    payload_json = db.Column(db.Text, nullable=False)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.Text)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')


class PrjTabScope(db.Model):
    """프로젝트 상세 탭: 범위 관리 (tab72)"""

    __tablename__ = 'prj_tab_scope'
    __table_args__ = (
        db.Index('ix_prj_tab_scope_project_id', 'project_id'),
        db.Index('ix_prj_tab_scope_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('prj_project.id', ondelete='CASCADE'), nullable=False)
    payload_json = db.Column(db.Text, nullable=False)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.Text)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')


class PrjTabSchedule(db.Model):
    """프로젝트 상세 탭: 일정 관리 (tab73)"""

    __tablename__ = 'prj_tab_schedule'
    __table_args__ = (
        db.Index('ix_prj_tab_schedule_project_id', 'project_id'),
        db.Index('ix_prj_tab_schedule_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('prj_project.id', ondelete='CASCADE'), nullable=False)
    payload_json = db.Column(db.Text, nullable=False)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.Text)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')


class PrjTabCost(db.Model):
    """프로젝트 상세 탭: 비용 관리 (tab74)"""

    __tablename__ = 'prj_tab_cost'
    __table_args__ = (
        db.Index('ix_prj_tab_cost_project_id', 'project_id'),
        db.Index('ix_prj_tab_cost_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('prj_project.id', ondelete='CASCADE'), nullable=False)
    payload_json = db.Column(db.Text, nullable=False)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.Text)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')


class PrjCostDetail(db.Model):
    """비용 관리 탭 실제비용 상세 항목 (tab74 모달)"""

    __tablename__ = 'prj_cost_detail'
    __table_args__ = (
        db.Index('ix_prj_cost_detail_project_id', 'project_id'),
        db.Index('ix_prj_cost_detail_row_key', 'row_key'),
        db.Index('ix_prj_cost_detail_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('prj_project.id', ondelete='CASCADE'), nullable=False)
    row_key = db.Column(db.String(255), nullable=False)    # "구분|활동명" 식별자
    cost_date = db.Column(db.Text)                         # YYYY-MM-DD
    cost_type = db.Column(db.Text)                         # 인건비,외주비,장비구매,...
    content = db.Column(db.Text)                           # 내용
    erp_account = db.Column(db.Text)                       # ERP계정
    amount = db.Column(db.Float, nullable=False, server_default=db.text('0'))  # 금액
    registrant = db.Column(db.Text)                        # 등록자

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.Text)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')


class PrjTabQuality(db.Model):
    """프로젝트 상세 탭: 품질 관리 (tab75)"""

    __tablename__ = 'prj_tab_quality'
    __table_args__ = (
        db.Index('ix_prj_tab_quality_project_id', 'project_id'),
        db.Index('ix_prj_tab_quality_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('prj_project.id', ondelete='CASCADE'), nullable=False)
    payload_json = db.Column(db.Text, nullable=False)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.Text)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')


class PrjTabResource(db.Model):
    """프로젝트 상세 탭: 자원 관리 (tab76)"""

    __tablename__ = 'prj_tab_resource'
    __table_args__ = (
        db.Index('ix_prj_tab_resource_project_id', 'project_id'),
        db.Index('ix_prj_tab_resource_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('prj_project.id', ondelete='CASCADE'), nullable=False)
    payload_json = db.Column(db.Text, nullable=False)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.Text)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')


class PrjTabCommunication(db.Model):
    """프로젝트 상세 탭: 소통 관리 (tab77)"""

    __tablename__ = 'prj_tab_communication'
    __table_args__ = (
        db.Index('ix_prj_tab_communication_project_id', 'project_id'),
        db.Index('ix_prj_tab_communication_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('prj_project.id', ondelete='CASCADE'), nullable=False)
    payload_json = db.Column(db.Text, nullable=False)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.Text)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')


class PrjTabRisk(db.Model):
    """프로젝트 상세 탭: 위험 관리 (tab78)"""

    __tablename__ = 'prj_tab_risk'
    __table_args__ = (
        db.Index('ix_prj_tab_risk_project_id', 'project_id'),
        db.Index('ix_prj_tab_risk_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('prj_project.id', ondelete='CASCADE'), nullable=False)
    payload_json = db.Column(db.Text, nullable=False)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.Text)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')


class PrjTabProcurement(db.Model):
    """프로젝트 상세 탭: 조달 관리 (tab79)"""

    __tablename__ = 'prj_tab_procurement'
    __table_args__ = (
        db.Index('ix_prj_tab_procurement_project_id', 'project_id'),
        db.Index('ix_prj_tab_procurement_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('prj_project.id', ondelete='CASCADE'), nullable=False)
    payload_json = db.Column(db.Text, nullable=False)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.Text)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')


class PrjTabStakeholder(db.Model):
    """프로젝트 상세 탭: 이해관계자 관리 (tab80)"""

    __tablename__ = 'prj_tab_stakeholder'
    __table_args__ = (
        db.Index('ix_prj_tab_stakeholder_project_id', 'project_id'),
        db.Index('ix_prj_tab_stakeholder_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('prj_project.id', ondelete='CASCADE'), nullable=False)
    payload_json = db.Column(db.Text, nullable=False)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.Text)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')


class MsgRoom(db.Model):
    """채팅 대화방"""
    __tablename__ = 'msg_room'
    __table_args__ = (
        db.Index('ix_msg_room_type', 'room_type'),
        db.Index('ix_msg_room_direct_key', 'direct_key'),
    )

    id = db.Column(db.Integer, primary_key=True)
    room_type = db.Column(db.String(16), nullable=False)
    room_name = db.Column(db.String(255))
    direct_key = db.Column(db.String(255), unique=True)
    last_message_preview = db.Column(db.Text)
    last_message_at = db.Column(db.DateTime)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Boolean, nullable=False, default=False)

    members = db.relationship('MsgRoomMember', back_populates='room', cascade='all, delete-orphan', lazy='selectin')
    messages = db.relationship('MsgMessage', back_populates='room', cascade='all, delete-orphan', lazy='dynamic')

    def to_dict(self, include_members: bool = False) -> dict:
        payload = {
            'id': self.id,
            'room_type': self.room_type,
            'room_name': self.room_name,
            'direct_key': self.direct_key,
            'last_message_preview': self.last_message_preview,
            'last_message_at': self.last_message_at.isoformat() if self.last_message_at else None,
            'created_by_user_id': self.created_by_user_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'updated_by_user_id': self.updated_by_user_id,
            'is_deleted': bool(self.is_deleted),
        }
        if include_members:
            payload['members'] = [member.to_dict() for member in self.members if not member.left_at]
        return payload


class MsgRoomMember(db.Model):
    """대화방 참여자"""
    __tablename__ = 'msg_room_member'
    __table_args__ = (
        db.UniqueConstraint('room_id', 'user_id', name='uq_msg_room_member_room_user'),
        db.Index('ix_msg_room_member_user_id', 'user_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey('msg_room.id', ondelete='CASCADE'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    member_role = db.Column(db.String(32), nullable=False, default='MEMBER')
    is_favorite = db.Column(db.Boolean, nullable=False, default=False)
    is_muted = db.Column(db.Boolean, nullable=False, default=False)
    last_read_message_id = db.Column(db.Integer, db.ForeignKey('msg_message.id'))
    last_read_at = db.Column(db.DateTime)
    unread_count_cached = db.Column(db.Integer, default=0)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    left_at = db.Column(db.DateTime)

    room = db.relationship('MsgRoom', back_populates='members')
    user = db.relationship('UserProfile', lazy='joined')

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'room_id': self.room_id,
            'user_id': self.user_id,
            'member_role': self.member_role,
            'is_favorite': bool(self.is_favorite),
            'is_muted': bool(self.is_muted),
            'last_read_message_id': self.last_read_message_id,
            'last_read_at': self.last_read_at.isoformat() if self.last_read_at else None,
            'unread_count_cached': self.unread_count_cached,
            'joined_at': self.joined_at.isoformat() if self.joined_at else None,
            'left_at': self.left_at.isoformat() if self.left_at else None,
            'avatar': self.user.profile_image if self.user else None,
            'profile_image': self.user.profile_image if self.user else None,
            'user': {
                'id': self.user.id if self.user else None,
                'name': self.user.name if self.user else None,
                'department': self.user.department if self.user else None,
                'email': self.user.email if self.user else None,
                'profile_image': self.user.profile_image if self.user else None,
            } if self.user else None,
        }


class MsgMessage(db.Model):
    """채팅 메시지"""
    __tablename__ = 'msg_message'
    __table_args__ = (
        db.Index('ix_msg_message_room_id', 'room_id'),
        db.Index('ix_msg_message_sender_id', 'sender_user_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey('msg_room.id', ondelete='CASCADE'), nullable=False)
    sender_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    content_type = db.Column(db.String(32), nullable=False, default='TEXT')
    content_text = db.Column(db.Text)
    file_id = db.Column(db.Integer)
    reply_to_message_id = db.Column(db.Integer, db.ForeignKey('msg_message.id'))
    is_system = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    edited_at = db.Column(db.DateTime)
    is_deleted = db.Column(db.Boolean, nullable=False, default=False)
    deleted_at = db.Column(db.DateTime)

    room = db.relationship('MsgRoom', back_populates='messages', foreign_keys=[room_id])
    sender = db.relationship('UserProfile', foreign_keys=[sender_user_id], lazy='joined')
    reply_to = db.relationship('MsgMessage', remote_side=[id], uselist=False)

    def to_dict(self, include_sender: bool = True) -> dict:
        payload = {
            'id': self.id,
            'room_id': self.room_id,
            'sender_user_id': self.sender_user_id,
            'content_type': self.content_type,
            'content_text': self.content_text,
            'file_id': self.file_id,
            'reply_to_message_id': self.reply_to_message_id,
            'is_system': bool(self.is_system),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'edited_at': self.edited_at.isoformat() if self.edited_at else None,
            'is_deleted': bool(self.is_deleted),
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
        }
        if include_sender and self.sender:
            payload['sender'] = {
                'id': self.sender.id,
                'name': self.sender.name,
                'department': self.sender.department,
                'email': self.sender.email,
            }
        return payload


class MsgFile(db.Model):
    """메시지 첨부 파일 메타"""
    __tablename__ = 'msg_file'

    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey('msg_message.id', ondelete='CASCADE'), nullable=False)
    file_path = db.Column(db.String(1024), nullable=False)
    original_name = db.Column(db.String(512), nullable=False)
    file_size = db.Column(db.Integer)
    content_type = db.Column(db.String(255))
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    uploaded_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)

    message = db.relationship('MsgMessage', lazy='joined')
    uploader = db.relationship('UserProfile', foreign_keys=[uploaded_by_user_id], lazy='joined')

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'message_id': self.message_id,
            'file_path': self.file_path,
            'original_name': self.original_name,
            'file_size': self.file_size,
            'content_type': self.content_type,
            'uploaded_at': self.uploaded_at.isoformat() if self.uploaded_at else None,
            'uploaded_by_user_id': self.uploaded_by_user_id,
        }


class Blog(db.Model):
    """Insight > Blog > IT Blog posts.

    Note: Attachments are stored as JSON text metadata (temporary).
    """

    __tablename__ = 'blog'
    __table_args__ = (
        db.Index('ix_blog_created_at', 'created_at'),
    )

    id = db.Column(db.Integer, primary_key=True)

    title = db.Column(db.String(255), nullable=False)
    content_html = db.Column(db.Text, nullable=False)
    tags = db.Column(db.Text)

    image_data_url = db.Column(db.Text)
    attachments_json = db.Column(db.Text)

    author = db.Column(db.String(120))

    created_at = db.Column(db.DateTime, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.DateTime)

    comments = db.relationship('BlogComment', back_populates='post', cascade='all, delete-orphan', lazy='select')
    likes = db.relationship('BlogLike', back_populates='post', cascade='all, delete-orphan', lazy='select')

    def to_item(self, include_content: bool = False) -> dict:
        payload = {
            'id': self.id,
            'title': self.title,
            'author': self.author,
            'tags': self.tags,
            'imageDataUrl': self.image_data_url,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_content:
            payload['contentHtml'] = self.content_html
            payload['attachments'] = self.attachments_json
        return payload


class BlogComment(db.Model):
    """Insight > Blog > Comments (supports replies via parent_id)."""

    __tablename__ = 'blog_comment'
    __table_args__ = (
        db.Index('ix_blog_comment_post_id', 'post_id'),
        db.Index('ix_blog_comment_parent_id', 'parent_id'),
        db.Index('ix_blog_comment_created_by_user_id', 'created_by_user_id'),
        db.Index('ix_blog_comment_created_at', 'created_at'),
        db.Index('ix_blog_comment_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey('blog.id', ondelete='CASCADE'), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey('blog_comment.id', ondelete='CASCADE'), nullable=True)

    content = db.Column(db.Text, nullable=False)

    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    created_at = db.Column(db.DateTime, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    post = db.relationship('Blog', back_populates='comments', lazy='joined')
    author = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    parent = db.relationship('BlogComment', remote_side=[id], uselist=False)
    likes = db.relationship('BlogCommentLike', back_populates='comment', cascade='all, delete-orphan', lazy='select')

    def to_item(self) -> dict:
        name = ''
        dept = ''
        avatar = ''
        try:
            if self.author is not None:
                name = (self.author.name or self.author.emp_no or '').strip()
                dept = (getattr(self.author, 'department', '') or '').strip()
                try:
                    ref = getattr(self.author, 'department_ref', None)
                    if ref is not None:
                        dept = (getattr(ref, 'dept_name', '') or '').strip() or dept
                except Exception:
                    pass
                avatar = (getattr(self.author, 'profile_image', '') or '').strip()
        except Exception:
            pass

        return {
            'id': self.id,
            'postId': self.post_id,
            'parentId': self.parent_id,
            'content': self.content,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'createdAtMs': int(self.created_at.timestamp() * 1000) if self.created_at else None,
            'authorName': name,
            'authorDepartment': dept,
            'authorAvatarUrl': avatar,
        }


class BlogLike(db.Model):
    """Insight > Blog > Likes (1 vote per user per post)."""

    __tablename__ = 'blog_like'
    __table_args__ = (
        db.Index('ix_blog_like_post_id', 'post_id'),
        db.Index('ix_blog_like_created_by_user_id', 'created_by_user_id'),
        db.UniqueConstraint('post_id', 'created_by_user_id', name='uq_blog_like_post_user'),
    )

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey('blog.id', ondelete='CASCADE'), nullable=False)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='CASCADE'), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))

    post = db.relationship('Blog', back_populates='likes', lazy='joined')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')


class BlogCommentLike(db.Model):
    """Insight > Blog > Comment Likes (1 vote per user per comment)."""

    __tablename__ = 'blog_comment_like'
    __table_args__ = (
        db.Index('ix_blog_comment_like_comment_id', 'comment_id'),
        db.Index('ix_blog_comment_like_created_by_user_id', 'created_by_user_id'),
        db.UniqueConstraint('comment_id', 'created_by_user_id', name='uq_blog_comment_like_comment_user'),
    )

    id = db.Column(db.Integer, primary_key=True)
    comment_id = db.Column(db.Integer, db.ForeignKey('blog_comment.id', ondelete='CASCADE'), nullable=False)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='CASCADE'), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))

    comment = db.relationship('BlogComment', back_populates='likes', lazy='joined')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')


class NetVpnPartner(db.Model):
    """VPN 기관(파트너)

    - 1:N -> NetVpnLine
    """

    __tablename__ = 'net_vpn_partner'
    __table_args__ = (
        db.Index('ix_net_vpn_partner_partner_type', 'partner_type'),
        db.Index('ix_net_vpn_partner_org_name', 'org_name'),
        db.Index('ix_net_vpn_partner_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    partner_type = db.Column(db.String(64), nullable=False, server_default=db.text("'DEFAULT'"))
    org_name = db.Column(db.String(255), nullable=False)
    note = db.Column(db.Text)

    created_at = db.Column(db.DateTime, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    updated_at = db.Column(db.DateTime)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')
    lines = db.relationship('NetVpnLine', back_populates='partner', cascade='all, delete-orphan', lazy='selectin')


class NetVpnLine(db.Model):
    """VPN 회선

    - N:1 -> NetVpnPartner
    - 1:N -> NetVpnLineDevice
    """

    __tablename__ = 'net_vpn_line'
    __table_args__ = (
        db.Index('ix_net_vpn_line_partner_id', 'vpn_partner_id'),
        db.Index('ix_net_vpn_line_scope', 'scope'),
        db.Index('ix_net_vpn_line_status', 'status'),
        db.Index('ix_net_vpn_line_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    vpn_partner_id = db.Column(db.Integer, db.ForeignKey('net_vpn_partner.id', ondelete='CASCADE'), nullable=False)

    # VPN 정책 탭 구분 (VPN1~VPN5)
    scope = db.Column(db.String(32), nullable=False, server_default=db.text("'VPN1'"))

    status = db.Column(db.String(64))
    line_speed = db.Column(db.String(64))
    line_count = db.Column(db.Integer)
    protocol = db.Column(db.String(32))
    manager = db.Column(db.String(255))
    cipher = db.Column(db.String(255))
    upper_country = db.Column(db.String(255))
    upper_country_address = db.Column(db.String(512))
    lower_country = db.Column(db.String(255))
    lower_country_address = db.Column(db.String(512))
    note = db.Column(db.Text)

    created_at = db.Column(db.DateTime, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    updated_at = db.Column(db.DateTime)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    partner = db.relationship('NetVpnPartner', back_populates='lines', lazy='joined')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')
    devices = db.relationship('NetVpnLineDevice', back_populates='line', cascade='all, delete-orphan', lazy='selectin')
    managers = db.relationship(
        'NetVpnLineManager',
        back_populates='line',
        lazy='select',
        cascade='all, delete-orphan',
        passive_deletes=True,
    )


class NetVpnLineManager(db.Model):
    """VPN 회선 담당자 정보 (1:N)

    - 소프트 삭제: is_deleted
    - vpn_line_id 기준으로 VPN 상세(담당자 탭)에서 CRUD
    """

    __tablename__ = 'net_vpn_line_manager'
    __table_args__ = (
        db.Index('ix_net_vpn_line_manager_vpn_line_id', 'vpn_line_id'),
        db.Index('ix_net_vpn_line_manager_is_deleted', 'is_deleted'),
        db.Index('ix_net_vpn_line_manager_name', 'name'),
    )

    id = db.Column(db.Integer, primary_key=True)
    vpn_line_id = db.Column(db.Integer, db.ForeignKey('net_vpn_line.id', ondelete='CASCADE'), nullable=False)

    org = db.Column(db.String(255))
    name = db.Column(db.String(255))
    role = db.Column(db.String(255))
    phone = db.Column(db.String(64))
    email = db.Column(db.String(255))
    remark = db.Column(db.Text)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    updated_at = db.Column(db.Text)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    line = db.relationship('NetVpnLine', back_populates='managers', lazy='joined')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')


class NetVpnLineDevice(db.Model):
    """VPN 회선 장비"""

    __tablename__ = 'net_vpn_line_device'
    __table_args__ = (
        db.Index('ix_net_vpn_line_device_line_id', 'vpn_line_id'),
        db.Index('ix_net_vpn_line_device_device_name', 'device_name'),
        db.Index('ix_net_vpn_line_device_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    vpn_line_id = db.Column(db.Integer, db.ForeignKey('net_vpn_line.id', ondelete='CASCADE'), nullable=False)
    device_name = db.Column(db.String(255), nullable=False)
    note = db.Column(db.Text)

    created_at = db.Column(db.DateTime, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    updated_at = db.Column(db.DateTime)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    line = db.relationship('NetVpnLine', back_populates='devices', lazy='joined')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')


class NetVpnLineCommunication(db.Model):
    """VPN 회선 통신정책 항목 (1:N per VPN line)

    - 자사정보: 구분, 회선, 업무명, REAL IP, L4 IP, NAT IP, PORT, VPN IP
    - 방향
    - 기관정보: VPN IP, N/W IP, PORT
    - 소프트 삭제: is_deleted
    """

    __tablename__ = 'net_vpn_line_communication'
    __table_args__ = (
        db.Index('ix_net_vpn_line_comm_vpn_line_id', 'vpn_line_id'),
        db.Index('ix_net_vpn_line_comm_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    vpn_line_id = db.Column(db.Integer, db.ForeignKey('net_vpn_line.id', ondelete='CASCADE'), nullable=False)

    # 자사정보
    self_division = db.Column(db.String(255))          # 구분
    line = db.Column(db.String(255))                    # 회선
    work_name = db.Column(db.String(255))               # 업무명
    real_ip = db.Column(db.Text)                        # REAL IP (다중 줄)
    l4_ip = db.Column(db.Text)                          # L4 IP (다중 줄)
    nat_ip = db.Column(db.Text)                         # NAT IP (다중 줄)
    port_self = db.Column(db.String(255))               # PORT (자사)
    vpn_ip_self = db.Column(db.Text)                    # VPN IP (자사, 다중 줄)

    # 방향
    direction = db.Column(db.String(8))                 # < 또는 >

    # 기관정보
    vpn_ip_org = db.Column(db.Text)                     # VPN IP (기관, 다중 줄)
    nw_ip_org = db.Column(db.Text)                      # N/W IP (기관, 다중 줄)
    port_org = db.Column(db.String(255))                # PORT (기관)

    # 정렬 순서
    sort_order = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    updated_at = db.Column(db.Text)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    vpn_line = db.relationship('NetVpnLine', backref=db.backref('communications', lazy='select', cascade='all, delete-orphan', passive_deletes=True), lazy='joined')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')


class NetVpnLinePolicy(db.Model):
    """VPN 상세설정 (IPSEC SA / ISAKMP SA / CID / IP / 비고)

    VPN 회선(net_vpn_line)당 1건. 자사(_self) / 기관(_org) 양쪽 값을 저장.
    """

    __tablename__ = 'net_vpn_line_policy'
    __table_args__ = (
        db.Index('ix_net_vpn_line_policy_vpn_line_id', 'vpn_line_id'),
        db.Index('ix_net_vpn_line_policy_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    vpn_line_id = db.Column(db.Integer, db.ForeignKey('net_vpn_line.id', ondelete='CASCADE'), nullable=False, unique=True)

    # Hardware
    model_self = db.Column(db.String(255))
    model_org = db.Column(db.String(255))
    fw_self = db.Column(db.String(255))
    fw_org = db.Column(db.String(255))

    # IPSEC SA
    ipsec_life_self = db.Column(db.String(255))
    ipsec_life_org = db.Column(db.String(255))
    mode_self = db.Column(db.String(255))
    mode_org = db.Column(db.String(255))
    method_self = db.Column(db.String(255))
    method_org = db.Column(db.String(255))
    pfs_self = db.Column(db.String(255))
    pfs_org = db.Column(db.String(255))
    retrans_self = db.Column(db.String(255))
    retrans_org = db.Column(db.String(255))
    cipher_proto_self = db.Column(db.String(255))
    cipher_proto_org = db.Column(db.String(255))
    cipher_algo_self = db.Column(db.String(255))
    cipher_algo_org = db.Column(db.String(255))
    auth_algo_self = db.Column(db.String(255))
    auth_algo_org = db.Column(db.String(255))

    # ISAKMP SA
    isakmp_life_self = db.Column(db.String(255))
    isakmp_life_org = db.Column(db.String(255))
    isakmp_mode_self = db.Column(db.String(255))
    isakmp_mode_org = db.Column(db.String(255))
    ike_auth_self = db.Column(db.String(255))
    ike_auth_org = db.Column(db.String(255))
    ike_time_self = db.Column(db.String(255))
    ike_time_org = db.Column(db.String(255))
    psk_self = db.Column(db.String(255))
    psk_org = db.Column(db.String(255))
    dpd_self = db.Column(db.String(255))
    dpd_org = db.Column(db.String(255))
    isakmp_cipher_self = db.Column(db.String(255))
    isakmp_cipher_org = db.Column(db.String(255))
    hash_algo_self = db.Column(db.String(255))
    hash_algo_org = db.Column(db.String(255))
    dh_group_self = db.Column(db.String(255))
    dh_group_org = db.Column(db.String(255))
    local_id_type_self = db.Column(db.String(255))
    local_id_type_org = db.Column(db.String(255))
    local_id_active_self = db.Column(db.String(255))
    local_id_active_org = db.Column(db.String(255))
    local_id_standby_self = db.Column(db.String(255))
    local_id_standby_org = db.Column(db.String(255))

    # CID
    cid_active_self = db.Column(db.String(255))
    cid_active_org = db.Column(db.String(255))
    cid_standby_self = db.Column(db.String(255))
    cid_standby_org = db.Column(db.String(255))

    # IP
    peer_ip_self = db.Column(db.String(255))
    peer_ip_org = db.Column(db.String(255))

    # 비고
    note_self = db.Column(db.Text)
    note_org = db.Column(db.Text)

    # audit
    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    updated_at = db.Column(db.Text)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    vpn_line = db.relationship('NetVpnLine', backref=db.backref('policy', uselist=False, lazy='select', cascade='all, delete-orphan', passive_deletes=True), lazy='joined')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')


class NetLeasedLine(db.Model):
    """전용회선 정책 관리

    - 탭 구분: line_group (MEMBER/CUSTOMER/VAN/PARTNER/INHOUSE)
    - 1행에 회선 + 장비(1:1) + 관할(1:1) 포함
    - 소프트 삭제: is_deleted
    """

    __tablename__ = 'net_leased_line'
    __table_args__ = (
        db.UniqueConstraint('line_group', 'line_no', name='uq_net_leased_line_group_no'),
        db.Index('ix_net_leased_line_line_group', 'line_group'),
        db.Index('ix_net_leased_line_org_name', 'org_name'),
        db.Index('ix_net_leased_line_line_no', 'line_no'),
        db.Index('ix_net_leased_line_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)

    # 탭 구분
    line_group = db.Column(db.String(32), nullable=False)

    # 기본
    org_name = db.Column(db.String(255), nullable=False)
    status_code = db.Column(db.String(64), nullable=False)
    carrier_code = db.Column(db.String(64))
    protocol_code = db.Column(db.String(64))
    management_owner = db.Column(db.String(255))

    # 회선
    line_no = db.Column(db.String(255), nullable=False)
    line_name = db.Column(db.String(255))
    business_purpose = db.Column(db.String(255))
    speed_label = db.Column(db.String(64))
    opened_date = db.Column(db.String(32))
    closed_date = db.Column(db.String(32))
    dr_line_no = db.Column(db.String(255))

    # 장비 (1:1)
    device_name = db.Column(db.String(255))
    comm_device = db.Column(db.String(255))
    slot_no = db.Column(db.Integer)
    port_no = db.Column(db.String(64))
    child_device_name = db.Column(db.String(255))
    child_port_no = db.Column(db.String(64))

    # 관할 (1:1)
    our_jurisdiction = db.Column(db.String(255))
    org_jurisdiction = db.Column(db.String(255))

    # 기타
    remark = db.Column(db.Text)

    # 공통 메타
    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.Text)
    updated_by = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    created_by_user = db.relationship('UserProfile', foreign_keys=[created_by], lazy='joined')
    updated_by_user = db.relationship('UserProfile', foreign_keys=[updated_by], lazy='joined')

    managers = db.relationship(
        'NetLeasedLineManager',
        back_populates='line',
        lazy='select',
        cascade='all, delete-orphan',
        passive_deletes=True,
    )


class NetLeasedLineManager(db.Model):
    """전용회선 담당자 정보 (1:N)

    - 소프트 삭제: is_deleted
    - line_id 기준으로 전용회선 상세(담당자 탭)에서 CRUD
    """

    __tablename__ = 'net_leased_line_manager'
    __table_args__ = (
        db.Index('ix_net_leased_line_manager_line_id', 'line_id'),
        db.Index('ix_net_leased_line_manager_is_deleted', 'is_deleted'),
        db.Index('ix_net_leased_line_manager_name', 'name'),
    )

    id = db.Column(db.Integer, primary_key=True)
    line_id = db.Column(db.Integer, db.ForeignKey('net_leased_line.id', ondelete='CASCADE'), nullable=False)

    org = db.Column(db.String(255))
    name = db.Column(db.String(255))
    role = db.Column(db.String(255))
    phone = db.Column(db.String(64))
    email = db.Column(db.String(255))
    remark = db.Column(db.Text)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    updated_at = db.Column(db.Text)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    line = db.relationship('NetLeasedLine', back_populates='managers', lazy='joined')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')


class NetLeasedLineDiagram(db.Model):
    """전용회선 구성도(파일) (1:1)

    테이블명은 기존 요청에 맞춰 'diagram'을 사용합니다.
    - line_id(전용회선) 당 1개만 유지(업로드 시 갱신)
    - 파일은 로컬 저장(UPLOAD_FOLDER/instance/uploads 하위)
    - 삭제는 is_deleted=1 + 파일 제거
    """

    __tablename__ = 'diagram'
    __table_args__ = (
        db.UniqueConstraint('line_id', name='uq_diagram_line_id'),
        db.Index('ix_diagram_line_id', 'line_id'),
        db.Index('ix_diagram_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    line_id = db.Column(db.Integer, db.ForeignKey('net_leased_line.id', ondelete='CASCADE'), nullable=False)

    file_path = db.Column(db.Text)
    original_name = db.Column(db.Text)
    file_size = db.Column(db.Integer)
    content_type = db.Column(db.Text)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    updated_at = db.Column(db.Text)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    line = db.relationship('NetLeasedLine', lazy='joined')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'line_id': self.line_id,
            'file_path': self.file_path,
            'original_name': self.original_name,
            'file_size': self.file_size,
            'content_type': self.content_type,
            'created_at': self.created_at,
            'created_by_user_id': self.created_by_user_id,
            'updated_at': self.updated_at,
            'updated_by_user_id': self.updated_by_user_id,
            'is_deleted': int(self.is_deleted or 0),
        }


# ---------------------------------------------------------------------------
# Governance: Backup policy management
# ---------------------------------------------------------------------------


class BkLibrary(db.Model):
    """백업 라이브러리 (bk_library)

    - backup_device_asset_id: hardware_asset.id (asset_category='STORAGE', asset_type='BACKUP')
    - 소프트 삭제: is_deleted
    """

    __tablename__ = 'bk_library'
    __table_args__ = (
        db.Index('ix_bk_library_backup_device_asset_id', 'backup_device_asset_id'),
        db.Index('ix_bk_library_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)

    library_name = db.Column(db.String(255), nullable=False, unique=True)
    backup_device_asset_id = db.Column(db.Integer, nullable=False)

    remark = db.Column(db.Text)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.Text)
    updated_by = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))
    version = db.Column(db.Integer, nullable=False, server_default=db.text('1'))

    created_by_user = db.relationship('UserProfile', foreign_keys=[created_by], lazy='joined')
    updated_by_user = db.relationship('UserProfile', foreign_keys=[updated_by], lazy='joined')


class BkLocation(db.Model):
    """백업 위치 (bk_location)

    - 소프트 삭제: is_deleted
    """

    __tablename__ = 'bk_location'
    __table_args__ = (
        db.Index('ix_bk_location_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)

    location_name = db.Column(db.String(255), nullable=False, unique=True)
    location_detail = db.Column(db.Text)
    remark = db.Column(db.Text)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.Text)
    updated_by = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    created_by_user = db.relationship('UserProfile', foreign_keys=[created_by], lazy='joined')
    updated_by_user = db.relationship('UserProfile', foreign_keys=[updated_by], lazy='joined')


class BkTape(db.Model):
    """백업 테이프 (bk_tape)

    요청 컬럼:
    - backup_id, backup_policy_name
    - retention_type (단기 보관/장기 보관)
    - backup_size_k (INTEGER)
    - backup_size_t (GENERATED: K -> T)
    - library_id (bk_library)
    - backup_created_date (YYYY-MM-DD), backup_created_year (YYYY)
    - backup_expired_date (YYYY-MM-DD)
    - backup_status (Active/Full/Suspended)
    - location_id (bk_location)
    - remark
    """

    __tablename__ = 'bk_tape'
    __table_args__ = (
        db.Index('ix_bk_tape_library', 'library_id', 'is_deleted'),
        db.Index('ix_bk_tape_location', 'location_id', 'is_deleted'),
        db.Index('ix_bk_tape_is_deleted', 'is_deleted'),
        db.UniqueConstraint('backup_id', name='ux_bk_tape_backup_id'),
    )

    id = db.Column(db.Integer, primary_key=True)

    backup_id = db.Column(db.String(255), nullable=False)
    backup_policy_name = db.Column(db.String(255), nullable=False)

    retention_type = db.Column(db.String(32), nullable=False)

    backup_size_k = db.Column(db.Integer, nullable=False)
    backup_size_t = db.Column(
        db.Float,
        Computed('ROUND(backup_size_k / 1099511627776.0, 6)', persisted=True),
    )

    library_id = db.Column(db.Integer, db.ForeignKey('bk_library.id'), nullable=False)

    backup_created_date = db.Column(db.String(32), nullable=False)
    backup_created_year = db.Column(db.Integer, nullable=False)
    backup_expired_date = db.Column(db.String(32))

    backup_status = db.Column(db.String(32), nullable=False)

    location_id = db.Column(db.Integer, db.ForeignKey('bk_location.id'), nullable=False)

    remark = db.Column(db.Text)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.Text)
    updated_by = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    library = db.relationship('BkLibrary', foreign_keys=[library_id], lazy='joined')
    location = db.relationship('BkLocation', foreign_keys=[location_id], lazy='joined')
    created_by_user = db.relationship('UserProfile', foreign_keys=[created_by], lazy='joined')
    updated_by_user = db.relationship('UserProfile', foreign_keys=[updated_by], lazy='joined')


class BkStoragePool(db.Model):
    """스토리지 풀 기준설정 (bk_storage_pool)

    NOTE:
    - storage_asset_id 는 hardware_asset.db(서비스 레이어 sqlite) 기준 id 를 참조하는 정수값입니다.
      (메인 DB와 분리된 DB일 수 있어 FK 제약은 두지 않습니다.)
    - 소프트 삭제: is_deleted
    """

    __tablename__ = 'bk_storage_pool'
    __table_args__ = (
        db.Index('ix_bk_storage_pool_storage_asset_id', 'storage_asset_id'),
        db.Index('ix_bk_storage_pool_is_deleted', 'is_deleted'),
        db.UniqueConstraint('pool_name', name='ux_bk_storage_pool_pool_name'),
    )

    id = db.Column(db.Integer, primary_key=True)

    pool_name = db.Column(db.String(255), nullable=False)
    storage_asset_id = db.Column(db.Integer, nullable=False)

    remark = db.Column(db.Text)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.Text)
    updated_by = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))
    version = db.Column(db.Integer, nullable=False, server_default=db.text('1'))

    created_by_user = db.relationship('UserProfile', foreign_keys=[created_by], lazy='joined')
    updated_by_user = db.relationship('UserProfile', foreign_keys=[updated_by], lazy='joined')


class BkBackupTargetPolicy(db.Model):
    """백업 대상 정책 (bk_backup_target_policy)

    - backup_scope: 내부망/외부망
    - retention: retention_value + retention_unit(주/월/년/Infinity)
    - storage_pool_id: bk_storage_pool.id
    - 소프트 삭제: is_deleted
    """

    __tablename__ = 'bk_backup_target_policy'
    __table_args__ = (
        db.Index('ix_bk_backup_target_policy_pool', 'storage_pool_id', 'is_deleted'),
        db.Index('ix_bk_backup_target_policy_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)

    backup_scope = db.Column(db.String(32), nullable=False)
    business_name = db.Column(db.Text)
    system_name = db.Column(db.Text, nullable=False)
    ip_address = db.Column(db.Text)

    backup_policy_name = db.Column(db.Text, nullable=False)
    backup_directory = db.Column(db.Text, nullable=False)

    data_type = db.Column(db.String(16), nullable=False)
    backup_grade = db.Column(db.String(16), nullable=False)

    retention_value = db.Column(db.Integer)
    retention_unit = db.Column(db.String(16))

    storage_pool_id = db.Column(db.Integer, db.ForeignKey('bk_storage_pool.id'), nullable=False)

    offsite_yn = db.Column(db.String(1), nullable=False)
    media_type = db.Column(db.String(64), nullable=False)

    # Structured schedule fields (preferred by new UI)
    # - schedule_period: 매일/매주/매달/매년
    # - schedule_weekday: 월/화/수/목/금/토/일 (매주일 때만)
    # - schedule_day: 1~31 (매달일 때만)
    schedule_period = db.Column(db.String(16))
    schedule_weekday = db.Column(db.String(8))
    schedule_day = db.Column(db.Integer)

    # Legacy free-text schedule (kept for backward compatibility)
    schedule_name = db.Column(db.Text)
    start_time = db.Column(db.String(16))

    remark = db.Column(db.Text)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.Text)
    updated_by = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))
    version = db.Column(db.Integer, nullable=False, server_default=db.text('1'))

    storage_pool = db.relationship('BkStoragePool', foreign_keys=[storage_pool_id], lazy='joined')
    created_by_user = db.relationship('UserProfile', foreign_keys=[created_by], lazy='joined')
    updated_by_user = db.relationship('UserProfile', foreign_keys=[updated_by], lazy='joined')


class HwServerBackupPolicy(db.Model):
        """서버 상세: 백업정책 탭(tab03-backup) 저장용 (hw_server_backup_policy)

        NOTE:
        - asset_id 는 hardware_asset.db(서비스 레이어 sqlite) 기준 id 를 참조하는 정수값입니다.
            (메인 DB와 분리된 DB일 수 있어 FK 제약은 두지 않습니다.)
        - 소프트 삭제: is_deleted
        """

        __tablename__ = 'hw_server_backup_policy'
        __table_args__ = (
                db.Index('ix_hw_server_bk_policy_asset', 'asset_category', 'asset_id', 'is_deleted'),
                db.Index('ix_hw_server_bk_policy_is_deleted', 'is_deleted'),
        )

        id = db.Column(db.Integer, primary_key=True)

        # ON_PREMISE / CLOUD / WORKSTATION
        asset_category = db.Column(db.String(32), nullable=False)
        asset_id = db.Column(db.Integer, nullable=False)

        policy_name = db.Column(db.Text, nullable=False)
        backup_directory = db.Column(db.Text, nullable=False)
        library = db.Column(db.Text)
        data = db.Column(db.Text)
        grade = db.Column(db.Text)
        retention = db.Column(db.Text)
        offsite_yn = db.Column(db.String(1))
        media = db.Column(db.Text)
        schedule = db.Column(db.Text)
        start_time = db.Column(db.String(16))

        created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
        updated_at = db.Column(db.Text)
        is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))


class HwServerVulnerability(db.Model):
    """서버 상세: 취약점 탭(tab12-vulnerability) 저장용 (hw_server_vulnerability)

    NOTE:
    - asset_id 는 hardware_asset.db(서비스 레이어 sqlite) 기준 id 를 참조하는 정수값입니다.
        (메인 DB와 분리된 DB일 수 있어 FK 제약은 두지 않습니다.)
    - 소프트 삭제: is_deleted
    """

    __tablename__ = 'hw_server_vulnerability'
    __table_args__ = (
        db.Index('ix_hw_server_vl_asset', 'asset_category', 'asset_id', 'is_deleted'),
        db.Index('ix_hw_server_vl_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)

    # ON_PREMISE / CLOUD / WORKSTATION
    asset_category = db.Column(db.String(32), nullable=False)
    asset_id = db.Column(db.Integer, nullable=False)

    category = db.Column(db.Text, nullable=False)
    item = db.Column(db.Text, nullable=False)
    severity = db.Column(db.String(8), nullable=False)  # 상/중/하
    code = db.Column(db.Text)
    content = db.Column(db.Text)
    result = db.Column(db.String(16), nullable=False)  # 양호/취약
    action_yn = db.Column(db.String(8))  # O/X
    remark = db.Column(db.Text)

    # Extended schema (2026-01): new Tab12 fields
    check_category = db.Column(db.Text)
    check_code = db.Column(db.Text)
    check_topic = db.Column(db.Text)
    check_subtopic = db.Column(db.Text)

    check_overview = db.Column(db.Text)
    check_standard = db.Column(db.Text)
    check_result = db.Column(db.Text)
    action_method = db.Column(db.Text)

    action_status = db.Column(db.String(16))  # 완료/미완료
    action_due_date = db.Column(db.Text)  # YYYY-MM-DD

    worker_name = db.Column(db.String(128))

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.Text)
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))


class HwStorageBasic(db.Model):
    """스토리지 상세: 구성/관리 정보 탭(tab31-basic-storage) 저장용 (hw_storage_basic)

    NOTE:
    - asset_id 는 hardware_asset.db(서비스 레이어 sqlite) 기준 id 를 참조하는 정수값입니다.
        (메인 DB와 분리된 DB일 수 있어 FK 제약은 두지 않습니다.)
    - asset_type: STORAGE(스토리지) / BACKUP(백업 스토리지)
    - 소프트 삭제: is_deleted
    """

    __tablename__ = 'hw_storage_basic'
    __table_args__ = (
        db.Index('ix_hw_storage_basic_asset', 'asset_type', 'asset_id', 'is_deleted'),
        db.Index('ix_hw_storage_basic_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)

    asset_type = db.Column(db.String(16), nullable=False)
    asset_id = db.Column(db.Integer, nullable=False)

    physical_total = db.Column(db.Text)
    logical_total = db.Column(db.Text)
    raid_level = db.Column(db.Text)
    allocated_total = db.Column(db.Text)
    unallocated_total = db.Column(db.Text)
    cache_memory = db.Column(db.Text)
    volume_count = db.Column(db.Integer)
    host_count = db.Column(db.Integer)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.Text)
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))


# ---------------------------------------------------------------------------
# Governance: DR policy - training management
# ---------------------------------------------------------------------------


class DrTraining(db.Model):
    """재해복구 모의훈련 이력 (dr_training)

    UI 필드 매핑(프론트):
    - id -> training_id
    - train_date -> training_date
    - train_name -> training_name
    - train_type -> training_type
    - status -> training_status
    - result -> training_result
    - target_systems -> target_system_count
    - participant_count -> participant_count
    - orgs -> participant_org
    - recovery_time -> recovery_time_text (+ parsing -> recovery_time_minutes)
    - note -> training_remark
    """

    __tablename__ = 'dr_training'
    __table_args__ = (
        db.Index('idx_dr_training_year_date', 'training_year', 'training_date'),
        db.Index('idx_dr_training_status', 'training_status'),
        db.Index('idx_dr_training_result', 'training_result'),
        db.Index('idx_dr_training_deleted', 'is_deleted'),
    )

    training_id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    training_year = db.Column(db.Integer, nullable=False)
    # Store as ISO text (YYYY-MM-DD) for SQLite portability and lexicographic ordering.
    training_date = db.Column(db.String(20), nullable=False)
    training_name = db.Column(db.String(200), nullable=False)

    training_type = db.Column(db.String(30), nullable=False)
    training_status = db.Column(db.String(20), nullable=False)
    training_result = db.Column(db.String(20), nullable=False)

    target_system_count = db.Column(db.Integer, nullable=False, server_default=db.text('0'))
    participant_count = db.Column(db.Integer, nullable=False, server_default=db.text('0'))
    participant_org = db.Column(db.String(200))

    recovery_time_minutes = db.Column(db.Integer)
    recovery_time_text = db.Column(db.String(50))

    training_remark = db.Column(db.Text)

    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))

    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    updated_at = db.Column(db.Text)

    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))
    version = db.Column(db.Integer, nullable=False, server_default=db.text('1'))

    created_by_user = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by_user = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')


class NetLeasedLineAttachment(db.Model):
    """전용회선 첨부파일 (1:N)

    - 파일 자체는 /api/uploads (간단 로컬 저장소)로 저장
    - 이 테이블은 전용회선(line_id)과 업로드 토큰(upload_token)을 연결
    - 삭제는 is_deleted=1 (소프트 삭제)
    """

    __tablename__ = 'net_leased_line_attachment'
    __table_args__ = (
        db.Index('ix_net_leased_line_attachment_line_id', 'line_id'),
        db.Index('ix_net_leased_line_attachment_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    line_id = db.Column(db.Integer, db.ForeignKey('net_leased_line.id', ondelete='CASCADE'), nullable=False)

    file_name = db.Column(db.Text, nullable=False)
    file_path = db.Column(db.Text)
    file_size = db.Column(db.Integer, nullable=False, server_default=db.text('0'))
    mime_type = db.Column(db.Text)
    upload_token = db.Column(db.Text)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    updated_at = db.Column(db.Text)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    line = db.relationship('NetLeasedLine', lazy='joined')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'line_id': self.line_id,
            'file_name': self.file_name,
            'file_path': self.file_path,
            'file_size': int(self.file_size or 0),
            'mime_type': self.mime_type,
            'upload_token': self.upload_token,
            'created_at': self.created_at,
            'created_by_user_id': self.created_by_user_id,
            'updated_at': self.updated_at,
            'updated_by_user_id': self.updated_by_user_id,
            'is_deleted': int(self.is_deleted or 0),
        }


class NetLeasedLineTask(db.Model):
    """전용회선 작업이력 (1:N)

    작업이력(tab11-task)에서 CRUD.
    - 소프트 삭제: is_deleted
    - 날짜/시간은 UI 입력 포맷(YYYY-MM-DD HH:MM)을 그대로 저장(TEXT)
    """

    __tablename__ = 'net_leased_line_task'
    __table_args__ = (
        db.Index('ix_net_leased_line_task_line_id', 'line_id'),
        db.Index('ix_net_leased_line_task_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    line_id = db.Column(db.Integer, db.ForeignKey('net_leased_line.id', ondelete='CASCADE'), nullable=False)

    status = db.Column(db.String(32))
    task_no = db.Column(db.String(128))
    name = db.Column(db.String(255))
    type = db.Column(db.String(64))
    category = db.Column(db.String(64))
    start = db.Column(db.String(32))
    end = db.Column(db.String(32))

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    updated_at = db.Column(db.Text)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    line = db.relationship('NetLeasedLine', lazy='joined')
    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'line_id': self.line_id,
            'status': self.status,
            'task_no': self.task_no,
            'name': self.name,
            'type': self.type,
            'category': self.category,
            'start': self.start,
            'end': self.end,
            'created_at': self.created_at,
            'created_by_user_id': self.created_by_user_id,
            'updated_at': self.updated_at,
            'updated_by_user_id': self.updated_by_user_id,
            'is_deleted': int(self.is_deleted or 0),
        }


class UiTaskHistory(db.Model):
    """Generic UI task history rows (tab11-task).

    Many detail pages share the same tab11-task UI markup/JS but do not have
    per-domain tables. This table stores task history rows scoped by:
    - scope_type: page path (e.g. /p/gov_vpn_policy_task)
    - scope_id: optional integer identifier when available
    - scope_ref: optional stable string reference (e.g. vpn_line_id=12 or a canonicalized query string)

    Notes:
    - soft delete: is_deleted
    - date/time is stored as TEXT as entered by UI
    """

    __tablename__ = 'ui_task_history'
    __table_args__ = (
        db.Index('ix_ui_task_history_scope', 'scope_type', 'scope_id', 'is_deleted'),
        db.Index('ix_ui_task_history_scope_ref', 'scope_type', 'scope_ref', 'is_deleted'),
        db.Index('ix_ui_task_history_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)

    scope_type = db.Column(db.String(255), nullable=False)
    scope_id = db.Column(db.Integer)
    scope_ref = db.Column(db.String(512))

    status = db.Column(db.String(32))
    task_no = db.Column(db.String(128))
    name = db.Column(db.String(255))
    type = db.Column(db.String(64))
    category = db.Column(db.String(64))
    start = db.Column(db.String(32))
    end = db.Column(db.String(32))

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    updated_at = db.Column(db.Text)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    created_by = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    updated_by = db.relationship('UserProfile', foreign_keys=[updated_by_user_id], lazy='joined')

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'scope_type': self.scope_type,
            'scope_id': self.scope_id,
            'scope_ref': self.scope_ref,
            'status': self.status,
            'task_no': self.task_no,
            'name': self.name,
            'type': self.type,
            'category': self.category,
            'start': self.start,
            'end': self.end,
            'created_at': self.created_at,
            'created_by_user_id': self.created_by_user_id,
            'updated_at': self.updated_at,
            'updated_by_user_id': self.updated_by_user_id,
            'is_deleted': int(self.is_deleted or 0),
        }


class DcAccessSystem(db.Model):
    """출입관리 시스템 (dc_access_system)"""

    __tablename__ = 'dc_access_system'
    __table_args__ = (
        db.Index('ix_dc_access_system_system_code', 'system_code'),
        db.Index('ix_dc_access_system_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)

    system_code = db.Column(db.String(255), nullable=False, unique=True)
    business_status_code = db.Column(db.Text, nullable=False)
    business_name = db.Column(db.Text, nullable=False)

    system_name = db.Column(db.Text, nullable=False)
    system_ip = db.Column(db.Text)
    manage_ip = db.Column(db.Text)

    manufacturer_name = db.Column(db.Text)
    system_model_name = db.Column(db.Text)
    serial_number = db.Column(db.Text)

    # NOTE: org_center is managed via a service-layer sqlite table (not ORM in this repo).
    # We keep this as plain TEXT in the ORM; FK constraint is enforced by Alembic migration.
    center_code = db.Column(db.Text)
    system_location = db.Column(db.Text)

    system_dept_code = db.Column(db.String(64), db.ForeignKey('org_department.dept_code'))
    system_manager_id = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    service_dept_code = db.Column(db.String(64), db.ForeignKey('org_department.dept_code'))
    service_manager_id = db.Column(db.Integer, db.ForeignKey('org_user.id'))

    remark = db.Column(db.Text)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    created_by = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    updated_at = db.Column(db.Text)
    updated_by = db.Column(db.Integer, db.ForeignKey('org_user.id'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    system_manager = db.relationship('UserProfile', foreign_keys=[system_manager_id], lazy='joined')
    service_manager = db.relationship('UserProfile', foreign_keys=[service_manager_id], lazy='joined')
    created_by_user = db.relationship('UserProfile', foreign_keys=[created_by], lazy='joined')
    updated_by_user = db.relationship('UserProfile', foreign_keys=[updated_by], lazy='joined')


class DcAccessZone(db.Model):
    """출입 권한 구역 정의 (access_zone)

    장소추가 모달에서 동적으로 생성/관리되는 구역(장소) 목록.
    """

    __tablename__ = 'access_zone'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    zone_name = db.Column(db.String(255), nullable=False)
    zone_key = db.Column(db.String(255), nullable=False, unique=True)
    sort_order = db.Column(db.Integer, nullable=False, server_default=db.text('0'))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))
    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))


class DcAccessPermissionZone(db.Model):
    """출입 권한-구역 매핑 (access_permission_zone)

    permission ↔ zone 간 O/X 값 저장 (M:N).
    """

    __tablename__ = 'access_permission_zone'
    __table_args__ = (
        db.UniqueConstraint('permission_id', 'zone_id', name='uq_perm_zone'),
    )

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    permission_id = db.Column(db.Integer, db.ForeignKey('access_permission.permission_id', ondelete='CASCADE'), nullable=False)
    zone_id = db.Column(db.Integer, db.ForeignKey('access_zone.id', ondelete='CASCADE'), nullable=False)
    value = db.Column(db.Text, nullable=False, server_default=db.text("'X'"))


class DcAccessPermission(db.Model):
    """출입 권한 등록 (access_permission)

    NOTE:
    - user_id -> org_user.id (UserProfile)
    - department_id -> org_department.id (OrgDepartment)
    - 날짜/시각은 기존 코드 스타일에 맞춰 TEXT(ISO/YYYY-MM-DD)로 저장한다.
    """

    __tablename__ = 'access_permission'
    __table_args__ = (
        db.Index('ix_access_permission_user_id', 'user_id'),
        db.Index('ix_access_permission_department_id', 'department_id'),
        db.Index('ix_access_permission_status', 'status'),
    )

    permission_id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='CASCADE'), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey('org_department.id', ondelete='CASCADE'), nullable=False)

    person_type = db.Column(db.Text)
    access_level = db.Column(db.Text)
    status = db.Column(db.String(64))
    remark = db.Column(db.Text)

    permission_start_date = db.Column(db.Text)
    permission_end_date = db.Column(db.Text)

    last_changed_at = db.Column(db.Text)
    last_changed_by = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))

    dc_future_room = db.Column(db.Text, nullable=False, server_default=db.text("'X'"))
    dc_future_control = db.Column(db.Text, nullable=False, server_default=db.text("'X'"))
    dc_eulji_room = db.Column(db.Text, nullable=False, server_default=db.text("'X'"))
    dc_disaster_room = db.Column(db.Text, nullable=False, server_default=db.text("'X'"))

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.Text)
    version = db.Column(db.Integer, nullable=False, server_default=db.text('1'))

    user = db.relationship('UserProfile', foreign_keys=[user_id], lazy='joined')
    department = db.relationship('OrgDepartment', foreign_keys=[department_id], lazy='joined')
    last_changed_by_user = db.relationship('UserProfile', foreign_keys=[last_changed_by], lazy='joined')


class DcAuthorityRecord(db.Model):
    """출입 권한 변경 기록 (dc_authority_record)

    권한 등록(access_permission) 데이터의 변경 이력(audit log).
    """

    __tablename__ = 'dc_authority_record'
    __table_args__ = (
        db.Index('ix_dc_authority_record_status', 'status'),
        db.Index('ix_dc_authority_record_change_type', 'change_type'),
    )

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    status = db.Column(db.String(64))              # 활성 / 만료
    change_datetime = db.Column(db.Text)            # YYYY-MM-DD HH:MM
    change_type = db.Column(db.String(64))          # 정보 수정 / 정보 삭제 / 신규 등록
    changed_by = db.Column(db.Text)                 # 변경자 이름
    manager = db.Column(db.Text)                    # 담당자 이름
    change_details = db.Column(db.Text)             # 변경내용 (여러 줄)
    change_reason = db.Column(db.Text)              # 변경사유
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))
    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.Text)


class UserMemoGroup(db.Model):
    """사용자 메모 그룹 (user_memo_group)

    - AuthUser 기준으로 개인별 그룹을 저장한다.
    - 그룹당 메모 최대 50개(서버 API에서 제한)
    - 그룹 최대 11개(서버 API에서 제한)
    """

    __tablename__ = 'user_memo_group'
    __table_args__ = (
        db.Index('ix_user_memo_group_owner_user_id', 'owner_user_id'),
        db.Index('ix_user_memo_group_is_deleted', 'is_deleted'),
        db.Index('ix_user_memo_group_owner_sort_order', 'owner_user_id', 'sort_order'),
    )

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    owner_user_id = db.Column(db.Integer, db.ForeignKey('auth_users.id', ondelete='CASCADE'), nullable=False)
    name = db.Column(db.Text, nullable=False)

    # Manual group ordering (lower first). '기본보기' remains pinned via API sorting.
    sort_order = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.Text)
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))


class UserMemo(db.Model):
    """사용자 메모 (user_memo)

    NOTE:
    - 본문은 현재 프론트 편집기에서 생성되는 텍스트(마크다운 유사)를 그대로 저장한다.
    """

    __tablename__ = 'user_memo'
    __table_args__ = (
        db.Index('ix_user_memo_owner_user_id', 'owner_user_id'),
        db.Index('ix_user_memo_group_id', 'group_id'),
        db.Index('ix_user_memo_group_sort_order', 'group_id', 'sort_order'),
        db.Index('ix_user_memo_updated_at', 'updated_at'),
        db.Index('ix_user_memo_created_at', 'created_at'),
        db.Index('ix_user_memo_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    group_id = db.Column(db.Integer, db.ForeignKey('user_memo_group.id', ondelete='CASCADE'), nullable=False)
    owner_user_id = db.Column(db.Integer, db.ForeignKey('auth_users.id', ondelete='CASCADE'), nullable=False)

    title = db.Column(db.Text)
    body = db.Column(db.Text)
    starred = db.Column(db.Integer, nullable=False, server_default=db.text('0'))
    pinned = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    # Manual layout order within group (lower first). Updated via drag & drop.
    sort_order = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    created_at = db.Column(db.String(32), nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.String(32))
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))


class TickerMessage(db.Model):
    """전광판 메시지 (ticker_message)"""

    __tablename__ = 'ticker_message'
    __table_args__ = (
        db.Index('ix_ticker_message_sort_order', 'sort_order'),
        db.Index('ix_ticker_message_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    text = db.Column(db.Text, nullable=False)
    severity = db.Column(db.String(16), nullable=False, server_default=db.text("'info'"))  # info | warn | crit
    sort_order = db.Column(db.Integer, nullable=False, server_default=db.text('0'))
    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.Text)
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))


class TickerConfig(db.Model):
    """전광판 설정 (ticker_config) — singleton row (id=1)"""

    __tablename__ = 'ticker_config'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    speed = db.Column(db.Integer, nullable=False, server_default=db.text('35'))   # animation seconds
    paused = db.Column(db.Integer, nullable=False, server_default=db.text('0'))   # 0=playing, 1=paused
    updated_at = db.Column(db.Text)


class SmtpConfig(db.Model):
    """SMTP 메일 설정 (smtp_config) — singleton row (id=1)"""

    __tablename__ = 'smtp_config'

    id          = db.Column(db.Integer, primary_key=True, autoincrement=True)
    host        = db.Column(db.Text, nullable=False, server_default=db.text("'smtp.gmail.com'"))
    port        = db.Column(db.Integer, nullable=False, server_default=db.text('587'))
    encryption  = db.Column(db.Text, nullable=False, server_default=db.text("'STARTTLS'"))  # STARTTLS / SSL / NONE
    username    = db.Column(db.Text, nullable=False, server_default=db.text("''"))
    password    = db.Column(db.Text, nullable=False, server_default=db.text("''"))
    from_name   = db.Column(db.Text, nullable=False, server_default=db.text("'Blossom'"))
    from_email  = db.Column(db.Text, nullable=False, server_default=db.text("''"))  # 별도 발신 주소 (비어있으면 username 사용)
    use_auth    = db.Column(db.Boolean, nullable=False, server_default=db.text('1'))  # 인증 사용 여부 (사내 릴레이는 False)
    verify_cert = db.Column(db.Boolean, nullable=False, server_default=db.text('1'))  # SSL 인증서 검증 (자체서명 시 False)
    reply_to    = db.Column(db.Text, nullable=False, server_default=db.text("''"))  # 회신 주소 (비어있으면 미설정)
    updated_at  = db.Column(db.Text)


class SmsConfig(db.Model):
    """CoolSMS 발송 설정 (sms_config) — singleton row (id=1)"""

    __tablename__ = 'sms_config'

    id            = db.Column(db.Integer, primary_key=True, autoincrement=True)
    provider      = db.Column(db.Text, nullable=False, server_default=db.text("'coolsms'"))   # coolsms 등
    api_key       = db.Column(db.Text, nullable=False, server_default=db.text("''"))
    api_secret    = db.Column(db.Text, nullable=False, server_default=db.text("''"))
    sender_number = db.Column(db.Text, nullable=False, server_default=db.text("''"))           # 발신번호 (사전 등록 필수)
    enabled       = db.Column(db.Boolean, nullable=False, server_default=db.text('0'))
    updated_at    = db.Column(db.Text)


class MfaConfig(db.Model):
    """다중 인증(MFA) 전역 설정 (mfa_config) — singleton row (id=1)"""

    __tablename__ = 'mfa_config'

    id                   = db.Column(db.Integer, primary_key=True, autoincrement=True)
    enabled              = db.Column(db.Boolean, nullable=False, server_default=db.text('0'))   # MFA 사용 여부
    default_type         = db.Column(db.Text, nullable=False, server_default=db.text("'totp'"))  # totp / sms / email
    totp_enabled         = db.Column(db.Boolean, nullable=False, server_default=db.text('1'))   # OTP 인증 활성화
    sms_enabled          = db.Column(db.Boolean, nullable=False, server_default=db.text('1'))   # SMS 인증 활성화
    email_enabled        = db.Column(db.Boolean, nullable=False, server_default=db.text('1'))   # 이메일 인증 활성화
    company_otp_enabled  = db.Column(db.Boolean, nullable=False, server_default=db.text('0'))   # 사내 OTP 인증 활성화
    grace_period_days    = db.Column(db.Integer, nullable=False, server_default=db.text('0'))    # 유예 기간(일)
    remember_device_days = db.Column(db.Integer, nullable=False, server_default=db.text('7'))    # 디바이스 기억 유지(일)
    totp_secret          = db.Column(db.Text, nullable=False, server_default=db.text("''"))      # TOTP 시크릿 키
    sms_number           = db.Column(db.Text, nullable=False, server_default=db.text("''"))      # SMS 기본 수신 번호
    email                = db.Column(db.Text, nullable=False, server_default=db.text("''"))      # 이메일 MFA 수신 주소
    allow_user_choice    = db.Column(db.Boolean, nullable=False, server_default=db.text('1'))    # 로그인 시 사용자가 인증 방식 선택 허용
    code_length          = db.Column(db.Integer, nullable=False, server_default=db.text('6'))    # 인증 코드 자릿수
    code_ttl_seconds     = db.Column(db.Integer, nullable=False, server_default=db.text('300'))  # 코드 유효 시간(초)
    updated_at           = db.Column(db.Text)


class CompanyOtpConfig(db.Model):
    """사내 OTP 솔루션 연동 설정 (company_otp_config) — singleton row (id=1)

    지원 프로바이더: initech (이니텍/INISAFE), dreamsecurity (드림시큐리티/MagicOTP),
                   miraetech (미래테크/SafeOTP)
    """

    __tablename__ = 'company_otp_config'

    id            = db.Column(db.Integer, primary_key=True, autoincrement=True)
    provider      = db.Column(db.Text, nullable=False, server_default=db.text("'initech'"))   # initech / dreamsecurity / miraetech
    api_endpoint  = db.Column(db.Text, nullable=False, server_default=db.text("''"))           # OTP 서버 API URL
    api_key       = db.Column(db.Text, nullable=False, server_default=db.text("''"))           # API 키 또는 클라이언트 ID
    api_secret    = db.Column(db.Text, nullable=False, server_default=db.text("''"))           # API 시크릿 또는 인증서 비밀번호
    server_code   = db.Column(db.Text, nullable=False, server_default=db.text("''"))           # OTP 서버 식별 코드 (cp_code 등)
    timeout       = db.Column(db.Integer, nullable=False, server_default=db.text('5'))          # API 타임아웃 (초)
    enabled       = db.Column(db.Boolean, nullable=False, server_default=db.text('0'))
    updated_at    = db.Column(db.Text)


class MfaPendingCode(db.Model):
    """MFA 인증 대기 코드 (일회용, 로그인 시 생성)"""

    __tablename__ = 'mfa_pending_codes'

    id         = db.Column(db.Integer, primary_key=True, autoincrement=True)
    emp_no     = db.Column(db.String(30), nullable=False, index=True)
    mfa_type   = db.Column(db.String(20), nullable=False)  # totp / sms / email / company_otp
    code       = db.Column(db.String(10), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)
    used       = db.Column(db.Boolean, default=False)


# ── 워크플로우 디자이너 ──────────────────────────────────────────────

def _uuid():
    return str(uuid.uuid4())


class WfDesign(db.Model):
    """워크플로우 설계도 (wf_design)

    React Flow 캔버스로 제작한 워크플로우 정의를 저장.
    실제 노드/엣지 JSON 은 WfDesignVersion.definition_json 에 보관.
    """

    __tablename__ = 'wf_design'
    __table_args__ = (
        db.Index('ix_wf_design_owner_user_id', 'owner_user_id'),
        db.Index('ix_wf_design_status', 'status'),
        db.Index('ix_wf_design_is_deleted', 'is_deleted'),
    )

    id               = db.Column(db.String(36), primary_key=True, default=_uuid)
    name             = db.Column(db.Text, nullable=False)
    description      = db.Column(db.Text)
    owner_user_id    = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    status           = db.Column(db.String(20), nullable=False, server_default=db.text("'draft'"))  # draft / active / archived
    latest_version   = db.Column(db.Integer, nullable=False, server_default=db.text('0'))
    thumbnail        = db.Column(db.Text)  # base64 미니 썸네일 (선택)
    shared           = db.Column(db.Integer, nullable=False, server_default=db.text('0'))  # 0=비공개, 1=공유(탐색에 표시)
    like_count       = db.Column(db.Integer, nullable=False, server_default=db.text('0'))
    view_count       = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    editing_user_id  = db.Column(db.Integer)   # 편집 중인 사용자 ID (NULL=잠금 없음)
    editing_since    = db.Column(db.Text)       # 편집 시작 시각 (ISO)
    live_definition  = db.Column(db.Text)       # 실시간 편집 상태 JSON (라이브 동기화용)

    created_at       = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    updated_at       = db.Column(db.Text)
    is_deleted       = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    # Relationships
    owner    = db.relationship('UserProfile', foreign_keys=[owner_user_id], lazy='joined')
    versions = db.relationship(
        'WfDesignVersion',
        back_populates='workflow',
        cascade='all, delete-orphan',
        lazy='selectin',
        order_by='WfDesignVersion.version.desc()',
    )


class WfDesignVersion(db.Model):
    """워크플로우 설계 버전 (wf_design_version)

    각 저장 시점의 React Flow 상태(nodes, edges, viewport) 를 JSON 으로 보관.
    """

    __tablename__ = 'wf_design_version'
    __table_args__ = (
        db.Index('ix_wf_design_version_workflow_id', 'workflow_id'),
    )

    id               = db.Column(db.String(36), primary_key=True, default=_uuid)
    workflow_id      = db.Column(db.String(36), db.ForeignKey('wf_design.id', ondelete='CASCADE'), nullable=False)
    version          = db.Column(db.Integer, nullable=False)
    definition_json  = db.Column(db.Text, nullable=False)  # JSON: { nodes, edges, viewport }
    created_by       = db.Column(db.Integer, db.ForeignKey('org_user.id'), nullable=False)
    created_at       = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    save_type        = db.Column(db.String(10), nullable=False, server_default='manual')  # 'manual' | 'auto'

    # Relationships
    workflow   = db.relationship('WfDesign', back_populates='versions')
    creator    = db.relationship('UserProfile', foreign_keys=[created_by], lazy='joined')


class WfDesignLike(db.Model):
    """워크플로우 좋아요 (wf_design_like)"""

    __tablename__ = 'wf_design_like'
    __table_args__ = (
        db.UniqueConstraint('workflow_id', 'user_id', name='uq_wf_like'),
        db.Index('ix_wf_like_workflow', 'workflow_id'),
        db.Index('ix_wf_like_user', 'user_id'),
    )

    id           = db.Column(db.Integer, primary_key=True, autoincrement=True)
    workflow_id  = db.Column(db.String(36), db.ForeignKey('wf_design.id', ondelete='CASCADE'), nullable=False)
    user_id      = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='CASCADE'), nullable=False)
    created_at   = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))


class WfDesignView(db.Model):
    """워크플로우 조회 기록 (wf_design_view)"""

    __tablename__ = 'wf_design_view'
    __table_args__ = (
        db.UniqueConstraint('workflow_id', 'user_id', name='uq_wf_view'),
        db.Index('ix_wf_view_workflow', 'workflow_id'),
    )

    id           = db.Column(db.Integer, primary_key=True, autoincrement=True)
    workflow_id  = db.Column(db.String(36), db.ForeignKey('wf_design.id', ondelete='CASCADE'), nullable=False)
    user_id      = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='CASCADE'), nullable=False)
    created_at   = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))


class WfDesignComment(db.Model):
    """워크플로우 댓글 (wf_design_comment)"""

    __tablename__ = 'wf_design_comment'
    __table_args__ = (
        db.Index('ix_wf_comment_workflow', 'workflow_id'),
        db.Index('ix_wf_comment_parent', 'parent_id'),
        db.Index('ix_wf_comment_created_by', 'created_by_user_id'),
        db.Index('ix_wf_comment_is_deleted', 'is_deleted'),
    )

    id                = db.Column(db.Integer, primary_key=True, autoincrement=True)
    workflow_id       = db.Column(db.String(36), db.ForeignKey('wf_design.id', ondelete='CASCADE'), nullable=False)
    parent_id         = db.Column(db.Integer, db.ForeignKey('wf_design_comment.id', ondelete='CASCADE'), nullable=True)
    content           = db.Column(db.Text, nullable=False)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='SET NULL'))
    created_at        = db.Column(db.DateTime, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    is_deleted        = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    author = db.relationship('UserProfile', foreign_keys=[created_by_user_id], lazy='joined')
    parent = db.relationship('WfDesignComment', remote_side=[id], uselist=False)

    def to_item(self):
        name = ''
        avatar = ''
        try:
            if self.author:
                name = (self.author.name or self.author.emp_no or '').strip()
                avatar = (getattr(self.author, 'profile_image', '') or '').strip()
        except Exception:
            pass
        return {
            'id': self.id,
            'workflowId': self.workflow_id,
            'parentId': self.parent_id,
            'content': self.content,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'authorId': self.created_by_user_id,
            'authorName': name,
            'authorAvatarUrl': avatar,
        }


# ──────────────────────────────────────────────────────────────
# 변경이력(Change Event / Change Diff) — tab14-log 중앙 집중 이력
# ──────────────────────────────────────────────────────────────

class ChangeEvent(db.Model):
    """변경 이벤트 헤더 (change_event)

    tab01~tab99 페이지에서 발생한 모든 변경사항을 중앙에서 기록한다.
    section_key = normalize(title|subtitle) 기준으로 그룹핑한다.
    """

    __tablename__ = 'change_event'
    __table_args__ = (
        db.Index('ix_ce_occurred', 'occurred_at'),
        db.Index('ix_ce_entity', 'entity_type', 'entity_id'),
        db.Index('ix_ce_section', 'section_key'),
        db.Index('ix_ce_page', 'page_key'),
        db.Index('ix_ce_request', 'request_id'),
    )

    id           = db.Column(db.Integer, primary_key=True, autoincrement=True)
    occurred_at  = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    actor_id     = db.Column(db.String(80), nullable=True)
    actor_name   = db.Column(db.String(120), nullable=True)
    actor_ip     = db.Column(db.String(45), nullable=True)
    action_type  = db.Column(db.String(20), nullable=False, default='UPDATE')  # CREATE/UPDATE/DELETE/BULK_UPDATE/ATTACHMENT/COMMENT
    page_key     = db.Column(db.String(120), nullable=True)   # tab01-xxx ~ tab99-yyy
    section_key  = db.Column(db.String(250), nullable=True)   # normalize(title|subtitle)
    title        = db.Column(db.String(200), nullable=True)
    subtitle     = db.Column(db.String(200), nullable=True)
    entity_type  = db.Column(db.String(80), nullable=True)    # server, storage, …
    entity_id    = db.Column(db.String(120), nullable=True)
    request_id   = db.Column(db.String(64), nullable=True)    # 중복 기록 방지(idempotency)
    summary      = db.Column(db.String(500), nullable=True)   # "CPU: 8→16, RAM: 32→64"
    extra_json   = db.Column(db.Text, nullable=True)          # 확장 필드(JSON)

    # relationships
    diffs = db.relationship('ChangeDiff', back_populates='event', cascade='all, delete-orphan', lazy='selectin')


class ChangeDiff(db.Model):
    """변경 diff 라인 (change_diff)

    ChangeEvent 에 속한 개별 필드 변경 기록.
    """

    __tablename__ = 'change_diff'
    __table_args__ = (
        db.Index('ix_cd_event', 'event_id'),
        db.Index('ix_cd_field', 'field'),
    )

    id           = db.Column(db.Integer, primary_key=True, autoincrement=True)
    event_id     = db.Column(db.Integer, db.ForeignKey('change_event.id', ondelete='CASCADE'), nullable=False)
    field        = db.Column(db.String(120), nullable=False)
    old_value    = db.Column(db.Text, nullable=True)
    new_value    = db.Column(db.Text, nullable=True)
    value_type   = db.Column(db.String(20), nullable=True, default='string')  # string/number/json/boolean/date
    is_sensitive = db.Column(db.Boolean, nullable=False, default=False)

    # relationships
    event = db.relationship('ChangeEvent', back_populates='diffs')


# ──────────────────────────────────────────────────────────────
# 알림 (Notification)
# ──────────────────────────────────────────────────────────────

class SysNotification(db.Model):
    """시스템 알림 레코드 (sys_notification)

    noti_type 값:
      - ticket_status : 티켓 상태 변경
      - task_status   : 작업 상태 변경
      - calendar_24h  : 일정 24시간 전 알림
      - calendar_1h   : 일정 1시간 전 알림
    ref_type 값: ticket / task / calendar
    """
    __tablename__ = 'sys_notification'
    __table_args__ = (
        db.Index('ix_sys_notification_user', 'user_id', 'is_read', 'created_at'),
        db.Index('ix_sys_notification_ref', 'ref_type', 'ref_id'),
        db.Index('ix_sys_notification_trigger', 'trigger_at'),
    )

    id         = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id    = db.Column(db.Integer, db.ForeignKey('org_user.id', ondelete='CASCADE'), nullable=False)
    noti_type  = db.Column(db.String(32), nullable=False)   # ticket_status / task_status / calendar_24h / calendar_1h
    ref_type   = db.Column(db.String(32), nullable=False)   # ticket / task / calendar
    ref_id     = db.Column(db.Integer, nullable=False)       # 참조 대상 PK
    title      = db.Column(db.String(255), nullable=False)
    message    = db.Column(db.Text)
    link       = db.Column(db.String(512))                   # 클릭 시 이동할 URL
    is_read    = db.Column(db.Boolean, nullable=False, default=False)
    read_at    = db.Column(db.DateTime)
    trigger_at = db.Column(db.DateTime, nullable=False)      # 알림 노출 시각 (캘린더 리마인더는 미래 시각)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    user = db.relationship('UserProfile', foreign_keys=[user_id], lazy='joined')


class PageTabConfig(db.Model):
    """페이지 탭 설정 (page_tab_config) — 공통 탭 메타데이터"""

    __tablename__ = 'page_tab_config'
    __table_args__ = (
        db.UniqueConstraint('page_code', 'tab_code', name='uq_page_tab_config_page_tab'),
        db.Index('ix_page_tab_config_page_code', 'page_code'),
        db.Index('ix_page_tab_config_is_active', 'is_active'),
        db.Index('ix_page_tab_config_is_deleted', 'is_deleted'),
    )

    id              = db.Column(db.Integer, primary_key=True, autoincrement=True)
    page_code       = db.Column(db.String(64), nullable=False)
    tab_code        = db.Column(db.String(64), nullable=False)
    tab_name        = db.Column(db.String(128), nullable=False)
    tab_order       = db.Column(db.Integer, nullable=False, server_default=db.text('0'))
    is_active       = db.Column(db.Integer, nullable=False, server_default=db.text('1'))
    description     = db.Column(db.Text)
    created_by      = db.Column(db.String(64))
    updated_by      = db.Column(db.String(64))
    tab_color       = db.Column(db.String(32))
    permission_code = db.Column(db.String(64))
    route_key       = db.Column(db.String(128))
    extra_options   = db.Column(db.Text)
    tab_image       = db.Column(db.String(512))
    created_at      = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    updated_at      = db.Column(db.Text)
    is_deleted      = db.Column(db.Integer, nullable=False, server_default=db.text('0'))


# ──────────────────────────────────────────────────────────────
# 브랜드 설정 (Brand Settings) — key/value 구조
# ──────────────────────────────────────────────────────────────

class BrandSetting(db.Model):
    """브랜드 설정 (brand_setting) — key/value 구조로 헤더·대시보드 브랜딩 관리"""

    __tablename__ = 'brand_setting'
    __table_args__ = (
        db.Index('ix_brand_setting_category', 'category'),
        db.Index('ix_brand_setting_is_deleted', 'is_deleted'),
    )

    id         = db.Column(db.Integer, primary_key=True, autoincrement=True)
    category   = db.Column(db.String(64), nullable=False)   # header / dashboard / general
    key        = db.Column(db.String(128), nullable=False, unique=True)
    value      = db.Column(db.Text)                          # 텍스트 또는 이미지 경로
    value_type = db.Column(db.String(20), nullable=False, server_default=db.text("'text'"))  # text / image
    updated_by = db.Column(db.String(64))
    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.Text)
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))


# ──────────────────────────────────────────────────────────────
# SAN Zone 구성 (tab33) — SAN 디렉터/스위치 상세 탭
# ──────────────────────────────────────────────────────────────

class HwSanZone(db.Model):
    """SAN Zone (hw_san_zone) — SAN 디렉터/스위치 상세: 존 구성 탭(tab33)

    NOTE:
    - asset_id 는 hardware_asset.db(서비스 레이어 sqlite) 기준 id 를 참조하는 정수값입니다.
        (메인 DB와 분리된 DB일 수 있어 FK 제약은 두지 않습니다.)
    - 소프트 삭제: is_deleted
    """

    __tablename__ = 'hw_san_zone'
    __table_args__ = (
        db.Index('ix_hw_san_zone_asset', 'asset_category', 'asset_id', 'is_deleted'),
        db.Index('ix_hw_san_zone_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)

    asset_category = db.Column(db.String(32), nullable=False)
    asset_id = db.Column(db.Integer, nullable=False)

    zone_name = db.Column(db.Text, nullable=False)
    entry_type = db.Column(db.String(10), server_default=db.text("'zone'"))   # cfg / zone / alias
    fabric = db.Column(db.Text)
    status = db.Column(db.String(16), server_default=db.text("'Active'"))
    remark = db.Column(db.Text)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.Text)
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

    members = db.relationship('HwSanZoneMember', backref='zone', lazy='dynamic')


class HwSanZoneMember(db.Model):
    """SAN Zone 멤버 (hw_san_zone_member) — Initiator / Target WWN 매핑

    role: 'initiator' | 'target'
    """

    __tablename__ = 'hw_san_zone_member'
    __table_args__ = (
        db.Index('ix_hw_san_zone_member_zone', 'zone_id', 'is_deleted'),
        db.Index('ix_hw_san_zone_member_is_deleted', 'is_deleted'),
    )

    id = db.Column(db.Integer, primary_key=True)
    zone_id = db.Column(db.Integer, db.ForeignKey('hw_san_zone.id'), nullable=False)

    role = db.Column(db.String(16), nullable=False)  # initiator / target
    alias = db.Column(db.Text)
    wwn = db.Column(db.Text)

    created_at = db.Column(db.Text, nullable=False, server_default=db.text('CURRENT_TIMESTAMP'))
    updated_at = db.Column(db.Text)
    is_deleted = db.Column(db.Integer, nullable=False, server_default=db.text('0'))

