"""AuthUser 기본 시드 스크립트.
ADMIN 및 TEST0001~TEST0010 계정을 생성합니다.
이미 레코드가 있으면 아무 작업도 하지 않습니다.
사용법 (PowerShell):
  C:/Users/ME/Desktop/blossom/.venv/Scripts/python.exe scripts/seed_auth_users.py
"""
import os
import sys

# 프로젝트 루트 경로를 PYTHONPATH에 추가 (scripts/에서 실행 시 상위 디렉터리 미포함 문제 해결)
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT_DIR not in sys.path:
    sys.path.append(ROOT_DIR)

from app import create_app
from app.models import db, AuthUser
from datetime import datetime

DEFAULT_ADMIN_PASSWORD = "Admin123!"
DEFAULT_TEST_PASSWORD = "Test123!"

ADMIN_EMAIL = "admin@example.com"
TEST_EMAIL_DOMAIN = "example.com"


def seed():
    app = create_app()
    with app.app_context():
        existing = AuthUser.query.count()
        if existing > 0:
            print(f"AuthUser already has {existing} rows; skipping seed.")
            return

        users = []
        # ADMIN 계정
        admin = AuthUser(emp_no="ADMIN", email=ADMIN_EMAIL, role="ADMIN", status="active")
        admin.set_password(DEFAULT_ADMIN_PASSWORD)
        admin.last_login_at = None
        users.append(admin)

        # TEST 계정들
        for i in range(1, 11):
            emp_no = f"TEST{str(i).zfill(4)}"
            email = f"{emp_no.lower()}@{TEST_EMAIL_DOMAIN}"
            u = AuthUser(emp_no=emp_no, email=email, role="USER", status="active")
            u.set_password(DEFAULT_TEST_PASSWORD)
            users.append(u)

        db.session.add_all(users)
        db.session.commit()
        print(f"Seeded {len(users)} auth users (ADMIN + TEST0001~TEST0010).")
        print("Default passwords: ADMIN=Admin123!, TEST=Test123! (변경 필요)")


if __name__ == "__main__":
    seed()
