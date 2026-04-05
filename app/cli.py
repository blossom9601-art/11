import click
from flask.cli import with_appcontext
from datetime import date
from decimal import Decimal
from app.models import db, Company, Employee, Server, Storage, Network, Software, Maintenance, Project, Task, AuthUser, AuthRole


def _gen_temp_password(length: int = 14) -> str:
    """Generate a temporary password for manual reset.

    Notes:
    - Keep it reasonably strong and ASCII-only.
    - Return value is meant to be shown once to the operator.
    """
    import secrets
    import string

    length = max(int(length or 14), 12)
    alphabet = string.ascii_letters + string.digits
    specials = "!@#$%^&*"  # avoid quotes/backslashes for shell safety
    # Ensure at least 1 special and 1 digit.
    core = [secrets.choice(alphabet) for _ in range(length - 2)]
    core.append(secrets.choice(string.digits))
    core.append(secrets.choice(specials))
    secrets.SystemRandom().shuffle(core)
    return ''.join(core)

@click.command('init-db')
@with_appcontext
def init_db_command():
    """데이터베이스 테이블을 생성합니다."""
    db.create_all()
    click.echo('데이터베이스 테이블이 생성되었습니다.')

@click.command('seed-db')
@with_appcontext
def seed_db_command():
    """샘플 데이터를 데이터베이스에 추가합니다."""
    # 샘플 회사 추가 (idempotent)
    company = Company.query.filter_by(name='샘플 회사').first()
    if not company:
        company = Company(
            name='샘플 회사',
            business_number='123-45-67890',
            address='서울시 강남구 테헤란로 123',
            phone='02-1234-5678',
            email='info@sample.com'
        )
        db.session.add(company)
        db.session.flush()  # company.id 확보
    
    # 샘플 직원 추가
    employee = Employee.query.filter_by(employee_id='EMP001').first()
    if not employee:
        employee = Employee(
            company_id=company.id,
            name='홍길동',
            employee_id='EMP001',
            department='IT팀',
            position='시스템 관리자',
            email='hong@sample.com',
            phone='010-1234-5678'
        )
        db.session.add(employee)
    
    # 샘플 서버 추가
    server = Server.query.filter_by(company_id=company.id, name='웹서버-01').first()
    if not server:
        server = Server(
            company_id=company.id,
            name='웹서버-01',
            ip_address='192.168.1.100',
            hostname='web-server-01',
            os_type='Ubuntu 20.04',
            cpu='Intel Xeon E5-2680 v4',
            memory='32GB',
            storage='1TB SSD',
            status='active',
            location='데이터센터 A',
            rack_position='A-01'
        )
        db.session.add(server)
    
    # 위에서 추가한 employee/server의 id가 필요하므로 flush로 PK를 미리 획득
    db.session.flush()
    
    # 샘플 스토리지 추가
    storage = Storage.query.filter_by(company_id=company.id, name='NAS-01').first()
    if not storage:
        storage = Storage(
            company_id=company.id,
            name='NAS-01',
            type='NAS',
            capacity='10TB',
            used_capacity='3TB',
            ip_address='192.168.1.200',
            location='데이터센터 A',
            status='active'
        )
        db.session.add(storage)
    
    # 샘플 네트워크 추가
    network = Network.query.filter_by(company_id=company.id, name='사무실 네트워크').first()
    if not network:
        network = Network(
            company_id=company.id,
            name='사무실 네트워크',
            ip_range='192.168.1.0/24',
            subnet_mask='255.255.255.0',
            gateway='192.168.1.1',
            dns_servers='8.8.8.8, 8.8.4.4',
            vlan_id=100,
            status='active'
        )
        db.session.add(network)
    
    # 샘플 소프트웨어 추가
    software = Software.query.filter_by(company_id=company.id, name='MySQL', version='8.0.33').first()
    if not software:
        software = Software(
            company_id=company.id,
            name='MySQL',
            version='8.0.33',
            type='Database',
            license_key='MYSQL-123456789',
            server_id=server.id,
            status='active'
        )
        db.session.add(software)
    
    # 샘플 유지보수 추가
    maintenance = Maintenance.query.filter_by(company_id=company.id, title='서버 정기점검').first()
    if not maintenance:
        maintenance = Maintenance(
            company_id=company.id,
            title='서버 정기점검',
            description='월간 서버 정기점검 및 업데이트',
            type='inspection',
            vendor='IT서비스업체',
            start_date=date.fromisoformat('2024-01-15'),
            end_date=date.fromisoformat('2024-01-15'),
            cost=Decimal('500000.00'),
            status='active'
        )
        db.session.add(maintenance)
    
    # 샘플 프로젝트 추가
    project = Project.query.filter_by(company_id=company.id, name='시스템 업그레이드 프로젝트').first()
    if not project:
        project = Project(
            company_id=company.id,
            name='시스템 업그레이드 프로젝트',
            description='기존 시스템을 최신 버전으로 업그레이드',
            start_date=date.fromisoformat('2024-02-01'),
            end_date=date.fromisoformat('2024-03-31'),
            status='planning',
            priority='high'
        )
        db.session.add(project)
        
        # project의 id가 필요하므로 flush로 PK를 미리 획득
        db.session.flush()
    
    # 샘플 작업 추가
    task = Task.query.filter_by(project_id=project.id, title='시스템 분석').first()
    if not task:
        task = Task(
            project_id=project.id,
            title='시스템 분석',
            description='현재 시스템 상태 분석 및 업그레이드 계획 수립',
            assigned_to=employee.id,
            start_date=date.fromisoformat('2024-02-01'),
            due_date=date.fromisoformat('2024-02-15'),
            status='pending',
            priority='high'
        )
        db.session.add(task)
    
    db.session.commit()
    click.echo('샘플 데이터가 추가되었습니다.')

    # ------------------------------------------------------------------
    # 인증 사용자 샘플 10건(idempotent)
    # 사번: TEST0001 ~ TEST0010 / 랜덤 비밀번호 생성 / 역할: user
    # 이미 존재하면 건너뜀
    # ------------------------------------------------------------------
    created_count = 0
    created_credentials = []
    from app.models import AuthUser
    for i in range(1, 11):
        emp_no = f'TEST{str(i).zfill(4)}'
        existing = AuthUser.query.filter_by(emp_no=emp_no).first()
        if existing:
            continue
        temp_pw = _gen_temp_password()
        user = AuthUser(
            emp_no=emp_no,
            email=f'user{i}@sample.com',
            role='user',
            status='active'
        )
        user.set_password(temp_pw)
        db.session.add(user)
        created_credentials.append((emp_no, temp_pw))
        created_count += 1
    if created_count:
        db.session.commit()
        click.echo(f'인증 사용자 샘플 {created_count}건 생성 완료 (총 10 목표).')
        click.echo('─── 생성된 계정 임시 비밀번호 (최초 1회만 표시) ───')
        for _emp, _pw in created_credentials:
            click.echo(f'  {_emp}: {_pw}')
        click.echo('─── 반드시 즉시 비밀번호를 변경하세요 ───')
    else:
        click.echo('인증 사용자 샘플은 이미 모두 존재합니다.')

