"""강제 ADMIN DB 설정 스크립트
사용법 (PowerShell):
  C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/force_admin_db.py
동작:
  1) AuthUser 테이블에서 emp_no='ADMIN' 찾고 없으면 생성 (기본 비번 Admin123!)
  2) role 필드를 ADMIN으로 고정
  3) AuthRole (레거시 사이드바 권한) 테이블에 ADMIN 행 없으면 생성 (settings.read/write True 등)
  4) Role (신규 역할) 테이블에 ADMIN 행 없으면 생성 (전체 read/write True)
출력: JSON
"""
import os, sys, json
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.append(ROOT)
from app import create_app
from app.models import db, AuthUser, AuthRole, Role, UserProfile
from datetime import datetime

DEFAULT_PASS = 'Admin123!'

app = create_app()

out = {'auth_user': None, 'auth_role': None, 'role_table': None, 'user_profile': None, 'errors': []}
with app.app_context():
    # AuthUser
    au = AuthUser.query.filter_by(emp_no='ADMIN').first()
    if not au:
        au = AuthUser(emp_no='ADMIN', email='admin@example.com', role='ADMIN', status='active')
        au.set_password(DEFAULT_PASS)
        db.session.add(au)
        out['auth_user'] = 'created'
    else:
        changed = False
        if not au.role or au.role.upper() != 'ADMIN':
            au.role = 'ADMIN'; changed = True
        if changed:
            out['auth_user'] = 'updated_role_ADMIN'
        else:
            out['auth_user'] = 'exists'
    # AuthRole
    ar = AuthRole.query.filter_by(role='ADMIN').first()
    if not ar:
        perms = {
            'settings': {'read': True, 'write': True},
            'dashboard': {'read': True},
            'hardware': {'read': True},
            'software': {'read': True},
            'governance': {'read': True},
            'datacenter': {'read': True},
            'cost': {'read': True},
            'project': {'read': True},
            'category': {'read': True}
        }
        ar = AuthRole(role='ADMIN', description='Auto-seeded admin sidebar perms', permissions=json.dumps(perms, ensure_ascii=False))
        db.session.add(ar)
        out['auth_role'] = 'created'
    else:
        out['auth_role'] = 'exists'
    # Role table (새 권한 시스템)
    r = Role.query.filter_by(name='ADMIN').first()
    if not r:
        r = Role(name='ADMIN', description='최고 관리자',
                 dashboard_read=True, dashboard_write=True,
                 hardware_read=True, hardware_write=True,
                 software_read=True, software_write=True,
                 governance_read=True, governance_write=True,
                 datacenter_read=True, datacenter_write=True,
                 cost_read=True, cost_write=True,
                 project_read=True, project_write=True,
                 category_read=True, category_write=True)
        db.session.add(r)
        out['role_table'] = 'created'
    else:
        out['role_table'] = 'exists'

    # UserProfile (org_user) — required for allowed_ip policy at login
    # NOTE: In this app, allowed_ip is enforced unless it is explicitly '-' or '*'.
    # For local dev smoke checks, we make ADMIN unrestricted.
    up = UserProfile.query.filter_by(emp_no='ADMIN').first()
    if not up:
        up = UserProfile(emp_no='ADMIN', name='ADMIN', email='admin@example.com', role='ADMIN', allowed_ip='*')
        db.session.add(up)
        out['user_profile'] = 'created_allowed_ip_*'
    else:
        changed = False
        if not (up.allowed_ip or '').strip():
            up.allowed_ip = '*'; changed = True
        if (up.allowed_ip or '').strip() not in ('-', '*'):
            up.allowed_ip = '*'; changed = True
        if not up.role or str(up.role).upper() != 'ADMIN':
            up.role = 'ADMIN'; changed = True
        if not up.email:
            up.email = 'admin@example.com'; changed = True
        if not (up.name or '').strip() or (up.name or '').strip() == '-':
            up.name = 'ADMIN'; changed = True
        if changed:
            out['user_profile'] = 'updated_allowed_ip_*'
        else:
            out['user_profile'] = 'exists'
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        out['errors'].append(str(e))

print(json.dumps(out, ensure_ascii=False))