@click.command('reset-db')
@with_appcontext
def reset_db_command():
    """데이터베이스를 초기화합니다."""
    db.drop_all()
    db.create_all()
    click.echo('데이터베이스가 초기화되었습니다.')

@click.command('create-admin')
@click.option('--emp-no', help='관리자 사번 (비대화형)', required=False)
@click.option('--password', help='관리자 비밀번호 (비대화형)', required=False)
@click.option('--email', help='관리자 이메일 (선택)', required=False, default='')
@with_appcontext
def create_admin_command(emp_no, password, email):
    """관리자 계정을 생성합니다. 대화형 또는 비대화형(옵션 제공)으로 사용 가능합니다."""
    # 옵션이 없으면 대화형 입력으로 대체
    if not emp_no:
        emp_no = click.prompt('사번을 입력하세요')
    if not password:
        password = click.prompt('비밀번호를 입력하세요', hide_input=True)
    if email is None:
        email = click.prompt('이메일을 입력하세요 (선택사항)', default='')
    
    # 기존 사용자 확인
    existing_user = AuthUser.query.filter_by(emp_no=emp_no).first()
    if existing_user:
        click.echo('이미 존재하는 사번입니다.')
        return
    
    # 관리자 사용자 생성
    user = AuthUser(
        emp_no=emp_no,
        email=email,
        role='admin',
        status='active'
    )
    user.set_password(password)
    
    db.session.add(user)
    db.session.commit()
    click.echo(f'관리자 계정이 생성되었습니다. (사번: {emp_no})')

@click.command('create-user')
@click.option('--emp-no', help='사용자 사번 (비대화형)', required=False)
@click.option('--password', help='사용자 비밀번호 (비대화형)', required=False)
@click.option('--email', help='사용자 이메일 (선택)', required=False, default='')
@with_appcontext
def create_user_command(emp_no, password, email):
    """일반 사용자 계정을 생성합니다. 대화형 또는 비대화형(옵션 제공) 사용 가능."""
    # 옵션이 없으면 대화형 입력으로 대체
    if not emp_no:
        emp_no = click.prompt('사번을 입력하세요')
    if not password:
        password = click.prompt('비밀번호를 입력하세요', hide_input=True)
    if email is None:
        email = click.prompt('이메일을 입력하세요 (선택사항)', default='')

    # 기존 사용자 확인
    existing_user = AuthUser.query.filter_by(emp_no=emp_no).first()
    if existing_user:
        click.echo('이미 존재하는 사번입니다.')
        return

    # 일반 사용자 생성
    user = AuthUser(
        emp_no=emp_no,
        email=email,
        role='user',
        status='active'
    )
    user.set_password(password)

    db.session.add(user)
    db.session.commit()
    click.echo(f'사용자 계정이 생성되었습니다. (사번: {emp_no})')

@click.command('init-auth')
@with_appcontext
def init_auth_command():
    """인증 시스템을 초기화합니다."""
    # 기본 역할 생성
    roles = [
        {'role': 'admin', 'description': '시스템 관리자', 'permissions': 'all'},
        {'role': 'user', 'description': '일반 사용자', 'permissions': 'read'},
        {'role': 'auditor', 'description': '감사자', 'permissions': 'read,audit'}
    ]
    
    for role_data in roles:
        existing_role = AuthRole.query.filter_by(role=role_data['role']).first()
        if not existing_role:
            role = AuthRole(**role_data)
            db.session.add(role)
    
    db.session.commit()
    click.echo('인증 시스템이 초기화되었습니다.')


@click.command('reset-admin-password')
@click.option('--emp-no', help='대상 사번(미지정 시 관리자 1명일 때 자동 선택)', required=False, default='')
@click.option('--password', help='새 비밀번호(미지정 시 프롬프트/생성)', required=False, default='')
@click.option('--generate', is_flag=True, help='임시 비밀번호 자동 생성')
@click.option('--changed-by', help='변경자 식별자(히스토리 기록용)', required=False, default='system')
@with_appcontext
def reset_admin_password_command(emp_no, password, generate, changed_by):
    """관리자 계정 비밀번호를 초기화합니다.

    - AuthUser.role 이 admin/ADMIN/관리자 인 계정을 대상으로 합니다.
    - 계정 잠금/실패 카운트도 함께 초기화합니다.
    """
    role_set = ('admin', 'ADMIN', '관리자')

    target = None
    emp_no = (emp_no or '').strip()
    if emp_no:
        target = AuthUser.query.filter_by(emp_no=emp_no).first()
        if not target:
            raise click.ClickException(f'사용자를 찾을 수 없습니다: emp_no={emp_no}')
        if target.role not in role_set:
            raise click.ClickException(f'해당 사용자는 관리자 역할이 아닙니다: emp_no={emp_no}, role={target.role}')
    else:
        admins = AuthUser.query.filter(AuthUser.role.in_(role_set)).order_by(AuthUser.emp_no.asc()).all()
        if len(admins) == 1:
            target = admins[0]
        elif len(admins) == 0:
            raise click.ClickException('관리자 계정이 없습니다. 먼저 create-admin 명령으로 생성하세요.')
        else:
            raise click.ClickException('관리자 계정이 여러 개입니다. --emp-no 로 대상 사번을 지정하세요.')

    if generate:
        password = _gen_temp_password()
    password = (password or '').strip()
    if not password:
        password = click.prompt('새 비밀번호를 입력하세요', hide_input=True, confirmation_prompt=True)

    # Update password + unlock
    target.set_password(password)
    try:
        target.reset_fail_count()
    except Exception:
        # Backward/partial model compatibility
        target.login_fail_cnt = 0
        target.locked_until = None
    target.status = 'active'

    # Optional: update profile cache fields if org_user row exists
    try:
        from datetime import datetime
        from app.models import UserProfile, AuthPasswordHistory
        now = datetime.utcnow()
        profile = UserProfile.query.filter_by(emp_no=target.emp_no).first()
        if profile:
            profile.password_changed_at = now
            profile.locked = False
            profile.fail_cnt = 0
        # Password history
        try:
            hist = AuthPasswordHistory(
                emp_no=target.emp_no,
                password_hash=target.password_hash,
                changed_by=(changed_by or 'system')
            )
            db.session.add(hist)
        except Exception:
            pass
    except Exception:
        pass

    db.session.commit()
    click.echo(f'관리자 비밀번호가 초기화되었습니다: emp_no={target.emp_no}')
    click.echo(f'NEW_PASSWORD={password}')

def register_commands(app):
    """CLI 명령어들을 앱에 등록합니다."""
    app.cli.add_command(init_db_command)
    app.cli.add_command(seed_db_command)
    app.cli.add_command(reset_db_command)
    app.cli.add_command(create_admin_command)
    app.cli.add_command(create_user_command)
    app.cli.add_command(init_auth_command)
    app.cli.add_command(reset_admin_password_command)